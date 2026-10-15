// fornecedorErp.js — Termômetro do Fornecedor + gatilho de visitas (a cada R$500k acumulado).
// Métricas lidas do ERP (Postgres). O acúmulo p/ visita usa compra do ANO CORRENTE (monotônico).
const { erpQuery, habilitado } = require('../db/erp');

const FAIXA_VISITA = 500000; // R$ acumulado por gatilho de visita

// Compra por fornecedor: 12 meses + ano corrente (YTD). Entrada = notafiscal com fornecedor e entrada.
async function compraPorFornecedor() {
  const rows = await erpQuery(`
    SELECT nf.fornecedorid fid, p.nome nome,
      SUM(nf.valortotal) total12m,
      SUM(CASE WHEN nf.datahoraentrada >= date_trunc('year', now()) THEN nf.valortotal ELSE 0 END) ytd,
      COUNT(*) nfs,
      MAX(nf.datahoraentrada) ultima
    FROM notafiscal nf
    JOIN fornecedor f ON f.id = nf.fornecedorid
    JOIN pessoa p ON p.id = f.pessoaid
    WHERE nf.fornecedorid IS NOT NULL
      AND nf.datahoraentrada IS NOT NULL
      AND nf.datahoraentrada >= now() - interval '12 months'
      AND nf.status NOT IN ('X','E')            -- exclui canceladas/estornadas
    GROUP BY nf.fornecedorid, p.nome`);
  const m = new Map();
  for (const r of rows) m.set(Number(r.fid), {
    id: Number(r.fid), nome: r.nome,
    compra12m: Number(r.total12m) || 0, ytd: Number(r.ytd) || 0,
    nfs: Number(r.nfs) || 0, ultimaCompra: r.ultima,
  });
  return m;
}

// Entrega: 1º recebimento físico de cada pedido vs data programada. Atraso em dias.
async function entregaPorFornecedor() {
  const rows = await erpQuery(`
    SELECT pc.fornecedorid fid,
      COUNT(*) pedidos,
      COUNT(rec.dt) recebidos,
      SUM(CASE WHEN rec.dt::date > pc.dataentregaprogramada::date THEN 1 ELSE 0 END) atrasados,
      AVG(CASE WHEN rec.dt IS NOT NULL AND pc.dataentregaprogramada IS NOT NULL
            THEN GREATEST(0, (rec.dt::date - pc.dataentregaprogramada::date)) END) atraso_medio
    FROM pedidocompra pc
    LEFT JOIN LATERAL (
      SELECT MIN(rf.datahora) dt
      FROM recebimentofisicopedidocompra rfp
      JOIN recebimentofisico rf ON rf.id = rfp.recebimentofisicoid
      WHERE rfp.pedidocompraid = pc.id
    ) rec ON true
    WHERE pc.fornecedorid IS NOT NULL
      AND pc.datahora >= now() - interval '12 months'
      AND pc.status NOT IN ('C','I')            -- exclui cancelado/inativo
      AND pc.dataentregaprogramada IS NOT NULL
    GROUP BY pc.fornecedorid`);
  const m = new Map();
  for (const r of rows) {
    const pedidos = Number(r.pedidos) || 0, atrasados = Number(r.atrasados) || 0;
    m.set(Number(r.fid), {
      pedidos, recebidos: Number(r.recebidos) || 0, atrasados,
      atrasoMedio: r.atraso_medio != null ? Number(r.atraso_medio) : null,
      pctAtraso: pedidos ? Math.round((atrasados / pedidos) * 100) : 0,
    });
  }
  return m;
}

// Devoluções ao fornecedor: abertas (não finalizadas) e tempo médio p/ finalizar (proxy de coleta/reembolso).
async function devolucaoPorFornecedor() {
  const rows = await erpQuery(`
    SELECT fornecedorid fid,
      COUNT(*) total,
      SUM(CASE WHEN status <> 'F' THEN 1 ELSE 0 END) abertas,
      SUM(CASE WHEN status <> 'F' AND datahorainicial < now() - interval '15 days' THEN 1 ELSE 0 END) abertas_atrasadas,
      AVG(CASE WHEN status='F' AND datahorafinal IS NOT NULL
            THEN (datahorafinal::date - datahorainicial::date) END) dias_medio
    FROM devolucaocompra
    WHERE fornecedorid IS NOT NULL AND datahorainicial >= now() - interval '12 months'
    GROUP BY fornecedorid`);
  const m = new Map();
  for (const r of rows) m.set(Number(r.fid), {
    total: Number(r.total) || 0, abertas: Number(r.abertas) || 0,
    abertasAtrasadas: Number(r.abertas_atrasadas) || 0,
    diasMedio: r.dias_medio != null ? Number(r.dias_medio) : null,
  });
  return m;
}

