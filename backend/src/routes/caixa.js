const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const { getRegra, premiacaoPorPct } = require('../lib/premiacao');
const caixaGam = require('../lib/caixaGamificacao');

router.use(auth);

// Gerente ativo da loja — adicionado como apoio nas tarefas geradas por erro de caixa,
// para ciência (o erro do caixa também impacta o indicador do gerente).
function gerenteDaLoja(empresaId, lojaId) {
  const g = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id='func-gerente' AND ativo=1 LIMIT 1`).get(empresaId, lojaId);
  return g?.id || null;
}

// Pontos de um fechamento (sistema "Caixa Destaque"): quanto menor a diferença, melhor.
function pontosDia(dif) {
  const v = Math.abs(Number(dif) || 0);
  if (v === 0) return 10;
  if (v <= 5) return 5;
  if (v <= 20) return -5;
  if (v <= 50) return -15;
  return -30;
}
// Nota 0–100 da diferença (para o indicador "Caixa" do painel do gerente)
const ESCALA_CAIXA_PADRAO = [{ ate: 0, nota: 100 }, { ate: 5, nota: 90 }, { ate: 20, nota: 70 }, { ate: 50, nota: 40 }];
// Escala configurável (Tesouraria): diferença de caixa → nota. Acima da última faixa = 0.
function escalaCaixa(empresaId) {
  try { const e = require('../lib/tesourariaErp').getConfig(empresaId).escalaNotaCaixa; return Array.isArray(e) && e.length ? e : ESCALA_CAIXA_PADRAO; }
  catch { return ESCALA_CAIXA_PADRAO; }
}
function notaDaDiferenca(dif, escala) {
  const v = Math.abs(Number(dif) || 0);
  const faixas = Array.isArray(escala) && escala.length ? escala : ESCALA_CAIXA_PADRAO;
  for (const f of faixas) if (v <= Number(f.ate)) return Number(f.nota);
  return 0;
}
const GESTAO = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Tesouraria'];

// GET /caixa?loja_id=&mes=&ano=  (lista de fechamentos)
router.get('/', (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  let q = `SELECT lc.*, c.nome as colaborador_nome, l.nome as loja_nome FROM lancamentos_caixa lc
           LEFT JOIN colaboradores c ON c.id = lc.colaborador_id JOIN lojas l ON l.id = lc.loja_id
           WHERE lc.empresa_id = ? AND CAST(strftime('%m', lc.data) AS INTEGER) = ? AND CAST(strftime('%Y', lc.data) AS INTEGER) = ?`;
  const params = [req.usuario.empresa_id, mes, ano];
  if (req.query.loja_id) { q += ' AND lc.loja_id = ?'; params.push(req.query.loja_id); }
  else if (!GESTAO.includes(req.usuario.funcao_nome)) { q += ' AND lc.colaborador_id = ?'; params.push(req.usuario.id); }
  const lancamentos = db.prepare(q + ' ORDER BY lc.data DESC').all(...params);
  const esc = escalaCaixa(req.usuario.empresa_id);
  const notaMedia = lancamentos.length ? Math.round(lancamentos.reduce((a, l) => a + notaDaDiferenca(l.diferenca, esc), 0) / lancamentos.length) : null;
  res.json({ mes, ano, nota_media: notaMedia, lancamentos });
});

// GET /caixa/ranking?loja_id=&mes=&ano=  (Caixa Destaque)
router.get('/ranking', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || (GESTAO.includes(req.usuario.funcao_nome) ? null : req.usuario.loja_id);
  const filtroColab = req.query.colaborador_id || null;
  const esc = escalaCaixa(req.usuario.empresa_id);

  let cq = `SELECT id, nome, loja_id FROM colaboradores WHERE empresa_id = ? AND funcao_id = 'func-caixa' AND ativo = 1`;
  const cp = [req.usuario.empresa_id];
  if (lojaId) { cq += ' AND loja_id = ?'; cp.push(lojaId); }
  if (filtroColab) { cq += ' AND id = ?'; cp.push(filtroColab); }
  const caixas = db.prepare(cq).all(...cp);

  const regra = getRegra(req.usuario.empresa_id, 'func-caixa');
  const ranking = caixas.map(cx => {
    const dias = db.prepare(`SELECT data, turno, diferenca, observacao, justif_status FROM lancamentos_caixa
      WHERE colaborador_id = ? AND CAST(strftime('%m', data) AS INTEGER) = ? AND CAST(strftime('%Y', data) AS INTEGER) = ? ORDER BY data`).all(cx.id, mes, ano);
    // Soma EM MÓDULO: sobra (+) não abate falta (−); tudo somado pelo valor absoluto
    const moduloTotal = Math.round(dias.reduce((a, d) => a + Math.abs(Number(d.diferenca) || 0), 0) * 100) / 100;
    const sobras = Math.round(dias.filter(d => d.diferenca > 0).reduce((a, d) => a + d.diferenca, 0) * 100) / 100;
    const faltas = Math.round(dias.filter(d => d.diferenca < 0).reduce((a, d) => a + Math.abs(d.diferenca), 0) * 100) / 100;
    const perfeitos = dias.filter(d => Number(d.diferenca) === 0).length;
    // Nota em % (0–100): média das diferenças convertidas em escala. Justificativa aceita neutraliza (100).
    const pct = dias.length ? Math.round(dias.reduce((a, d) => a + (d.justif_status === 'aceita' ? 100 : notaDaDiferenca(d.diferenca, esc)), 0) / dias.length) : null;
    const turno = dias[0]?.turno || '';
    return { colaborador_id: cx.id, nome: cx.nome, turno, pct, premiacao: dias.length ? premiacaoPorPct(pct, regra) : 0, modulo_total: moduloTotal, sobras, faltas, perfeitos, fechamentos: dias.length, dias };
  });
  // Frente 3: pontualidade (chegou ≥5 min antes) → peso extra no ranking (até +5 na nota).
  let pontualidadeOk = false;
  try {
    const pj = await caixaGam.pontualidadeCaixas(req.usuario.empresa_id, { ano, mes, lojaId });
    pontualidadeOk = !!pj.ok;
    ranking.forEach(r => {
      const p = pj.pontualidade?.[r.colaborador_id] || null;
      r.pontualidade = p;
      r.pct_pontualidade = p?.pct ?? null;
      r.bonus_pontualidade = p?.pct != null ? Math.round(p.pct / 20) : 0; // 0..5
      r.pct_final = r.pct == null ? null : Math.min(100, r.pct + r.bonus_pontualidade);
    });
  } catch { ranking.forEach(r => { r.pct_final = r.pct; r.bonus_pontualidade = 0; r.pct_pontualidade = null; }); }

  // Maior nota final (com o peso da pontualidade) = melhor
  ranking.sort((a, b) => (b.pct_final ?? -1) - (a.pct_final ?? -1));

  res.json({
    mes, ano, ranking, pontualidadeOk,
    resumo: {
      destaque: ranking.find(r => r.fechamentos > 0)?.nome || null,
      total_fechamentos: ranking.reduce((a, r) => a + r.fechamentos, 0),
      total_modulo: Math.round(ranking.reduce((a, r) => a + r.modulo_total, 0) * 100) / 100,
      perfeitos: ranking.reduce((a, r) => a + r.perfeitos, 0),
    },
  });
});

// Backfill/consolidação: premia com 100 pontos todos os caixas que zeraram no mês (idempotente).
router.post('/premiar-zerados', exigePerfil('Tesouraria', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  const lojaId = req.body.loja_id || null;
  res.json(caixaGam.premiarZeradosDoMes(req.usuario.empresa_id, { ano, mes, lojaId, criadoPor: req.usuario.id }));
});

// GET /caixa/liberado?loja_id=&data=  — o lançamento de diferença está liberado? (gerente abriu o checklist do dia)
router.get('/liberado', (req, res) => {
  const data = req.query.data || new Date().toISOString().slice(0, 10);
  const lojaId = req.query.loja_id || req.usuario.loja_id || null;
  if (!lojaId) return res.json({ aberto: false, aberto_em: null, data, loja_id: null });
  const dia = db.prepare(`SELECT aberto_em FROM gerente_checklist_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, data);
  res.json({ aberto: !!dia?.aberto_em, aberto_em: dia?.aberto_em || null, data, loja_id: lojaId });
});

