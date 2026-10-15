// indicadoresCompraErp.js — indicadores de estoque do Painel de Compras (Fase 5).
// Ruptura, cobertura em dias, curva ABC e "orçamento de estoque aceitável" (excesso p/ remanejar).
// Filtros: loja (unidade) e comprador (produtos dos grupos vinculados).
const { erpQuery, habilitado } = require('../db/erp');
const { metaVals } = require('./metasCompra');
const { unisEmpresa } = require('./escopoCompras');
const { filtroProdutosComprador, clausulaProdutos } = require('./comprasErp');

// Resolve os produtos de um comprador (via grupos) em uma lista de produtoids do ERP.
async function produtosDoComprador(empresaId, compradorId) {
  if (!compradorId) return null;
  const filtro = await filtroProdutosComprador(empresaId, compradorId);
  if (!filtro) return [];
  const { expr, params } = clausulaProdutos(filtro, 'p');
  const rows = await erpQuery(`SELECT p.id FROM produto p WHERE p.status='A' AND ${expr}`, params);
  return rows.map(r => Number(r.id));
}

// filtro de produto opcional: retorna { sql, param } p/ anexar como "AND em.produtoid = ANY($N)".
function prodFilter(prodIds, pos) {
  if (!prodIds) return { sql: '', param: [] };
  return { sql: ` AND em.produtoid = ANY($${pos}::bigint[])`, param: [prodIds] };
}

async function valorEstoqueCusto(unis, prodIds) {
  const pf = prodFilter(prodIds, 2);
  const r = (await erpQuery(`
    SELECT sum(es.estoque * cp.customedio) valor, count(*) posicoes
    FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
      JOIN custoproduto cp ON cp.produtoid=em.produtoid AND cp.unidadenegocioid=es.unidadenegocioid
    WHERE es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque>0${pf.sql}`, [unis, ...pf.param]))[0] || {};
  return { valor: Number(r.valor) || 0, posicoes: Number(r.posicoes) || 0 };
}

async function ruptura(unis, prodIds) {
  const pf = prodFilter(prodIds, 2);
  const r = (await erpQuery(`
    WITH vend AS (
      SELECT DISTINCT em.produtoid FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN embalagem em ON em.id=iv.embalagemid
      WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND v.datahorafechamento >= now()-interval '30 days'${pf.sql}),
    estq AS (SELECT DISTINCT em.produtoid FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
      WHERE es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque>0${pf.sql})
    SELECT (SELECT count(*) FROM vend) com_venda,
           (SELECT count(*) FROM vend WHERE produtoid NOT IN (SELECT produtoid FROM estq)) em_ruptura`, [unis, ...pf.param]))[0] || {};
  const comVenda = Number(r.com_venda) || 0, emRuptura = Number(r.em_ruptura) || 0;
  return { comVenda, emRuptura, pct: comVenda ? Math.round(emRuptura / comVenda * 1000) / 10 : 0 };
}

async function custoVendidoDia(unis, prodIds) {
  const pf = prodFilter(prodIds, 2);
  const r = (await erpQuery(`
    SELECT sum(me.custo * abs(me.quantidade)) custo
    FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      JOIN embalagem em ON em.id=iv.embalagemid
    WHERE v.status IN ('F','D') AND iv.status='F'
      AND v.unidadenegocioid = ANY($1::bigint[]) AND v.datahorafechamento >= now()-interval '30 days'${pf.sql}`, [unis, ...pf.param]))[0] || {};
  return (Number(r.custo) || 0) / 30;
}

