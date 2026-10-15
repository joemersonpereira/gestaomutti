// colabIndicadores.js — indicadores INDIVIDUAIS do escritório (por colaborador).
// Direção/RH atribui metas por pessoa, com prêmio em R$ ou pontos POR indicador; apuração
// mensal do realizado → batido/não; o colaborador acompanha e ganha o prêmio quando bate.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);
const GESTAO = ['RH', 'Gestor Geral', 'Diretor Geral', 'Controladoria'];
const hoje = new Date();
const bateu = (ind, real) => (ind.sentido === 'menor' ? (Number(real) <= Number(ind.meta)) : (Number(real) >= Number(ind.meta)));
const comp = (mes, ano) => `${ano}-${String(mes).padStart(2, '0')}`;

// Fontes automáticas. Tarefas = do próprio colaborador; Devoluções = da empresa (p/ o Suporte
// que fecha o ciclo — recolher/reembolsar/concluir; e cobrar o que fica parado).
const FONTES = [
  { id: 'manual', label: 'Manual (lançado à mão)', unidade: null, sentido: null },
  { id: 'tarefas_concluidas', label: 'Tarefas concluídas no mês', unidade: 'qtd', sentido: 'maior' },
  { id: 'tarefas_atrasadas', label: 'Tarefas atrasadas no mês', unidade: 'qtd', sentido: 'menor' },
  { id: 'tarefas_no_prazo_pct', label: '% de tarefas no prazo', unidade: 'percentual', sentido: 'maior' },
  { id: 'devol_concluidas', label: 'Devoluções concluídas no mês', unidade: 'qtd', sentido: 'maior' },
  { id: 'devol_recolhidas', label: 'Devoluções recolhidas no mês', unidade: 'qtd', sentido: 'maior' },
  { id: 'devol_reembolsadas', label: 'Devoluções reembolsadas no mês', unidade: 'qtd', sentido: 'maior' },
  { id: 'devol_fechamento_pct', label: '% de devoluções fechadas (recolh.+reemb.+concl.)', unidade: 'percentual', sentido: 'maior' },
  { id: 'devol_paradas', label: 'Devoluções paradas (em aberto agora)', unidade: 'qtd', sentido: 'menor' },
  { id: 'mkt_comprador_atrasadas', label: 'Listas de oferta (marketing) NÃO respondidas no prazo', unidade: 'qtd', sentido: 'menor' },
  { id: 'mkt_comprador_no_prazo_pct', label: '% de listas de oferta respondidas no prazo', unidade: 'percentual', sentido: 'maior' },
];
const mm = m => String(m).padStart(2, '0');
const DEVOL_ATIVAS = "('andamento','analise_fornecedor','coleta','reembolso')";
// Realizado automático (ou null se fonte manual/desconhecida). empresaId usado nas fontes de devolução.
function realizadoAuto(fonte, colabId, mes, ano, empresaId) {
  const M = mm(mes), A = String(ano);
  // ── Devoluções (Suporte fecha o ciclo) ──
  if (fonte === 'devol_concluidas') {
    return db.prepare(`SELECT COUNT(*) c FROM devolucoes WHERE empresa_id=? AND status='concluido'
      AND strftime('%m',status_desde)=? AND strftime('%Y',status_desde)=?`).get(empresaId, M, A).c;
  }
  if (fonte === 'devol_reembolsadas') {
    return db.prepare(`SELECT COUNT(*) c FROM devolucoes WHERE empresa_id=? AND pago=1
      AND strftime('%m',status_desde)=? AND strftime('%Y',status_desde)=?`).get(empresaId, M, A).c;
  }
  if (fonte === 'devol_recolhidas') {
    return db.prepare(`SELECT COUNT(*) c FROM devolucao_fornecedor f JOIN devolucoes d ON d.id=f.devolucao_id
      WHERE d.empresa_id=? AND f.data_coleta IS NOT NULL AND strftime('%m',f.data_coleta)=? AND strftime('%Y',f.data_coleta)=?`).get(empresaId, M, A).c;
  }
  if (fonte === 'devol_fechamento_pct') {
    // fechadas ÷ (fechadas + ainda em aberto) — mede se o Suporte não deixa parar
    const fechadas = db.prepare(`SELECT COUNT(*) c FROM devolucoes WHERE empresa_id=? AND status='concluido' AND strftime('%m',status_desde)=? AND strftime('%Y',status_desde)=?`).get(empresaId, M, A).c;
    const abertas = db.prepare(`SELECT COUNT(*) c FROM devolucoes WHERE empresa_id=? AND status IN ${DEVOL_ATIVAS}`).get(empresaId).c;
    const tot = fechadas + abertas;
    return tot ? Math.round((fechadas / tot) * 100) : null;
  }
  if (fonte === 'devol_paradas') {
    return db.prepare(`SELECT COUNT(*) c FROM devolucoes WHERE empresa_id=? AND status IN ${DEVOL_ATIVAS}`).get(empresaId).c;
  }
  // ── Marketing: comprador que não passou a lista de ofertas no prazo ──
  if (fonte === 'mkt_comprador_atrasadas') {
    // pendentes vencidas (prazo passou) OU respondidas fora do prazo, com prazo no mês
    return db.prepare(`SELECT COUNT(*) c FROM mkt_agenda WHERE empresa_id=? AND comprador_id=? AND comprador_prazo IS NOT NULL
      AND strftime('%m',comprador_prazo)=? AND strftime('%Y',comprador_prazo)=?
      AND ((comprador_status='pendente' AND date(comprador_prazo) < date('now','localtime')) OR (comprador_status='respondido' AND comprador_no_prazo=0))`).get(empresaId, colabId, M, A).c;
  }
  if (fonte === 'mkt_comprador_no_prazo_pct') {
    const t = db.prepare(`SELECT COUNT(*) c FROM mkt_agenda WHERE empresa_id=? AND comprador_id=? AND comprador_prazo IS NOT NULL AND strftime('%m',comprador_prazo)=? AND strftime('%Y',comprador_prazo)=?`).get(empresaId, colabId, M, A).c;
    if (!t) return null;
    const ok = db.prepare(`SELECT COUNT(*) c FROM mkt_agenda WHERE empresa_id=? AND comprador_id=? AND comprador_prazo IS NOT NULL AND strftime('%m',comprador_prazo)=? AND strftime('%Y',comprador_prazo)=? AND comprador_status='respondido' AND comprador_no_prazo=1`).get(empresaId, colabId, M, A).c;
    return Math.round((ok / t) * 100);
  }
  if (fonte === 'tarefas_concluidas') {
    return db.prepare(`SELECT COUNT(*) c FROM tarefas WHERE responsavel_id=? AND status='concluido'
      AND strftime('%m',concluido_em)=? AND strftime('%Y',concluido_em)=?`).get(colabId, M, A).c;
  }
  if (fonte === 'tarefas_atrasadas') {
    // tarefas com prazo no mês que NÃO foram concluídas no prazo (ou seguem abertas vencidas)
    return db.prepare(`SELECT COUNT(*) c FROM tarefas WHERE responsavel_id=? AND prazo IS NOT NULL
      AND strftime('%m',prazo)=? AND strftime('%Y',prazo)=?
      AND ((status!='concluido' AND date(prazo) < date('now','localtime')) OR (concluido_em IS NOT NULL AND date(concluido_em) > date(prazo)))`).get(colabId, M, A).c;
  }
  if (fonte === 'tarefas_no_prazo_pct') {
    const t = db.prepare(`SELECT COUNT(*) c FROM tarefas WHERE responsavel_id=? AND prazo IS NOT NULL AND strftime('%m',prazo)=? AND strftime('%Y',prazo)=?`).get(colabId, M, A).c;
    if (!t) return null; // sem tarefas no mês → não pontua
    const ok = db.prepare(`SELECT COUNT(*) c FROM tarefas WHERE responsavel_id=? AND prazo IS NOT NULL AND strftime('%m',prazo)=? AND strftime('%Y',prazo)=?
      AND concluido_em IS NOT NULL AND date(concluido_em) <= date(prazo)`).get(colabId, M, A).c;
    return Math.round((ok / t) * 100);
  }
  return null;
}
router.get('/fontes', (req, res) => res.json({ fontes: FONTES }));