// POST /caixa — registra fechamento diário
// body: { data, faturamento, diferenca, observacao, turno, loja_id?, colaborador_id? }
router.post('/', exigePerfil('Tesouraria', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { data, diferenca, observacao, turno } = req.body;
  const loja_id = req.body.loja_id || req.usuario.loja_id;
  const colaborador_id = req.body.colaborador_id || null;
  if (diferenca === undefined || diferenca === null || diferenca === '') return res.status(400).json({ erro: 'Informe a diferença (0 se o caixa bateu).' });
  if (!colaborador_id) return res.status(400).json({ erro: 'Selecione o caixa (colaborador) a que a diferença pertence.' });
  if (!loja_id) return res.status(400).json({ erro: 'Selecione a loja onde ocorreu.' });
  const caixa = db.prepare(`SELECT id, loja_id FROM colaboradores WHERE id=? AND empresa_id=? AND funcao_id='func-caixa' AND ativo=1`).get(colaborador_id, req.usuario.empresa_id);
  if (!caixa) return res.status(400).json({ erro: 'O colaborador selecionado não é um caixa ativo.' });
  const dataLanc = data || new Date().toISOString().slice(0, 10);
  // Trava: o lançamento de diferença só libera depois que o GERENTE abre o Checklist Diário do dia/loja.
  const diaAberto = db.prepare(`SELECT aberto_em FROM gerente_checklist_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, loja_id, dataLanc);
  if (!diaAberto?.aberto_em) return res.status(400).json({ erro: `O gerente ainda não abriu o Checklist Diário desta loja em ${dataLanc}. O lançamento de diferença libera só depois disso.` });
  const dif = Number(diferenca);
  const precisaJustificar = Math.abs(dif) > 5;
  const id = uuidv4();
  db.prepare(`INSERT INTO lancamentos_caixa (id,empresa_id,loja_id,colaborador_id,turno,data,faturamento,diferenca,observacao,justif_status) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.usuario.empresa_id, loja_id, colaborador_id, turno || null, dataLanc, 0, dif, observacao || '', precisaJustificar ? 'pendente' : null);

  // Regra: diferença (sobra ou falta) acima de R$5 → tarefa para o COLABORADOR justificar
  let tarefa_gerada = false;
  if (precisaJustificar) {
    gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id, tipo: 'tarefa', origem: 'caixa_justificativa', referencia_id: id,
      titulo: `Justificar diferença de caixa (R$ ${Math.abs(dif).toFixed(2)})`,
      descricao: `Houve ${dif > 0 ? 'sobra' : 'falta'} de R$ ${Math.abs(dif).toFixed(2)} no caixa de ${data || 'hoje'}. Justifique para a Tesouraria avaliar.`,
      responsavel_id: colaborador_id, apoio_id: gerenteDaLoja(req.usuario.empresa_id, loja_id), urgente: 0, sla_horas: 48, criado_por: req.usuario.id,
    });
    tarefa_gerada = true;
  }
  // Frente 4: caixa zerado (diferença exatamente 0) → +100 pontos na loja de pontos (idempotente por dia).
  let pontos_premio = 0;
  if (dif === 0) {
    const pr = caixaGam.premiarCaixaZerado(req.usuario.empresa_id, { colaboradorId: colaborador_id, lojaId: loja_id, data: dataLanc, criadoPor: req.usuario.id });
    if (pr.premiado) pontos_premio = pr.pontos;
  }
  res.status(201).json({ mensagem: dif === 0 ? `Caixa bateu certinho!${pontos_premio ? ` +${pontos_premio} pontos 🎉` : ''}` : 'Diferença registrada.', id, precisa_justificar: precisaJustificar, tarefa_gerada, pontos_premio });
});

