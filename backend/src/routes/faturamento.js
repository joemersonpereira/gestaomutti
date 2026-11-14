// faturamento.js — tela de Faturamento (venda/CMV/unidades/clientes/ticket por loja, vendedor, grupo,
// classificação) + projeção do mês + metas de faturamento (ticket, cmv, unidades, clientes, vitaminas, entrega).
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const { faturamento, historico, vendedorGrupos, comparativo, comparativoItens, mediaVendaVendedores, mediaIndicadoresVendedores } = require('../lib/faturamentoErp');
const fatMetas = require('../lib/faturamentoMetas');
const { lojasEmpresa } = require('../lib/escopoCompras');
const db = require('../db/connection');
const { cacheMiddleware: _ccMw, invalidarMiddleware: _ccInv } = require('../lib/erpCache');
const fatCache = _ccMw('fat');
const fatInval = _ccInv('fat:');
const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Financeiro'];

router.use(auth);

router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));

// Faixas de PREMIAÇÃO do vendedor (% da venda por faixa) — configurável. Padrão 3/4/5 (regra do Joe).
const cfgGet = (emp, k, d) => { const r = db.prepare('SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?').get(emp, k); return r && r.valor != null ? r.valor : d; };
router.get('/premiacao-config', (req, res) => {
  const e = req.usuario.empresa_id;
  res.json({ base: Number(cfgGet(e, 'fat_premio_base', 3)), meta: Number(cfgGet(e, 'fat_premio_meta', 4)), superMeta: Number(cfgGet(e, 'fat_premio_super', 5)) });
});
router.put('/premiacao-config', exigePerfil(...GESTAO), (req, res) => {
  const e = req.usuario.empresa_id; const b = req.body || {};
  const up = (k, v) => db.prepare('INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,?,?) ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor').run(e, k, String(v));
  if (b.base != null && b.base !== '') up('fat_premio_base', Number(b.base) || 0);
  if (b.meta != null && b.meta !== '') up('fat_premio_meta', Number(b.meta) || 0);
  if (b.superMeta != null && b.superMeta !== '') up('fat_premio_super', Number(b.superMeta) || 0);
  res.json({ ok: true });
});
// Tempos de atendimento online (BotVendas) — p/ o Online
const { atendimentoOnline } = require('../lib/atendimentoOnlineLib');
router.get('/atendimento-online', (req, res) => { try { res.json(atendimentoOnline(req.usuario.empresa_id, { lojaId: req.query.loja || '', dias: req.query.dias, ini: req.query.ini || '', fim: req.query.fim || '' })); } catch (e) { res.status(500).json({ erro: e.message }); } });

