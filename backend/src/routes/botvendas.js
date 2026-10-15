// botvendas.js — Monitoria de Atendimento (WhatsApp/BotVendas): atendimentos, conversa, satisfação.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const api = require('../lib/botvendasApi');
const sync = require('../lib/botvendasSync');
const monit = require('../lib/botvendasMonitoria');
const { normalizarLojas } = require('../lib/escopoCompras');

// Monta cláusula WHERE dos filtros (loja/vendedor/período/etc.) para os atendimentos.
function filtroAtend(req) {
  const cond = ['empresa_id=?']; const p = [req.usuario.empresa_id];
  const lojas = normalizarLojas(req.query.loja);
  if (lojas.length) { cond.push(`loja_id IN (${lojas.map(() => '?').join(',')})`); p.push(...lojas); }
  if (req.query.colaborador) { cond.push('colaborador_id=?'); p.push(req.query.colaborador); }
  if (req.query.vendedor) { cond.push('vendedor_nome=?'); p.push(req.query.vendedor); }
  if (req.query.canal) { cond.push('canal=?'); p.push(req.query.canal); }
  if (req.query.de) { cond.push("date(closed_at)>=date(?)"); p.push(req.query.de); }
  if (req.query.ate) { cond.push("date(closed_at)<=date(?)"); p.push(req.query.ate); }
  // Por padrão esconde os registros de LOGÍSTICA/entrega (não são atendimento humano).
  if (req.query.incluir_logistica !== '1') cond.push('logistica=0');
  return { where: cond.join(' AND '), p };
}

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Gerente', 'Subgerente'];
router.use(auth);

// Status da conexão + contadores.
router.get('/status', (req, res) => {
  const emp = req.usuario.empresa_id;
  const at = db.prepare("SELECT count(*) n, max(sincronizado_em) ult FROM botvendas_atendimentos WHERE empresa_id=?").get(emp);
  res.json({ habilitado: api.habilitado(), host: api.CFG.host || null, atendimentos: at.n, ultimaSync: at.ult });
});

router.post('/testar', exigePerfil(...GESTAO), async (req, res) => { res.json(await api.testar()); });

// Sincroniza atendimentos da API (finalizados por padrão).
router.post('/sincronizar', exigePerfil(...GESTAO), async (req, res) => {
  try {
    const r = await sync.sincronizarAtendimentos(req.usuario.empresa_id, { statuses: req.body.statuses || [4] });
    // Extrai vendedor + nota (CSAT) das conversas dos que ainda estão sem vendedor (lote).
    const pc = await sync.processarConversas(req.usuario.empresa_id, { limite: Number(req.body.processar) || 60 });
    res.json({ ...r, conversasProcessadas: pc.processados });
  } catch (e) { res.status(502).json({ erro: 'BotVendas indisponível: ' + e.message }); }
});