async function curvaABC(unis, prodIds) {
  const pf = prodFilter(prodIds, 2);
  const rows = await erpQuery(`
    WITH v AS (
      SELECT em.produtoid, sum(iv.valortotal) venda
      FROM itemvenda iv JOIN venda vv ON vv.id=iv.vendaid JOIN embalagem em ON em.id=iv.embalagemid
      WHERE vv.status='F' AND vv.unidadenegocioid = ANY($1::bigint[]) AND vv.datahorafechamento >= now()-interval '90 days'${pf.sql}
      GROUP BY em.produtoid HAVING sum(iv.valortotal) > 0),
    r AS (SELECT produtoid, venda,
            sum(venda) OVER (ORDER BY venda DESC ROWS UNBOUNDED PRECEDING) / NULLIF(sum(venda) OVER (),0) acum
          FROM v),
    cls AS (SELECT produtoid, venda, CASE WHEN acum <= 0.8 THEN 'A' WHEN acum <= 0.95 THEN 'B' ELSE 'C' END curva FROM r),
    stk AS (
      SELECT em.produtoid, sum(es.estoque*cp.customedio)::float8 valor
      FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
        JOIN custoproduto cp ON cp.produtoid=em.produtoid AND cp.unidadenegocioid=es.unidadenegocioid
      WHERE es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque>0${pf.sql}
      GROUP BY em.produtoid)
    SELECT cls.curva, count(*) n, sum(cls.venda)::float8 venda, COALESCE(sum(stk.valor),0)::float8 valor
    FROM cls LEFT JOIN stk ON stk.produtoid = cls.produtoid GROUP BY cls.curva`, [unis, ...pf.param]);
  const base = { A: { n: 0, venda: 0, valor: 0 }, B: { n: 0, venda: 0, valor: 0 }, C: { n: 0, venda: 0, valor: 0 }, D: { n: 0, venda: 0, valor: 0 } };
  for (const r of rows) if (base[r.curva]) base[r.curva] = { n: Number(r.n) || 0, venda: Number(r.venda) || 0, valor: Math.round(Number(r.valor) || 0) };
  // Curva D = tem ESTOQUE mas NÃO girou em 90 dias (estoque parado / giro zero). Mostra valor a custo.
  const pfe = prodFilter(prodIds, 2);
  const d = (await erpQuery(`
    SELECT count(DISTINCT em.produtoid) n, COALESCE(sum(es.estoque*cp.customedio),0)::float8 valor
    FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
      JOIN custoproduto cp ON cp.produtoid=em.produtoid AND cp.unidadenegocioid=es.unidadenegocioid
    WHERE es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque>0${pfe.sql}
      AND NOT EXISTS (SELECT 1 FROM itemvenda iv JOIN venda vv ON vv.id=iv.vendaid JOIN embalagem em2 ON em2.id=iv.embalagemid
        WHERE em2.produtoid=em.produtoid AND vv.status='F' AND vv.unidadenegocioid=ANY($1::bigint[]) AND vv.datahorafechamento>=now()-interval '90 days')`,
    [unis, ...pfe.param]))[0] || {};
  base.D = { n: Number(d.n) || 0, venda: 0, valor: Math.round(Number(d.valor) || 0) };
  return base;
}

// Conversão de produtos novos (maturidade): dos produtos comprados pela 1ª vez na janela
// (novos na base), quantos já tiveram ≥1 venda ("converteram"), o tempo médio até a 1ª venda
// e o valor em estoque parado dos que ainda não venderam.
async function conversaoProdutosNovos(unis, prodIds, janelaDias) {
  const pf = prodFilter(prodIds, 3);
  const r = (await erpQuery(`
    WITH ent AS (
      SELECT em.produtoid, MIN(nf.datahoraentrada) entrada
      FROM notafiscal nf
      JOIN itemnotafiscal ii ON ii.notafiscalid = nf.id
      JOIN embalagem em ON em.id = ii.embalagemid
      WHERE nf.unidadenegocioid = ANY($1::bigint[]) AND nf.status NOT IN ('X','E')
        AND nf.datahoraentrada >= now() - ($2 || ' days')::interval${pf.sql}
      GROUP BY em.produtoid),
    prim AS (  -- realmente novos: sem entrada anterior à janela
      SELECT e.produtoid, e.entrada FROM ent e
      WHERE NOT EXISTS (
        SELECT 1 FROM notafiscal nf2 JOIN itemnotafiscal ii2 ON ii2.notafiscalid=nf2.id
          JOIN embalagem em2 ON em2.id=ii2.embalagemid
        WHERE em2.produtoid = e.produtoid AND nf2.unidadenegocioid = ANY($1::bigint[])
          AND nf2.status NOT IN ('X','E')
          AND nf2.datahoraentrada < now() - ($2 || ' days')::interval)),
    venda1 AS (
      SELECT em.produtoid, MIN(v.datahorafechamento) v1
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN embalagem em ON em.id=iv.embalagemid
      WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[])
        AND em.produtoid IN (SELECT produtoid FROM prim)
      GROUP BY em.produtoid)
    SELECT
      count(*) total,
      count(*) FILTER (WHERE vd.v1 IS NOT NULL AND vd.v1 >= p.entrada) convertidos,
      avg(EXTRACT(EPOCH FROM (vd.v1 - p.entrada))/86400) FILTER (WHERE vd.v1 IS NOT NULL AND vd.v1 >= p.entrada) dias_medio,
      COALESCE(sum(pe.valor) FILTER (WHERE vd.v1 IS NULL OR vd.v1 < p.entrada),0) valor_parado
    FROM prim p
    LEFT JOIN venda1 vd ON vd.produtoid = p.produtoid
    LEFT JOIN LATERAL (
      SELECT sum(es.estoque*cp.customedio) valor
      FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
        JOIN custoproduto cp ON cp.produtoid=em.produtoid AND cp.unidadenegocioid=es.unidadenegocioid
      WHERE em.produtoid=p.produtoid AND es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque>0
    ) pe ON true`, [unis, janelaDias, ...pf.param]).catch(() => [{}]))[0] || {};
  const total = Number(r.total) || 0;
  const convertidos = Number(r.convertidos) || 0;
  return {
    total, convertidos, parados: total - convertidos,
    pct: total ? Math.round(convertidos / total * 1000) / 10 : null,
    diasMedio: r.dias_medio != null ? Math.round(Number(r.dias_medio)) : null,
    valorParado: Math.round(Number(r.valor_parado) || 0),
    janelaDias,
  };
}