// Conciliação pedido × XML: proxy pela pendência de conferência da NF de entrada.
async function conciliacaoPorFornecedor() {
  const rows = await erpQuery(`
    SELECT nf.fornecedorid fid, COUNT(*) nfs,
      SUM(CASE WHEN nf.pendenciaconferencia IN ('S','1','t','T') THEN 1 ELSE 0 END) com_pendencia,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM notafiscalocorrencia o WHERE o.notafiscalid = nf.id) THEN 1 ELSE 0 END) com_ocorrencia
    FROM notafiscal nf
    WHERE nf.fornecedorid IS NOT NULL AND nf.datahoraentrada >= now() - interval '12 months'
      AND nf.status NOT IN ('X','E')
    GROUP BY nf.fornecedorid`);
  const m = new Map();
  for (const r of rows) {
    const nfs = Number(r.nfs) || 0;
    const div = Math.max(Number(r.com_pendencia) || 0, Number(r.com_ocorrencia) || 0);
    m.set(Number(r.fid), { nfs, comPendencia: Number(r.com_pendencia) || 0, comOcorrencia: Number(r.com_ocorrencia) || 0,
      divergencias: div, pctDivergencia: nfs ? Math.round((div / nfs) * 1000) / 10 : 0 });
  }
  return m;
}

// Nota 0–100 e cor do termômetro, combinando entrega, devolução e conciliação.
// Scoring usa as METAS editáveis (compras_metas): limiar verde = termometro_nota; a penalidade de
// atraso só começa a partir da meta entrega_atraso_max (fornecedor dentro da meta não perde por atraso).
function pontuar(f, m = {}) {
  const notaMin = Number(m.termometro_nota) || 80;
  const metaAtraso = Number(m.entrega_atraso_max) || 15;
  let nota = 100;
  if (f.entrega && f.entrega.pedidos) nota -= Math.min(40, Math.max(0, (Number(f.entrega.pctAtraso) || 0) - metaAtraso) * 2);
  if (f.devolucao) nota -= Math.min(20, (f.devolucao.abertasAtrasadas || 0) * 5);
  if (f.conciliacao && f.conciliacao.nfs) nota -= Math.min(30, (Number(f.conciliacao.pctDivergencia) || 0) * 0.3);
  nota = Math.max(0, Math.round(nota));
  const cor = nota >= notaMin ? 'verde' : nota >= notaMin - 20 ? 'amarelo' : 'vermelho';
  return { nota, cor };
}

// Divergência NF × pedido (via recebimento físico): sobra/falta de quantidade + diferença de preço
// (pedido × XML da NF). Resumo por fornecedor (janela de `dias`) para o termômetro.
async function divergenciasResumo({ dias = 90 } = {}) {
  if (!habilitado()) return new Map();
  const rows = await erpQuery(`
    WITH item AS (
      SELECT nf.fornecedorid fid,
        sum(ip.quantidadeembalagem)::float8 qp, sum(ii.quantidade)::float8 qn,
        max(ip.precocompra)::float8 pp, max(ii.valorunitario)::float8 pn
      FROM itemrecebimentofisico irf
      JOIN notafiscal nf ON nf.id=irf.notafiscalid
      JOIN embalagem erf ON erf.id=irf.embalagemid
      JOIN itemnotafiscal ii ON ii.notafiscalid=irf.notafiscalid AND ii.embalagemid=irf.embalagemid
      JOIN itempedidocompra ip ON ip.pedidocompraid=irf.pedidocompraid
      JOIN embalagem eip ON eip.id=ip.embalagemid AND eip.produtoid=erf.produtoid
      WHERE nf.status NOT IN ('X','E') AND nf.fornecedorid IS NOT NULL
        AND nf.datahoraentrada >= now() - ($1 || ' days')::interval
      GROUP BY nf.fornecedorid, irf.notafiscalid, irf.pedidocompraid, erf.produtoid)
    SELECT fid,
      count(*) FILTER (WHERE qn<>qp OR (pp>0 AND abs(pn-pp)>0.01*pp)) divergentes,
      count(*) FILTER (WHERE qn>qp) sobras,
      count(*) FILTER (WHERE qn<qp) faltas,
      count(*) FILTER (WHERE pp>0 AND abs(pn-pp)>0.01*pp) preco_div,
      COALESCE(sum((pn-pp)*qn) FILTER (WHERE pp>0 AND abs(pn-pp)>0.01*pp),0) impacto
    FROM item GROUP BY fid`, [dias]);
  const map = new Map();
  for (const r of rows) map.set(Number(r.fid), {
    divergentes: Number(r.divergentes) || 0, sobras: Number(r.sobras) || 0, faltas: Number(r.faltas) || 0,
    precoDiv: Number(r.preco_div) || 0, impactoPreco: Math.round(Number(r.impacto) || 0),
  });
  return map;
}