// Lista de atendimentos (do banco local) + resumo (satisfação, tempo, por vendedor).
router.get('/atendimentos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const cond = ['empresa_id=?']; const p = [emp];
  const lojas = normalizarLojas(req.query.loja);
  if (lojas.length) { cond.push(`loja_id IN (${lojas.map(() => '?').join(',')})`); p.push(...lojas); }
  if (req.query.colaborador) { cond.push('colaborador_id=?'); p.push(req.query.colaborador); }
  if (req.query.vendedor) { cond.push('vendedor_nome=?'); p.push(req.query.vendedor); }
  if (req.query.canal) { cond.push('canal=?'); p.push(req.query.canal); }
  if (req.query.de) { cond.push("date(closed_at)>=date(?)"); p.push(req.query.de); }
  if (req.query.ate) { cond.push("date(closed_at)<=date(?)"); p.push(req.query.ate); }
  if (req.query.notaMax) { cond.push('score IS NOT NULL AND score<=?'); p.push(Number(req.query.notaMax)); }
  if (req.query.busca) { cond.push('(cliente LIKE ? OR telefone LIKE ?)'); p.push('%' + req.query.busca + '%', '%' + req.query.busca + '%'); }
  if (req.query.incluir_logistica !== '1') cond.push('logistica=0'); // esconde logística/entrega
  const where = cond.join(' AND ');
  const linhas = db.prepare(`SELECT a.order_id, a.cliente, a.telefone, a.canal, a.vendedor_nome, a.colaborador_id, a.loja_id,
      a.score, a.ta_seconds, a.status, a.closed_at,
      (SELECT nota FROM botvendas_avaliacoes v WHERE v.empresa_id=a.empresa_id AND v.order_id=a.order_id) nota_ia,
      (SELECT 1 FROM botvendas_mensagens m WHERE m.empresa_id=a.empresa_id AND m.order_id=a.order_id LIMIT 1) tem_conversa
    FROM botvendas_atendimentos a WHERE ${where} ORDER BY a.closed_at DESC LIMIT 800`).all(...p);
  // Resumo
  const comNota = linhas.filter(l => l.score != null);
  const resumo = {
    total: linhas.length,
    satisfacaoMedia: comNota.length ? Math.round(comNota.reduce((s, l) => s + l.score, 0) / comNota.length * 100) / 100 : null,
    avaliados: comNota.length,
    tempoMedioSeg: linhas.length ? Math.round(linhas.reduce((s, l) => s + (l.ta_seconds || 0), 0) / linhas.length) : 0,
    ruins: comNota.filter(l => l.score <= 2).length,
  };
  // Por vendedor
  const porV = {};
  for (const l of linhas) {
    const k = l.vendedor_nome || '—';
    porV[k] = porV[k] || { vendedor: k, colaborador_id: l.colaborador_id, atendimentos: 0, somaNota: 0, comNota: 0, somaTempo: 0, ruins: 0 };
    porV[k].atendimentos++; porV[k].somaTempo += l.ta_seconds || 0;
    if (l.score != null) { porV[k].somaNota += l.score; porV[k].comNota++; if (l.score <= 2) porV[k].ruins++; }
  }
  const vendedores = Object.values(porV).map(v => ({
    vendedor: v.vendedor, colaborador_id: v.colaborador_id, atendimentos: v.atendimentos,
    satisfacao: v.comNota ? Math.round(v.somaNota / v.comNota * 100) / 100 : null,
    tempoMedioSeg: v.atendimentos ? Math.round(v.somaTempo / v.atendimentos) : 0, ruins: v.ruins,
  })).sort((a, b) => b.atendimentos - a.atendimentos);
  res.json({ linhas, resumo, vendedores });
});

// Conversa completa de um atendimento (busca da API e guarda em cache na 1ª vez) + avaliação da IA.
router.get('/atendimentos/:orderId/conversa', exigePerfil(...GESTAO), async (req, res) => {
  try {
    const r = await sync.conversa(req.usuario.empresa_id, Number(req.params.orderId), { forcar: req.query.forcar === '1' });
    r.avaliacao = monit.avaliacaoDe(req.usuario.empresa_id, Number(req.params.orderId));
    res.json(r);
  } catch (e) { res.status(502).json({ erro: 'BotVendas indisponível: ' + e.message }); }
});

// Avalia UM atendimento com IA (manual).
router.post('/atendimentos/:orderId/avaliar', exigePerfil(...GESTAO), async (req, res) => {
  try { res.json(await monit.avaliarAtendimento(req.usuario.empresa_id, Number(req.params.orderId), { auto: false })); }
  catch (e) { res.status(502).json({ erro: 'Falha na avaliação: ' + e.message }); }
});
// Avalia em lote os pendentes (fechados sem avaliação).
router.post('/avaliar-pendentes', exigePerfil(...GESTAO), async (req, res) => {
  try { res.json(await monit.avaliarPendentes(req.usuario.empresa_id, { limite: Number(req.body.limite) || 15 })); }
  catch (e) { res.status(502).json({ erro: 'Falha: ' + e.message }); }
});

// Painel de OPERAÇÃO: volume, TMA (tempo de atendimento), TPR (tempo de 1ª resposta), satisfação, por dia/hora.
router.get('/operacao', exigePerfil(...GESTAO), (req, res) => {
  const { where, p } = filtroAtend(req);
  const rows = db.prepare(`SELECT score, ta_seconds, resp_seconds, status, closed_at FROM botvendas_atendimentos WHERE ${where}`).all(...p);
  const comNota = rows.filter(r => r.score != null);
  const comResp = rows.filter(r => r.resp_seconds != null);
  const avg = (arr, f) => arr.length ? Math.round(arr.reduce((s, x) => s + f(x), 0) / arr.length) : 0;
  const porDia = {}, porHora = {};
  for (const r of rows) {
    if (!r.closed_at) continue;
    const dia = String(r.closed_at).slice(0, 10);
    porDia[dia] = porDia[dia] || { dia, n: 0, somaTa: 0 };
    porDia[dia].n++; porDia[dia].somaTa += r.ta_seconds || 0;
    const h = new Date(r.closed_at).getHours();
    porHora[h] = (porHora[h] || 0) + 1;
  }
  res.json({
    resumo: {
      volume: rows.length,
      tmaSeg: avg(rows, r => r.ta_seconds || 0),
      tprSeg: comResp.length ? avg(comResp, r => r.resp_seconds) : null,
      tprCobertura: rows.length ? Math.round(comResp.length / rows.length * 100) : 0,
      satisfacao: comNota.length ? Math.round(comNota.reduce((s, r) => s + r.score, 0) / comNota.length * 100) / 100 : null,
      taxaAvaliacao: rows.length ? Math.round(comNota.length / rows.length * 100) : 0,
      finalizados: rows.filter(r => r.status === 4).length,
      ruins: comNota.filter(r => r.score <= 2).length,
    },
    porDia: Object.values(porDia).sort((a, b) => a.dia.localeCompare(b.dia)).map(d => ({ dia: d.dia, n: d.n, tmaSeg: d.n ? Math.round(d.somaTa / d.n) : 0 })),
    porHora: Array.from({ length: 24 }, (_, h) => ({ hora: h, n: porHora[h] || 0 })),
  });
});