// Resolve o realizado/batido de um indicador no mês: usa a apuração salva; se for fonte
// automática e ainda não apurada, calcula ao vivo. Devolve o objeto enriquecido.
function resolver(ind, mes, ano) {
  const ap = db.prepare('SELECT realizado FROM colab_indicador_apuracao WHERE colab_indicador_id=? AND mes=? AND ano=?').get(ind.id, mes, ano);
  const auto = ind.fonte && ind.fonte !== 'manual';
  let realizado = ap != null ? ap.realizado : (auto ? realizadoAuto(ind.fonte, ind.colaborador_id, mes, ano, ind.empresa_id) : null);
  const temReal = realizado != null;
  return {
    id: ind.id, colaborador_id: ind.colaborador_id, nome: ind.nome, unidade: ind.unidade, meta: ind.meta,
    sentido: ind.sentido, premio_tipo: ind.premio_tipo, premio_valor: ind.premio_valor, descricao: ind.descricao,
    fonte: ind.fonte || 'manual', auto,
    realizado: temReal ? realizado : null, apurado: ap != null, batido: temReal ? bateu(ind, realizado) : null,
  };
}

// Credita/estorna pontos idempotente por ref quando o prêmio é em pontos.
function sincronizarPontos(emp, ind, colab, mes, ano, batido) {
  if (ind.premio_tipo !== 'pontos') return;
  const ref = `colabind:${ind.id}:${ano}-${mes}`;
  db.prepare('DELETE FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').run(emp, ref);
  if (batido && Number(ind.premio_valor) > 0) {
    db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(uuid(), emp, colab.id, colab.nome || null, 'indicador', `Indicador batido: ${ind.nome}`, Math.round(Number(ind.premio_valor)), comp(mes, ano), 'automatico', ref, null);
  }
}