// Vendas por vendedor AO VIVO (relatório Resumo de Vendas → Atendentes do BotVendas). Fonte certa de
// venda/ticket/CONVERSÃO por vendedor (vs. aproximação dos atendimentos sincronizados).
router.get('/vendas-online', async (req, res) => {
  try {
    const api = require('../lib/botvendasApi');
    if (!api.habilitado()) return res.json({ habilitado: false });
    const hoje = new Date(); const ymd = d => d.toISOString().slice(0, 10);
    const ini = req.query.ini || (req.query.dias ? ymd(new Date(Date.now() - (Number(req.query.dias) || 30) * 864e5)) : '');
    const fim = req.query.fim || (req.query.dias ? ymd(hoje) : '');
    const linhas = await api.vendasPorVendedor({ iniDate: ini, endDate: fim });
    const n = (v) => Number(v) || 0;
    const todos = linhas.map(s => {
      const at = n(s.attendance_count), vd = n(s.closed_count);
      return { nome: (s.name || '').trim(), atendimentos: at, vendas: vd, perdidas: Math.max(0, at - vd),
        venda: Math.round(n(s.closed_total) * 100) / 100, ticket: Math.round(n(s.ticket_avg) * 100) / 100,
        conversao: at ? Math.round(vd / at * 1000) / 10 : null,
        tmaMin: s.tma != null ? Math.round(n(s.tma) / 60 * 10) / 10 : null };
    });
    // Totais = TODAS as linhas (inclui o balde "sem atendente"). Tabela por vendedor = só os NOMEADOS.
    const atend = todos.reduce((a, v) => a + v.atendimentos, 0);
    const vendas = todos.reduce((a, v) => a + v.vendas, 0);
    const vendaTotal = Math.round(todos.reduce((a, v) => a + v.venda, 0) * 100) / 100;
    const vendedores = todos.filter(v => v.nome).sort((a, b) => b.venda - a.venda);
    const semVendedor = todos.filter(v => !v.nome).reduce((a, v) => ({ atendimentos: a.atendimentos + v.atendimentos, vendas: a.vendas + v.vendas, venda: a.venda + v.venda }), { atendimentos: 0, vendas: 0, venda: 0 });
    res.json({ habilitado: true, periodo: `${ini || 'mês'}..${fim || 'atual'}`,
      resumo: { atendimentos: atend, vendas, perdidas: Math.max(0, atend - vendas), vendaTotal,
        conversao: atend ? Math.round(vendas / atend * 1000) / 10 : null, ticket: vendas ? Math.round(vendaTotal / vendas * 100) / 100 : null,
        semVendedor: { atendimentos: semVendedor.atendimentos, vendas: semVendedor.vendas, venda: Math.round(semVendedor.venda * 100) / 100 } },
      vendedores });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Avaliações baixas (CSAT < 3) que precisam de justificativa do responsável. ?minhas=1 = só as do
// colaborador logado (a "minha área" do Online). Gestão vê todas.
router.get('/avaliacoes-baixas', (req, res) => {
  const emp = req.usuario.empresa_id;
  const w = ['s.empresa_id=?', 's.nota < 3']; const p = [emp];
  if (req.query.minhas === '1') { w.push('s.colaborador_id=?'); p.push(req.usuario.id); }
  if (req.query.loja) { w.push('s.loja_id=?'); p.push(req.query.loja); }
  if (req.query.ini && req.query.fim) { w.push("COALESCE(s.respondido_em,s.sincronizado_em) BETWEEN ? AND ?"); p.push(String(req.query.ini).slice(0, 10) + 'T00:00:00', String(req.query.fim).slice(0, 10) + 'T23:59:59'); }
  // Corte: só avaliações do MÊS ATUAL pra frente (Joe 2026-11: desconsiderar outubro pra trás a justificar).
  else { const ag = new Date(); const corte = `${ag.getFullYear()}-${String(ag.getMonth() + 1).padStart(2, '0')}-01T00:00:00`; w.push("COALESCE(s.respondido_em,s.sincronizado_em) >= ?"); p.push(corte); }
  const rows = db.prepare(`SELECT s.answer_id, s.order_id, s.nota, s.vendedor_nome, s.colaborador_id, s.loja_id,
      s.respondido_em, j.justificativa, j.por AS justificado_por, j.criado_em AS justificado_em
    FROM botvendas_satisfacao s
    LEFT JOIN botvendas_avaliacao_justificativa j ON j.empresa_id=s.empresa_id AND j.answer_id=s.answer_id
    WHERE ${w.join(' AND ')} ORDER BY COALESCE(s.respondido_em,s.sincronizado_em) DESC LIMIT 500`).all(...p);
  res.json({ itens: rows, total: rows.length, pendentes: rows.filter(r => !r.justificativa).length });
});
// Salva/atualiza a justificativa de uma avaliação (o próprio responsável, ou gestão).
router.post('/avaliacao-justificar', (req, res) => {
  const emp = req.usuario.empresa_id; const b = req.body || {};
  const ans = Number(b.answer_id); const just = (b.justificativa || '').trim();
  if (!ans || !just) return res.status(400).json({ erro: 'Informe a avaliação e a justificativa.' });
  const s = db.prepare('SELECT colaborador_id FROM botvendas_satisfacao WHERE empresa_id=? AND answer_id=?').get(emp, ans);
  if (!s) return res.status(404).json({ erro: 'Avaliação não encontrada.' });
  db.prepare(`INSERT INTO botvendas_avaliacao_justificativa (empresa_id, answer_id, justificativa, colaborador_id, por, criado_em)
    VALUES (?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, answer_id) DO UPDATE SET justificativa=excluded.justificativa, por=excluded.por, criado_em=datetime('now')`)
    .run(emp, ans, just.slice(0, 1000), s.colaborador_id || req.usuario.id, req.usuario.nome || null);
  res.json({ ok: true });
});

router.get('/', fatCache, async (req, res) => {
  try { res.json(await faturamento(req.usuario.empresa_id, { lojaId: req.query.loja || '', dias: req.query.dias, ini: req.query.ini || '', fim: req.query.fim || '', canal: req.query.canal })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

// Histórico mês a mês (p/ replicar/puxar). Aceita loja e vendedor.
router.get('/historico', fatCache, async (req, res) => {
  try { res.json(await historico(req.usuario.empresa_id, { lojaId: req.query.loja || '', vendedorId: req.query.vendedor || null, meses: req.query.meses, canal: req.query.canal })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
// Comparativo de 2 períodos (o que subiu/caiu) em todas as métricas + por grupo.
router.get('/comparativo', fatCache, async (req, res) => {
  try { res.json(await comparativo(req.usuario.empresa_id, { lojaId: req.query.loja || '', canal: req.query.canal, ini1: req.query.ini1, fim1: req.query.fim1, ini2: req.query.ini2, fim2: req.query.fim2 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
// Drill-down: produtos de um grupo no comparativo (A × B)
router.get('/comparativo-itens', fatCache, async (req, res) => {
  try { res.json(await comparativoItens(req.usuario.empresa_id, { lojaId: req.query.loja || '', canal: req.query.canal, grupo: req.query.grupo, ini1: req.query.ini1, fim1: req.query.fim1, ini2: req.query.ini2, fim2: req.query.fim2 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
// Detalhe do vendedor (vendas por grupo)
router.get('/vendedor-grupos', fatCache, async (req, res) => {
  try { res.json(await vendedorGrupos(req.usuario.empresa_id, { usuarioId: req.query.vendedor, lojaId: req.query.loja || '', dias: req.query.dias, canal: req.query.canal })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

// Metas por CANAL (todos/entrega), ESCOPO (rede/loja/vendedor), COMPETÊNCIA (mês) e indicador.
router.get('/metas', (req, res) => res.json({ itens: fatMetas.listar(req.usuario.empresa_id, { canal: req.query.canal, escopo: req.query.escopo, alvo: req.query.alvo || '' }), catalogo: fatMetas.catalogo(req.query.canal) }));
router.put('/metas', exigePerfil(...GESTAO), fatInval, (req, res) => { try { res.json(fatMetas.setMeta(req.usuario.empresa_id, req.body, req.usuario)); } catch (e) { res.status(400).json({ erro: e.message }); } });
router.put('/metas-lote', exigePerfil(...GESTAO), fatInval, (req, res) => { try { res.json(fatMetas.setLote(req.usuario.empresa_id, req.body.itens, req.usuario)); } catch (e) { res.status(400).json({ erro: e.message }); } });
// Gera a meta de venda (+super) de TODOS os vendedores de uma vez, pela média/último da venda de cada um.
router.put('/metas-gerar-vendedores', exigePerfil(...GESTAO), fatInval, async (req, res) => {
  try {
    const b = req.body || {};
    const med = await mediaVendaVendedores(req.usuario.empresa_id, { lojaId: b.loja || '', meses: b.meses, canal: b.canal });
    const futMeses = Array.isArray(b.futMeses) ? b.futMeses : [];
    const aM = Number(b.ajusteMeta) || 0, aS = Number(b.ajusteSuper) || 0;
    const its = [];
    for (const uid in med) {
      const base = b.base === 'ultimo' ? med[uid].ultimo : med[uid].media;
      if (base == null) continue;
      futMeses.forEach(comp => {
        its.push({ canal: b.canal, escopo: 'vendedor', alvo: uid, competencia: comp, indicador: 'venda', meta: Math.round(base * (1 + aM / 100)) });
        its.push({ canal: b.canal, escopo: 'vendedor', alvo: uid, competencia: comp, indicador: 'venda_super', meta: Math.round(base * (1 + aS / 100)) });
      });
    }
    fatMetas.setLote(req.usuario.empresa_id, its, req.usuario);
    res.json({ ok: true, vendedores: Object.keys(med).length, metas: its.length });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});
// Sugestão de meta por vendedor (média mensal de venda de cada um) — p/ pré-preencher a grade editável.
router.get('/metas-sugestao-vendedores', fatCache, async (req, res) => {
  try { res.json({ base: await mediaVendaVendedores(req.usuario.empresa_id, { lojaId: req.query.loja || '', meses: req.query.meses, canal: req.query.canal }) }); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
// Gera a grade COMPLETA por vendedor: venda+super vêm da grade (editáveis); ticket, CMV, unidades, clientes%,
// vitaminas e entrega vêm da MÉDIA mensal de cada vendedor; tempos vêm da média global do atendimento online.
router.put('/metas-gerar-completo-vendedores', exigePerfil(...GESTAO), fatInval, async (req, res) => {
  try {
    const b = req.body || {};
    const futMeses = Array.isArray(b.futMeses) ? b.futMeses.filter(x => /^\d{4}-\d{2}$/.test(x)) : [];
    const vends = Array.isArray(b.vendedores) ? b.vendedores : [];
    if (!futMeses.length || !vends.length) throw new Error('Informe os meses e os vendedores.');
    const med = await mediaIndicadoresVendedores(req.usuario.empresa_id, { lojaId: b.loja || '', meses: b.meses, canal: b.canal });
    // tempos = média do atendimento online (rede toda — a base do bot é de rede, não por loja/vendedor)
    let at = {}; try { at = atendimentoOnline(req.usuario.empresa_id, { lojaId: '', dias: 90 }); } catch (e) { at = {}; }
    const its = [];
    const ok = v => v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) !== 0;
    vends.forEach(v => {
      const uid = String(v.uid); const mi = med[uid] || {};
      futMeses.forEach(comp => {
        const push = (indicador, meta) => { if (ok(meta)) its.push({ canal: b.canal, escopo: 'vendedor', alvo: uid, competencia: comp, indicador, meta: Number(meta) }); };
        push('venda', v.meta); push('venda_super', v.super);
        push('ticket', mi.ticket); push('cmv', mi.cmv); push('unidades', mi.unidades);
        push('clientes_identif', mi.clientes_identif);
        if (b.canal === 'entrega') { push('tempo_resposta', at.respMin); push('tempo_atendimento', at.taMin); }
        else push('vitaminas', mi.vitaminas);
      });
    });
    if (!its.length) throw new Error('Nada para gerar — verifique o histórico dos vendedores.');
    fatMetas.setLote(req.usuario.empresa_id, its, req.usuario);
    res.json({ ok: true, vendedores: vends.length, metas: its.length });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});
// Rateio TOP-DOWN loja→vendedores: pega a meta (e super) de VENDA da loja e divide entre os
// vendedores dela pela participação histórica (share de cada um na venda da loja), somando ao total.
router.put('/metas-distribuir-vendedores', exigePerfil(...GESTAO), fatInval, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.loja) throw new Error('Informe a loja.');
    if (!b.competencia && !(Array.isArray(b.competencias) && b.competencias.length)) throw new Error('Informe a competência (mês).');
    // Aceita uma competência (meta/metaSuper) OU uma lista [{competencia, meta, metaSuper}] — share calculado 1x.
    const comps = Array.isArray(b.competencias) && b.competencias.length
      ? b.competencias
      : [{ competencia: b.competencia, meta: b.meta, metaSuper: b.metaSuper }];
    const med = await mediaVendaVendedores(req.usuario.empresa_id, { lojaId: b.loja, meses: b.meses, canal: b.canal });
    const uids = Object.keys(med).filter(u => Number(med[u].media) > 0);
    const totalBase = uids.reduce((s, u) => s + Number(med[u].media), 0);
    if (!totalBase) throw new Error('Sem base histórica de vendas para esta loja.');
    const its = [];
    comps.forEach(cp => {
      if (!cp.competencia) return;
      const metaTot = Number(cp.meta) || 0, superTot = Number(cp.metaSuper) || 0;
      if (!metaTot && !superTot) return;
      uids.forEach(u => {
        const sh = Number(med[u].media) / totalBase;
        if (metaTot) its.push({ canal: b.canal, escopo: 'vendedor', alvo: u, competencia: cp.competencia, indicador: 'venda', meta: Math.round(metaTot * sh) });
        if (superTot) its.push({ canal: b.canal, escopo: 'vendedor', alvo: u, competencia: cp.competencia, indicador: 'venda_super', meta: Math.round(superTot * sh) });
      });
    });
    if (!its.length) throw new Error('Defina a meta de venda da loja antes de distribuir.');
    fatMetas.setLote(req.usuario.empresa_id, its, req.usuario);
    res.json({ ok: true, vendedores: uids.length, metas: its.length });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});
router.delete('/metas', exigePerfil(...GESTAO), fatInval, (req, res) => res.json(fatMetas.remover(req.usuario.empresa_id, { canal: req.query.canal, escopo: req.query.escopo, alvo: req.query.alvo || '', competencia: req.query.competencia || '', indicador: req.query.indicador })));

module.exports = router;