async function indicadoresEstoque(empresaId, { lojaId, compradorId } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const prodIds = await produtosDoComprador(empresaId, compradorId);
  if (compradorId && (!prodIds || !prodIds.length)) return { erp: true, semComprador: true, erro: 'Comprador sem grupos vinculados.' };
  const m = metaVals(empresaId, compradorId);   // usa a meta do comprador (override) quando um comprador está selecionado
  const janelaNovos = m.conversao_novos_janela || 90;
  const [estoque, rup, custoDia, abc, novos] = await Promise.all([
    valorEstoqueCusto(unis, prodIds), ruptura(unis, prodIds), custoVendidoDia(unis, prodIds), curvaABC(unis, prodIds),
    conversaoProdutosNovos(unis, prodIds, janelaNovos),
  ]);
  const cobertura = custoDia > 0 ? Math.round(estoque.valor / custoDia) : null;
  const alvoMin = Math.round(custoDia * (m.cobertura_min || 30));
  const alvoMax = Math.round(custoDia * (m.cobertura_max || 45));
  const excesso = estoque.valor > alvoMax ? Math.round(estoque.valor - alvoMax) : 0;
  const falta = estoque.valor < alvoMin ? Math.round(alvoMin - estoque.valor) : 0;

  const semRuptura = rup.pct <= (m.ruptura_max || 5) ? 'verde' : rup.pct <= (m.ruptura_max || 5) * 2 ? 'amarelo' : 'vermelho';
  const semCobertura = cobertura == null ? 'cinza'
    : (cobertura >= (m.cobertura_min || 30) && cobertura <= (m.cobertura_max || 45)) ? 'verde'
    : (cobertura < (m.cobertura_min || 30)) ? 'amarelo' : 'vermelho';

  const metaNovos = m.conversao_novos_meta || 70;
  const semNovos = novos.pct == null ? 'cinza'
    : novos.pct >= metaNovos ? 'verde'
    : novos.pct >= metaNovos * 0.7 ? 'amarelo' : 'vermelho';

  return {
    erp: true,
    estoque: { valor: Math.round(estoque.valor), posicoes: estoque.posicoes },
    ruptura: { ...rup, meta: m.ruptura_max, semaforo: semRuptura },
    cobertura: { dias: cobertura, min: m.cobertura_min, max: m.cobertura_max, custoDia: Math.round(custoDia), semaforo: semCobertura },
    orcamentoEstoque: { alvoMin, alvoMax, excesso, falta },
    curvaABC: abc,
    produtosNovos: { ...novos, meta: metaNovos, semaforo: semNovos },
  };
}

module.exports = { indicadoresEstoque };