// ── Gestão: colaboradores do escritório p/ atribuir ──────────────────────────
router.get('/colaboradores', exigePerfil(...GESTAO), (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.nome, f.nome AS funcao
    FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.escritorio=1 ORDER BY c.nome`).all(req.usuario.empresa_id);
  res.json({ colaboradores: rows });
});

// ── Gestão: indicadores de um colaborador (+ apuração do mês) ─────────────────
router.get('/', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const colabId = req.query.colaborador_id;
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  if (!colabId) return res.json({ indicadores: [] });
  const inds = db.prepare('SELECT * FROM colab_indicadores WHERE empresa_id=? AND colaborador_id=? AND ativo=1 ORDER BY criado_em').all(emp, colabId);
  res.json({ mes, ano, indicadores: inds.map(ind => resolver(ind, mes, ano)) });
});

router.post('/', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {};
  // Aceita 1 colaborador (colaborador_id) OU vários (colaborador_ids[]) — atribuição em lote.
  const alvos = Array.isArray(b.colaborador_ids) && b.colaborador_ids.length ? b.colaborador_ids : (b.colaborador_id ? [b.colaborador_id] : []);
  if (!alvos.length || !b.nome || !b.nome.trim()) return res.status(400).json({ erro: 'Colaborador(es) e nome do indicador são obrigatórios.' });
  const fonte = FONTES.some(f => f.id === b.fonte) ? b.fonte : 'manual';
  const ins = db.prepare(`INSERT INTO colab_indicadores (id,empresa_id,colaborador_id,nome,unidade,meta,sentido,premio_tipo,premio_valor,descricao,fonte,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const ids = [];
  for (const colabId of alvos) {
    const id = uuid(); ids.push(id);
    ins.run(id, req.usuario.empresa_id, colabId, b.nome.trim(), b.unidade || 'qtd', Number(b.meta) || 0,
      b.sentido === 'menor' ? 'menor' : 'maior', b.premio_tipo === 'pontos' ? 'pontos' : 'reais', Number(b.premio_valor) || 0,
      (b.descricao || '').trim() || null, fonte, req.usuario.id);
  }
  res.status(201).json({ ok: true, ids, criados: ids.length });
});

router.put('/:id', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {};
  const ind = db.prepare('SELECT * FROM colab_indicadores WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!ind) return res.status(404).json({ erro: 'Indicador não encontrado.' });
  const fonte = b.fonte != null ? (FONTES.some(f => f.id === b.fonte) ? b.fonte : ind.fonte) : ind.fonte;
  db.prepare(`UPDATE colab_indicadores SET nome=?, unidade=?, meta=?, sentido=?, premio_tipo=?, premio_valor=?, descricao=?, fonte=? WHERE id=?`)
    .run(b.nome?.trim() || ind.nome, b.unidade || ind.unidade, b.meta != null ? Number(b.meta) : ind.meta,
      b.sentido === 'menor' ? 'menor' : (b.sentido === 'maior' ? 'maior' : ind.sentido),
      b.premio_tipo === 'pontos' ? 'pontos' : (b.premio_tipo === 'reais' ? 'reais' : ind.premio_tipo),
      b.premio_valor != null ? Number(b.premio_valor) : ind.premio_valor, b.descricao != null ? (b.descricao.trim() || null) : ind.descricao, fonte, ind.id);
  res.json({ ok: true });
});

router.delete('/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('UPDATE colab_indicadores SET ativo=0 WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  // remove pontos futuros desse indicador (mantém histórico já pago? aqui limpamos por segurança do saldo)
  db.prepare("DELETE FROM pontos_lancamentos WHERE empresa_id=? AND ref LIKE ?").run(req.usuario.empresa_id, `colabind:${req.params.id}:%`);
  res.json({ ok: true });
});