// POST /caixa/:id/justificar — o colaborador envia a justificativa
router.post('/:id/justificar', (req, res) => {
  const lanc = db.prepare('SELECT * FROM lancamentos_caixa WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!lanc) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  const texto = (req.body.justificativa || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Escreva a justificativa.' });
  db.prepare(`UPDATE lancamentos_caixa SET justificativa=?, justif_status='enviada' WHERE id=?`).run(texto, req.params.id);
  // Move a tarefa para a coluna Reanálise (Tesouraria decide aceitar/rejeitar)
  const t = db.prepare(`SELECT id FROM tarefas WHERE empresa_id=? AND origem='caixa_justificativa' AND referencia_id=? AND status!='concluido' ORDER BY criado_em DESC LIMIT 1`).get(req.usuario.empresa_id, req.params.id);
  if (t) db.prepare(`UPDATE tarefas SET reanalise_status='pendente' WHERE id=?`).run(t.id);
  res.json({ mensagem: 'Justificativa enviada para a Tesouraria.' });
});

// POST /caixa/:id/avaliar — Tesouraria aceita, rejeita ou pede reanálise da justificativa
router.post('/:id/avaliar', exigePerfil('Tesouraria', 'Gestor Geral', 'Diretor Geral', 'Supervisor'), (req, res) => {
  const { decisao, comentario } = req.body; // 'aceita' | 'rejeitada' | 'reanalise'
  if (!['aceita', 'rejeitada', 'reanalise'].includes(decisao)) return res.status(400).json({ erro: 'Decisão inválida.' });
  const lanc = db.prepare('SELECT * FROM lancamentos_caixa WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!lanc) return res.status(404).json({ erro: 'Lançamento não encontrado.' });

  if (decisao === 'reanalise') {
    // devolve para o colaborador refazer a justificativa
    db.prepare(`UPDATE lancamentos_caixa SET justif_status='pendente' WHERE id=?`).run(req.params.id);
    gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id: lanc.loja_id, tipo: 'tarefa', origem: 'caixa_justificativa', referencia_id: lanc.id,
      titulo: `Refazer justificativa de caixa (R$ ${Math.abs(lanc.diferenca).toFixed(2)})`,
      descricao: `A Tesouraria pediu reanálise: ${comentario || 'detalhe melhor a justificativa'}.`,
      responsavel_id: lanc.colaborador_id, apoio_id: gerenteDaLoja(req.usuario.empresa_id, lanc.loja_id), urgente: 0, sla_horas: 48, criado_por: req.usuario.id,
    });
    return res.json({ mensagem: 'Devolvido para reanálise.' });
  }

  db.prepare(`UPDATE lancamentos_caixa SET justif_status=? WHERE id=?`).run(decisao, req.params.id);
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now') WHERE empresa_id=? AND origem='caixa_justificativa' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, req.params.id);
  res.json({ mensagem: `Justificativa ${decisao}. ${decisao === 'aceita' ? 'A diferença foi neutralizada no indicador.' : 'A diferença segue impactando o indicador.'}` });
});

// GET /caixa/justificativas — fila de justificativas (colaborador vê as suas; Tesouraria vê todas)
router.get('/justificativas', (req, res) => {
  const ehGestao = GESTAO.includes(req.usuario.funcao_nome);
  let q = `SELECT lc.*, c.nome as colaborador_nome, l.nome as loja_nome FROM lancamentos_caixa lc
    LEFT JOIN colaboradores c ON c.id=lc.colaborador_id JOIN lojas l ON l.id=lc.loja_id
    WHERE lc.empresa_id=? AND lc.justif_status IS NOT NULL`;
  const p = [req.usuario.empresa_id];
  if (!ehGestao) { q += ' AND lc.colaborador_id=?'; p.push(req.usuario.id); }
  res.json({ justificativas: db.prepare(q + ' ORDER BY lc.data DESC').all(...p) });
});

module.exports = router;
module.exports.notaDaDiferenca = notaDaDiferenca;