// ── Config da monitoria (auto ao fechar, nota de alerta, script de referência) ──
router.get('/config', exigePerfil(...GESTAO), (req, res) => {
  res.json({ config: monit.getConfig(req.usuario.empresa_id) });
});
router.put('/config', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body;
  db.prepare(`INSERT INTO botvendas_config (empresa_id, auto, nota_alerta, script_ref, atualizado_em) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id) DO UPDATE SET auto=excluded.auto, nota_alerta=excluded.nota_alerta, script_ref=excluded.script_ref, atualizado_em=datetime('now')`)
    .run(req.usuario.empresa_id, b.auto ? 1 : 0, Number(b.nota_alerta) || 6, (b.script_ref || '').toString().slice(0, 20000) || null);
  res.json({ ok: true });
});

// ── Termos proibidos/positivos (treináveis) ──
router.get('/termos', exigePerfil(...GESTAO), (req, res) => {
  res.json({ termos: db.prepare('SELECT * FROM botvendas_termos WHERE empresa_id=? ORDER BY tipo, termo').all(req.usuario.empresa_id) });
});
router.post('/termos', exigePerfil(...GESTAO), (req, res) => {
  const { termo, tipo } = req.body;
  if (!termo || !termo.trim()) return res.status(400).json({ erro: 'Escreva o termo.' });
  const id = uuid();
  db.prepare("INSERT INTO botvendas_termos (id, empresa_id, termo, tipo, ativo, criado_em) VALUES (?,?,?,?,1,datetime('now'))")
    .run(id, req.usuario.empresa_id, termo.trim().toLowerCase().slice(0, 120), ['negativa', 'evasivo', 'positivo'].includes(tipo) ? tipo : 'negativa');
  res.json({ ok: true, id });
});
router.delete('/termos/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM botvendas_termos WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Lojas/vendedores p/ os filtros.
router.get('/vendedores', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare("SELECT DISTINCT vendedor_nome, colaborador_id FROM botvendas_atendimentos WHERE empresa_id=? AND vendedor_nome IS NOT NULL ORDER BY vendedor_nome").all(emp);
  res.json({ vendedores: rows });
});

// ── Critérios da monitoria (treináveis) — usados pela avaliação por IA (Fase 2) ──
router.get('/criterios', exigePerfil(...GESTAO), (req, res) => {
  res.json({ criterios: db.prepare('SELECT * FROM botvendas_criterios WHERE empresa_id=? ORDER BY ordem, criado_em').all(req.usuario.empresa_id) });
});
router.post('/criterios', exigePerfil(...GESTAO), (req, res) => {
  const { texto, peso } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Escreva o critério.' });
  const id = uuid();
  db.prepare("INSERT INTO botvendas_criterios (id, empresa_id, texto, peso, ativo, ordem, criado_em) VALUES (?,?,?,?,1,?,datetime('now'))")
    .run(id, req.usuario.empresa_id, texto.trim().slice(0, 300), Number(peso) || 1, Number(req.body.ordem) || 0);
  res.json({ ok: true, id });
});
router.put('/criterios/:id', exigePerfil(...GESTAO), (req, res) => {
  const c = db.prepare('SELECT * FROM botvendas_criterios WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Critério não encontrado.' });
  const b = req.body;
  db.prepare('UPDATE botvendas_criterios SET texto=?, peso=?, ativo=?, ordem=? WHERE id=?')
    .run((b.texto ?? c.texto).trim().slice(0, 300), Number(b.peso) || c.peso, b.ativo !== undefined ? (b.ativo ? 1 : 0) : c.ativo, Number(b.ordem) || c.ordem, c.id);
  res.json({ ok: true });
});
router.delete('/criterios/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM botvendas_criterios WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

module.exports = router;