// ── Gestão: apurar o realizado do mês (atualiza pontos se for prêmio em pontos) ─
router.post('/:id/apurar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const ind = db.prepare('SELECT * FROM colab_indicadores WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!ind) return res.status(404).json({ erro: 'Indicador não encontrado.' });
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  // fonte automática sem valor informado → calcula do próprio sistema (tarefas)
  const auto = ind.fonte && ind.fonte !== 'manual';
  const realizado = (req.body.realizado != null && req.body.realizado !== '') ? Number(req.body.realizado)
    : (auto ? (realizadoAuto(ind.fonte, ind.colaborador_id, mes, ano, ind.empresa_id) || 0) : 0);
  db.prepare(`INSERT INTO colab_indicador_apuracao (id,colab_indicador_id,mes,ano,realizado,apurado_por,apurado_em)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(colab_indicador_id, mes, ano) DO UPDATE SET realizado=excluded.realizado, apurado_por=excluded.apurado_por, apurado_em=datetime('now')`)
    .run(uuid(), ind.id, mes, ano, realizado, req.usuario.id);
  const colab = db.prepare('SELECT id, nome FROM colaboradores WHERE id=?').get(ind.colaborador_id) || { id: ind.colaborador_id };
  sincronizarPontos(emp, ind, colab, mes, ano, bateu(ind, realizado));
  res.json({ ok: true, batido: bateu(ind, realizado) });
});

// ── Colaborador logado: meus indicadores do mês + prêmio a receber ────────────
router.get('/meus', (req, res) => {
  const emp = req.usuario.empresa_id;
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const inds = db.prepare('SELECT * FROM colab_indicadores WHERE empresa_id=? AND colaborador_id=? AND ativo=1 ORDER BY criado_em').all(emp, req.usuario.id);
  let premioReais = 0, premioPontos = 0;
  const indicadores = inds.map(ind => {
    const r = resolver(ind, mes, ano);
    if (r.batido) { if (r.premio_tipo === 'pontos') premioPontos += Number(r.premio_valor) || 0; else premioReais += Number(r.premio_valor) || 0; }
    return r;
  });
  res.json({ mes, ano, temIndicadores: indicadores.length > 0, indicadores, premio: { reais: premioReais, pontos: premioPontos } });
});

module.exports = router;