// Detalhe das divergências de UM fornecedor (drill ao clicar). Cada linha = NF×pedido×produto.
async function divergenciasFornecedor({ fornecedorId, dias = 90, limite = 300 } = {}) {
  if (!habilitado() || !fornecedorId) return { itens: [] };
  const rows = await erpQuery(`
    SELECT pr.descricao, nf.datahoraentrada data, nf.numero nf_numero, pc.codigo pedido,
      sum(ip.quantidadeembalagem)::float8 qp, sum(ii.quantidade)::float8 qn,
      max(ip.precocompra)::float8 pp, max(ii.valorunitario)::float8 pn
    FROM itemrecebimentofisico irf
    JOIN notafiscal nf ON nf.id=irf.notafiscalid
    JOIN pedidocompra pc ON pc.id=irf.pedidocompraid
    JOIN embalagem erf ON erf.id=irf.embalagemid
    JOIN produto pr ON pr.id=erf.produtoid
    JOIN itemnotafiscal ii ON ii.notafiscalid=irf.notafiscalid AND ii.embalagemid=irf.embalagemid
    JOIN itempedidocompra ip ON ip.pedidocompraid=irf.pedidocompraid
    JOIN embalagem eip ON eip.id=ip.embalagemid AND eip.produtoid=erf.produtoid
    WHERE nf.fornecedorid=$1 AND nf.status NOT IN ('X','E') AND nf.datahoraentrada >= now() - ($2 || ' days')::interval
    GROUP BY pr.descricao, nf.datahoraentrada, nf.numero, pc.codigo, irf.notafiscalid, irf.pedidocompraid, erf.produtoid
    HAVING sum(ip.quantidadeembalagem)<>sum(ii.quantidade)
        OR (max(ip.precocompra)>0 AND abs(max(ip.precocompra)-max(ii.valorunitario))>0.01*max(ip.precocompra))
    ORDER BY nf.datahoraentrada DESC LIMIT $3`, [fornecedorId, dias, limite]);
  const itens = rows.map(r => {
    const qp = Number(r.qp) || 0, qn = Number(r.qn) || 0, pp = Number(r.pp) || 0, pn = Number(r.pn) || 0;
    const difQtd = Math.round((qn - qp) * 100) / 100, difPreco = Math.round((pn - pp) * 100) / 100;
    const precoSignif = pp > 0 && Math.abs(pn - pp) > 0.01 * pp;
    return {
      descricao: r.descricao, data: r.data, nf: r.nf_numero, pedido: r.pedido,
      qtdPedido: qp, qtdNf: qn, difQtd, tipoQtd: difQtd > 0 ? 'sobra' : difQtd < 0 ? 'falta' : null,
      precoPedido: Math.round(pp * 100) / 100, precoNf: Math.round(pn * 100) / 100, difPreco, precoSignif,
      pctPreco: pp > 0 ? Math.round((pn - pp) / pp * 1000) / 10 : null,
      impacto: precoSignif ? Math.round(difPreco * qn) : 0,
    };
  });
  return { itens, dias };
}

// Termômetro consolidado (todos os fornecedores com compra nos últimos 12m).
async function termometroFornecedores({ busca = '', limite = 300, metas = {} } = {}) {
  if (!habilitado()) return { fornecedores: [], erp: false };
  const [compra, entrega, devol, concil, diverg] = await Promise.all([
    compraPorFornecedor(), entregaPorFornecedor(), devolucaoPorFornecedor(), conciliacaoPorFornecedor(), divergenciasResumo({ dias: 90 }),
  ]);
  let out = [];
  for (const [id, base] of compra) {
    const f = { ...base, entrega: entrega.get(id) || null, devolucao: devol.get(id) || null, conciliacao: concil.get(id) || null, divergencia: diverg.get(id) || null };
    Object.assign(f, pontuar(f, metas));
    out.push(f);
  }
  if (busca) { const b = busca.toLowerCase(); out = out.filter(f => (f.nome || '').toLowerCase().includes(b)); }
  out.sort((a, b) => b.compra12m - a.compra12m);
  return { fornecedores: out.slice(0, limite), total: out.length, erp: true, faixaVisita: FAIXA_VISITA };
}

// Compra do ANO CORRENTE por fornecedor (base do gatilho de visita). Monotônico dentro do ano.
async function compraAnoCorrente() {
  const rows = await erpQuery(`
    SELECT nf.fornecedorid fid, p.nome nome, SUM(nf.valortotal) ytd
    FROM notafiscal nf
    JOIN fornecedor f ON f.id = nf.fornecedorid
    JOIN pessoa p ON p.id = f.pessoaid
    WHERE nf.fornecedorid IS NOT NULL AND nf.datahoraentrada >= date_trunc('year', now())
      AND nf.status NOT IN ('X','E')
    GROUP BY nf.fornecedorid, p.nome`);
  return rows.map(r => ({ id: Number(r.fid), nome: r.nome, ytd: Number(r.ytd) || 0 }));
}

module.exports = { FAIXA_VISITA, termometroFornecedores, compraAnoCorrente, divergenciasFornecedor };
