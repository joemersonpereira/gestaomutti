// atendimentoOnlineLib.js — tempos de atendimento + média de avaliação (CSAT) do Online (BotVendas).
// TEMPOS: tabela `botvendas_atendimentos` (resp_seconds = 1ª resposta, ta_seconds = atendimento total).
// AVALIAÇÃO (média): tabela `botvendas_satisfacao` (CSAT 1-5, fonte autoritativa — bate com o relatório
// do BotVendas). A loja da nota é resolvida pela própria linha ou, se faltar, pelo order_id do atendimento.
const db = require('../db/connection');
const { normalizarLojas } = require('./escopoCompras');

// Agrega a média de avaliação (CSAT) da tabela de satisfação, resolvendo a loja por
// COALESCE(loja da nota, loja do atendimento do mesmo pedido). Devolve {geral, porLoja}.
// Janela = [de, ate] (ISO). `ate` opcional (null = sem limite superior).
function avaliacao(empresaId, lojas, de, ate) {
  const base = `FROM botvendas_satisfacao s
    LEFT JOIN botvendas_atendimentos a ON a.empresa_id=s.empresa_id AND a.order_id=s.order_id
    WHERE s.empresa_id=? AND s.nota IS NOT NULL AND COALESCE(s.respondido_em, s.sincronizado_em) >= ?${ate ? ' AND COALESCE(s.respondido_em, s.sincronizado_em) <= ?' : ''}`;
  const p = ate ? [empresaId, de, ate] : [empresaId, de];
  const lojaExpr = 'COALESCE(s.loja_id, a.loja_id)';
  let filtroLoja = '';
  if (lojas.length) { filtroLoja = ` AND ${lojaExpr} IN (${lojas.map(() => '?').join(',')})`; p.push(...lojas); }
  const geral = db.prepare(`SELECT round(avg(nota),2) media, count(*) n FROM (
    SELECT s.nota ${base}${filtroLoja})`).get(...p);
  const porLoja = db.prepare(`SELECT loja_id, round(avg(nota),2) media, count(*) n FROM (
    SELECT ${lojaExpr} loja_id, s.nota ${base}${filtroLoja}) WHERE loja_id IS NOT NULL
    GROUP BY loja_id`).all(...p);
  const mapa = {}; porLoja.forEach(l => { mapa[l.loja_id] = { media: l.media, n: l.n }; });
  return { media: geral.media != null ? geral.media : null, n: geral.n || 0, porLoja: mapa };
}

function atendimentoOnline(empresaId, { lojaId = '', dias = 30, ini = '', fim = '' } = {}) {
  const lojas = normalizarLojas(lojaId);
  // Janela: datas explícitas (ini/fim) OU últimos N dias. `de`/`ate` em ISO.
  const temRange = ini && fim;
  const de = temRange ? String(ini).slice(0, 10) + 'T00:00:00' : new Date(Date.now() - (Math.max(1, Number(dias) || 30) * 86400000)).toISOString();
  const ate = temRange ? String(fim).slice(0, 10) + 'T23:59:59' : null;
  const dtExpr = 'COALESCE(closed_at, updated_at, sincronizado_em)';
  const where = ['empresa_id=?', `${dtExpr} >= ?`]; const p = [empresaId, de];
  if (ate) { where.push(`${dtExpr} <= ?`); p.push(ate); }
  if (lojas.length) { where.push('loja_id IN (' + lojas.map(() => '?').join(',') + ')'); p.push(...lojas); }
  const w = where.join(' AND ');
  // TEMPOS + volume + venda (venda/ticket/conversão continuam dos atendimentos; score sai da satisfação).
  const r = db.prepare(`SELECT count(*) atend,
      round(avg(resp_seconds)) resp, round(avg(ta_seconds)) ta, count(resp_seconds) com_resp,
      count(*) FILTER (WHERE total > 0) convertidos,
      sum(COALESCE(total,0)) venda_total,
      avg(total) FILTER (WHERE total > 0) ticket
    FROM botvendas_atendimentos WHERE ${w}`).get(...p);
  const porLojaT = db.prepare(`SELECT loja_id, count(*) atend, round(avg(resp_seconds)) resp, round(avg(ta_seconds)) ta
    FROM botvendas_atendimentos WHERE ${w} GROUP BY loja_id ORDER BY count(*) DESC`).all(...p);

  // AVALIAÇÃO (CSAT real): no período e, p/ não ficar vazia em janelas curtas, uma geral de 180 dias.
  const av = avaliacao(empresaId, lojas, de, ate);
  const avG = avaliacao(empresaId, lojas, new Date(Date.now() - 180 * 86400000).toISOString(), null);

  const toMin = s => s != null ? Math.round(s / 60 * 10) / 10 : null;
  const atend = r.atend || 0; const convertidos = r.convertidos || 0;
  return {
    atendimentos: atend, comResp: r.com_resp || 0,
    score: av.media, comScore: av.n,                         // média de avaliação do período (CSAT)
    scoreGeral: avG.media, scoreGeralQtd: avG.n,             // fallback 180d p/ não zerar
    convertidos, conversao: atend ? Math.round(convertidos / atend * 1000) / 10 : null,
    vendaTotal: Math.round(Number(r.venda_total) || 0), ticket: r.ticket != null ? Math.round(Number(r.ticket) * 100) / 100 : null,
    respSeg: r.resp || null, taSeg: r.ta || null, respMin: toMin(r.resp), taMin: toMin(r.ta),
    porLoja: porLojaT.map(l => ({
      loja_id: l.loja_id, atend: l.atend, respMin: toMin(l.resp), taMin: toMin(l.ta),
      score: av.porLoja[l.loja_id] ? av.porLoja[l.loja_id].media : null,
      comScore: av.porLoja[l.loja_id] ? av.porLoja[l.loja_id].n : 0,
    })),
  };
}
module.exports = { atendimentoOnline };
