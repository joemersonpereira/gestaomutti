// caixaGamificacao.js — recompensas do caixa:
//  • Frente 4: caixa ZEROU (diferença = 0) → +100 pontos na loja de pontos (idempotente por dia).
//  • Frente 3: PONTUALIDADE — 1ª batida do dia ≤ horário previsto − 5 min (orientação: chegar 5 min antes).
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const tang = require('./tangerino');
const escala = require('./escalaHorario');

const PONTOS_ZERAR = 100; // default; agora configurável em Tesouraria (pontos_caixa_zerado)
const ANTECEDENCIA_MIN = 5; // minutos que o operador deve chegar antes
const pontosZerar = empresaId => {
  try { const v = require('./tesourariaErp').getConfig(empresaId).pontosCaixaZerado; return Number.isFinite(v) ? v : PONTOS_ZERAR; }
  catch { return PONTOS_ZERAR; }
};

// +pontos por caixa zerado (idempotente: 1 por colaborador+dia). 0 = desligado.
function premiarCaixaZerado(empresaId, { colaboradorId, colaboradorNome, lojaId, data, criadoPor }) {
  const pontos = pontosZerar(empresaId);
  if (!pontos) return { premiado: false, desligado: true };
  const ref = `caixa-zerado:${colaboradorId}:${data}`;
  const ja = db.prepare('SELECT 1 FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').get(empresaId, ref);
  if (ja) return { premiado: false, jaExistia: true };
  const nome = colaboradorNome || db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(colaboradorId)?.nome || '';
  db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
    VALUES (?,?,?,?,?, 'premio', ?, ?, ?, 'caixa', ?, ?, datetime('now'))`)
    .run(uuid(), empresaId, colaboradorId, nome, lojaId || null,
      `Caixa zerado em ${String(data).split('-').reverse().join('/')} — +${pontos} pontos`, pontos, String(data).slice(0, 7), ref, criadoPor || null);
  return { premiado: true, pontos };
}

// Backfill: premia todos os caixas que zeraram (lancamentos_caixa diferenca=0) num mês.
function premiarZeradosDoMes(empresaId, { ano, mes, lojaId, criadoPor }) {
  const rows = db.prepare(`SELECT lc.id, lc.colaborador_id, lc.loja_id, lc.data, c.nome
    FROM lancamentos_caixa lc JOIN colaboradores c ON c.id=lc.colaborador_id
    WHERE lc.empresa_id=? AND lc.diferenca=0
      AND CAST(strftime('%m', lc.data) AS INTEGER)=? AND CAST(strftime('%Y', lc.data) AS INTEGER)=?
      ${lojaId ? 'AND lc.loja_id=?' : ''}`).all(...(lojaId ? [empresaId, mes, ano, lojaId] : [empresaId, mes, ano]));
  let premiados = 0;
  for (const r of rows) {
    const res = premiarCaixaZerado(empresaId, { colaboradorId: r.colaborador_id, colaboradorNome: r.nome, lojaId: r.loja_id, data: String(r.data).slice(0, 10), criadoPor });
    if (res.premiado) premiados++;
  }
  return { zerados: rows.length, premiados, pontos: premiados * pontosZerar(empresaId) };
}

// Pontualidade dos caixas no mês: 1ª batida ≤ horário previsto − 5 min.
async function pontualidadeCaixas(empresaId, { ano, mes, lojaId, colaboradores }) {
  const out = new Map(); // colaboradorId -> {diasEscala, noPrazo, atrasos, semBatida, pct}
  const caixas = (colaboradores && colaboradores.length ? colaboradores
    : db.prepare(`SELECT id, nome, loja_id, tangerino_id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-caixa' AND ativo=1 ${lojaId ? 'AND loja_id=?' : ''}`).all(...(lojaId ? [empresaId, lojaId] : [empresaId])))
    .filter(c => c.tangerino_id);
  if (!caixas.length || !tang.habilitado()) return { ok: tang.habilitado(), pontualidade: {} };
  const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fimD = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(fimD).padStart(2, '0')}`;
  let bat; try { bat = await tang.todasBatidas({ startDate: ini, endDate: fim }); } catch { return { ok: false, erro: 'Tangerino indisponível' }; }
  // 1ª batida (entrada) por tangerino_id+data
  const primeira = new Map(); // tid -> Map(data -> minMs)
  for (const b of bat) {
    if (!b.dateIn) continue;
    const tid = String(b.employeeId); const data = String(b.date || '').slice(0, 10); if (!data) continue;
    if (!primeira.has(tid)) primeira.set(tid, new Map());
    const m = primeira.get(tid); const cur = m.get(data);
    if (cur == null || Number(b.dateIn) < cur) m.set(data, Number(b.dateIn));
  }
  const resultado = {};
  for (const c of caixas) {
    const m = primeira.get(String(c.tangerino_id)) || new Map();
    let diasEscala = 0, noPrazo = 0, atrasos = 0, semBatida = 0;
    for (const [data, primeiraMs] of m) {
      const prev = escala.horarioPrevisto(empresaId, c.id, data);
      if (!prev || prev.folga || !prev.entrada) continue; // sem escala/folga → não conta
      diasEscala++;
      const limite = new Date(`${data}T${prev.entrada}:00-03:00`).getTime() - ANTECEDENCIA_MIN * 60000;
      if (primeiraMs <= limite) noPrazo++; else atrasos++;
    }
    // dias com escala de trabalho mas sem batida nenhuma não entram (falta é outro fluxo)
    const pct = diasEscala ? Math.round(100 * noPrazo / diasEscala) : null;
    resultado[c.id] = { diasEscala, noPrazo, atrasos, semBatida, pct };
  }
  return { ok: true, pontualidade: resultado };
}

module.exports = { PONTOS_ZERAR, ANTECEDENCIA_MIN, premiarCaixaZerado, premiarZeradosDoMes, pontualidadeCaixas };
