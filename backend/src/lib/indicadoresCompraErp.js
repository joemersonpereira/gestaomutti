// indicadoresCompraErp.js — indicadores de estoque do Painel de Compras (Fase 5).
// Ruptura, cobertura em dias, curva ABC e "orçamento de estoque aceitável" (excesso p/ remanejar).
// Filtros: loja (unidade) e comprador (produtos dos grupos vinculados).
const { erpQuery, habilitado } = require('../db/erp');
const { metaVals } = require('./metasCompra');
const { unisEmpresa, lojasEmpresa } = require('./escopoCompras');
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
      WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND v.datahorafechamento >= now()-interval '30 days'${pf.sql}
        AND NOT EXISTS (SELECT 1 FROM suspendecompraprodutounidadenegocio s WHERE s.produtoid=em.produtoid AND s.unidadenegocioid = ANY($1::bigint[]))),
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
    valorEstoqueCusto(unis, prodIds), _rupturaAgregadaPorLoja(empresaId, lojaId, prodIds), custoVendidoDia(unis, prodIds), curvaABC(unis, prodIds),
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

// Retorno do falteiro — tela "Falteiro" do A7 (falta registrada no balcão). Status: A=Pendente, B=Atendido
// (o comprador incluiu na compra), C=Cancelado. "Retorno" = taxa de atendimento = atendidos ÷ (pendentes+atendidos).
// Escopo por comprador: só conta faltas de produtos das classificações/grupos dele (produtoid).
async function retornoFalteiro(empresaId, { lojaId, compradorId, dias = 60 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const prodIds = await produtosDoComprador(empresaId, compradorId);
  if (compradorId && (!prodIds || !prodIds.length)) return { erp: true, semComprador: true };
  const pf = prodIds ? ' AND f.produtoid = ANY($3::bigint[])' : '';
  const params = prodIds ? [unis, dias, prodIds] : [unis, dias];
  const r = (await erpQuery(`
    SELECT count(*) FILTER (WHERE f.status='A') pendentes,
           count(*) FILTER (WHERE f.status='B') atendidos,
           count(*) FILTER (WHERE f.status='C') cancelados
    FROM falteiro f
    WHERE f.unidadenegocioid = ANY($1::bigint[]) AND f.produtoid IS NOT NULL
      AND f.datahora >= now() - ($2 || ' days')::interval${pf}`, params).catch(() => [{}]))[0] || {};
  const pendentes = Number(r.pendentes) || 0, atendidos = Number(r.atendidos) || 0, cancelados = Number(r.cancelados) || 0;
  const base = pendentes + atendidos;
  const taxa = base ? Math.round(atendidos / base * 1000) / 10 : null; // % (null = sem falta no período)
  return { erp: true, dias, pendentes, atendidos, cancelados, taxa };
}

// CMV% do comprador no mês: custo da mercadoria vendida ÷ venda, só dos produtos dos grupos dele.
async function cmvComprador(empresaId, { lojaId = '', compradorId, ano, mes } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const prodIds = await produtosDoComprador(empresaId, compradorId);
  if (compradorId && (!prodIds || !prodIds.length)) return { erp: true, semComprador: true };
  const now = new Date(); const y = Number(ano) || now.getFullYear(); const m = Number(mes) || (now.getMonth() + 1);
  const pf = prodIds ? ' AND em.produtoid = ANY($4::bigint[])' : '';
  const params = prodIds ? [unis, y, m, prodIds] : [unis, y, m];
  const r = (await erpQuery(`
    SELECT sum(me.custo*abs(me.quantidade)) custo, sum(iv.valortotal) venda
    FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      JOIN embalagem em ON em.id=iv.embalagemid
    WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid = ANY($1::bigint[])
      AND date_part('year', v.datahorafechamento)=$2 AND date_part('month', v.datahorafechamento)=$3${pf}`, params).catch(() => [{}]))[0] || {};
  const custo = Number(r.custo) || 0, venda = Number(r.venda) || 0;
  return { erp: true, ano: y, mes: m, custo, venda, cmv: venda ? Math.round(custo / venda * 1000) / 10 : null };
}

// Valor (a custo) BAIXADO por VENCIMENTO no mês — itens de baixa ligados a item pré-vencido.
// Só dos produtos dos grupos do comprador. Usado para o indicador Vencidos (%) = vencido ÷ estoque.
async function vencidoComprador(empresaId, { lojaId = '', compradorId, ano, mes } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const prodIds = await produtosDoComprador(empresaId, compradorId);
  if (compradorId && (!prodIds || !prodIds.length)) return { erp: true, semComprador: true };
  const now = new Date(); const y = Number(ano) || now.getFullYear(); const m = Number(mes) || (now.getMonth() + 1);
  const pf = prodIds ? ' AND em.produtoid = ANY($4::bigint[])' : '';
  const params = prodIds ? [unis, y, m, prodIds] : [unis, y, m];
  // Vencidos = baixa de estoque com MOTIVO "PRODUTO VENCIDO" (a tela Baixa de Estoque do A7). É a
  // realidade operacional; o antigo filtro por itemprevencidoid pegava só ~17% do valor real (validado).
  const r = (await erpQuery(`
    SELECT sum(me.custo*abs(me.quantidade))::float8 custo
    FROM itembaixaestoque ib
      JOIN baixaestoque b ON b.id=ib.baixaestoqueid
      JOIN motivo mo ON mo.id=b.motivoid
      JOIN movimentacaoestoque me ON me.id=ib.movimentacaoestoqueid
      JOIN embalagem em ON em.id=ib.embalagemid
    WHERE mo.descricao ILIKE '%VENCIDO%'
      AND b.unidadenegocioid = ANY($1::bigint[])
      AND date_part('year', b.datahora)=$2 AND date_part('month', b.datahora)=$3${pf}`, params).catch(() => [{}]))[0] || {};
  return { erp: true, ano: y, mes: m, custo: Number(r.custo) || 0 };
}

// Sugestão de META de CMV do comprador = CMV dos produtos dos grupos dele nos últimos `meses`, calculado
// POR LOJA e tirando a MÉDIA DAS LOJAS (cada loja pesa igual, não deixa a loja grande esconder a pequena).
// É o que o Joe quer trazer pra meta (2026-11-15). Também devolve a ponderada p/ comparar.
async function cmvCompradorSugestao(empresaId, { compradorId, meses = 3 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, '');
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const prodIds = await produtosDoComprador(empresaId, compradorId);
  if (!prodIds || !prodIds.length) return { erp: true, semComprador: true };
  const m = Math.max(1, Math.min(12, Number(meses) || 3));
  const r = (await erpQuery(`
    WITH base AS (
      SELECT v.unidadenegocioid uni,
        sum(me.custo*abs(me.quantidade)) custo, sum(iv.valortotal) venda
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
        JOIN embalagem em ON em.id=iv.embalagemid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid = ANY($1::bigint[])
        AND v.datahorafechamento >= date_trunc('month', now()) - (($2-1) || ' months')::interval
        AND em.produtoid = ANY($3::bigint[])
      GROUP BY v.unidadenegocioid)
    SELECT avg(CASE WHEN venda>0 THEN custo/venda*100 END)::float8 cmv_lojas,
           (sum(custo)/NULLIF(sum(venda),0)*100)::float8 cmv_pond,
           count(*) FILTER (WHERE venda>0) lojas_n
    FROM base`, [unis, m, prodIds]).catch(() => [{}]))[0] || {};
  const r1 = v => v == null ? null : Math.round(Number(v) * 10) / 10;
  return { erp: true, meses: m, cmvLojas: r1(r.cmv_lojas), cmvPond: r1(r.cmv_pond), lojas: Number(r.lojas_n) || 0 };
}

// ── Análise de RUPTURA (aba própria): por loja, curva e classificação, com custo (venda perdida) ──
// Método (artigo guiadafarmacia + integrity-ux): Ruptura% = SKUs em ruptura ÷ SKUs que deveriam estar × 100,
// onde "deveria estar" = VENDEU nos últimos 30 dias (demanda comprovada). Custo = venda recente dos itens em
// ruptura × FATOR de não-recuperação (padrão 0,43 = 32% compra em outra loja + 11% não compra, Gruen 2002).
const FATOR_RUPTURA_PADRAO = 0.43;
function fatorRup(v) { const n = Number(v); return (v != null && v !== '' && !isNaN(n) && n > 0 && n <= 1) ? n : FATOR_RUPTURA_PADRAO; }

// Coleta, por UMA loja, os produtos que venderam em 30d com: venda(R$), qtd, se está em ruptura (estoque=0),
// classificação (2º nível do caminho) e a curva ABC (por venda, acumulado A≤80%/B≤95%/C).
async function _rupturaLoja(unis, prodIds) {
  const pf = prodFilter(prodIds, 2);
  const rows = await erpQuery(`
    WITH v AS (
      SELECT em.produtoid, sum(iv.valortotal)::float8 venda, sum(iv.quantidade)::float8 qtd
      FROM itemvenda iv JOIN venda vv ON vv.id=iv.vendaid JOIN embalagem em ON em.id=iv.embalagemid
      WHERE vv.status='F' AND vv.unidadenegocioid = ANY($1::bigint[]) AND vv.datahorafechamento >= now()-interval '30 days'${pf.sql}
        AND NOT EXISTS (SELECT 1 FROM suspendecompraprodutounidadenegocio s WHERE s.produtoid=em.produtoid AND s.unidadenegocioid = ANY($1::bigint[]))
      GROUP BY em.produtoid HAVING sum(iv.valortotal) > 0),
    estq AS (SELECT DISTINCT em.produtoid FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
      WHERE es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque>0${pf.sql}),
    cls AS (SELECT DISTINCT ON (cp.produtoid) cp.produtoid, NULLIF(split_part(c.caminho,' > ',2),'') classif
      FROM classificacaoproduto cp JOIN classificacao c ON c.id=cp.classificacaoid
      WHERE cp.produtoid IN (SELECT produtoid FROM v)
      -- Regra do Joe: a árvore IQNUS (ex.: "IQNUS > Integrar") é um overlay de programa, NÃO a
      -- classificação de merchandising. Quando o produto também está na PRINCIPAL, use a PRINCIPAL
      -- (ex.: "PRINCIPAL > PROPAGADO" → PROPAGADO). Só cai no IQNUS se for a única árvore que existe.
      ORDER BY cp.produtoid, (c.caminho ILIKE 'IQNUS%'), (c.caminho ILIKE 'PRINCIPAL%') DESC, c.caminho)
    SELECT v.produtoid, v.venda, v.qtd, p.descricao, p.codigo,
      (SELECT e2.codigobarras FROM embalagem e2 WHERE e2.produtoid=v.produtoid AND e2.codigobarras IS NOT NULL AND e2.codigobarras<>'' ORDER BY length(e2.codigobarras) DESC LIMIT 1) ean,
      (v.produtoid NOT IN (SELECT produtoid FROM estq)) em_ruptura,
      COALESCE(cls.classif,'(sem classificação)') classif
    FROM v JOIN produto p ON p.id=v.produtoid LEFT JOIN cls ON cls.produtoid=v.produtoid
    ORDER BY v.venda DESC`, [unis, ...pf.param]);
  const total = rows.reduce((a, r) => a + (Number(r.venda) || 0), 0);
  let acum = 0;
  for (const r of rows) {
    acum += Number(r.venda) || 0;
    const pp = total ? acum / total : 1;
    // 4 curvas por venda (A 80% / B 95% / C 99% / D = cauda de giro baixíssimo). D aqui NÃO é a "D sem giro"
    // da Análise de estoque (essa tem estoque e não gira, logo nunca entra em ruptura).
    r.curva = pp <= 0.8 ? 'A' : pp <= 0.95 ? 'B' : pp <= 0.99 ? 'C' : 'D';
    r.venda = Math.round((Number(r.venda) || 0) * 100) / 100;
    r.qtd = Math.round((Number(r.qtd) || 0) * 100) / 100;
    r.em_ruptura = (r.em_ruptura === true || r.em_ruptura === 't' || r.em_ruptura === 1);
  }
  return rows;
}

// Conta, por loja, os produtos BLOQUEADOS p/ compra que estão zerados (vendeu em 30d, estoque 0 e suspenso
// p/ compra). Esses NÃO entram na ruptura (é decisão comercial), mas o Joe quer ver o número à parte.
async function _bloqueadosEmRuptura(unis, prodIds) {
  const pf = prodFilter(prodIds, 2);
  const r = (await erpQuery(`
    WITH vend AS (SELECT DISTINCT em.produtoid FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN embalagem em ON em.id=iv.embalagemid
      WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND v.datahorafechamento >= now()-interval '30 days'${pf.sql}
        AND EXISTS (SELECT 1 FROM suspendecompraprodutounidadenegocio s WHERE s.produtoid=em.produtoid AND s.unidadenegocioid = ANY($1::bigint[]))),
    estq AS (SELECT DISTINCT em.produtoid FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
      WHERE es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque>0${pf.sql})
    SELECT count(*) FILTER (WHERE produtoid NOT IN (SELECT produtoid FROM estq)) n FROM vend`, [unis, ...pf.param]))[0] || {};
  return Number(r.n) || 0;
}

// Ruptura agregada POR LOJA (não "lumped"): soma a ruptura de cada loja separadamente — um item que
// faltou numa loja é ruptura NELA mesmo que outra loja tenha. Usado também na aba "Análise de estoque"
// (antes ela juntava tudo num pool só e subestimava, ex.: 4,2% vs 12,4% real).
async function _rupturaAgregadaPorLoja(empresaId, lojaId, prodIds) {
  const lojas = lojasEmpresa(empresaId).filter(l => !lojaId || l.id === lojaId);
  let comVenda = 0, emRuptura = 0;
  for (const l of lojas) {
    const u = unisEmpresa(empresaId, l.id);
    if (!u.length) continue;
    const r = await ruptura(u, prodIds);
    comVenda += r.comVenda; emRuptura += r.emRuptura;
  }
  return { comVenda, emRuptura, pct: comVenda ? Math.round(emRuptura / comVenda * 1000) / 10 : 0 };
}

// Agregados da ruptura por loja, curva e classificação (+ totais com ruptura ponderada e custo).
async function rupturaAnalise(empresaId, { lojaId, compradorId, fator } = {}) {
  if (!habilitado()) return { erp: false };
  const f = fatorRup(fator);
  const prodIds = await produtosDoComprador(empresaId, compradorId);
  if (compradorId && (!prodIds || !prodIds.length)) return { erp: true, semComprador: true, erro: 'Comprador sem grupos vinculados.' };
  const lojas = lojasEmpresa(empresaId).filter(l => !lojaId || l.id === lojaId);
  const porLoja = [], curvaMap = {}, classMap = {};
  let totSold = 0, totRup = 0, totVendaAll = 0, totVendaRup = 0, totBloq = 0;
  for (const l of lojas) {
    const unis = unisEmpresa(empresaId, l.id);
    if (!unis.length) continue;
    const [rows, bloq] = await Promise.all([_rupturaLoja(unis, prodIds), _bloqueadosEmRuptura(unis, prodIds)]);
    totBloq += bloq;
    if (!rows.length) continue;
    let emRup = 0, vendaRup = 0, vendaTot = 0;
    for (const r of rows) {
      vendaTot += r.venda;
      const cm = (curvaMap[r.curva] = curvaMap[r.curva] || { curva: r.curva, comVenda: 0, emRuptura: 0, vendaRuptura: 0 });
      const xm = (classMap[r.classif] = classMap[r.classif] || { classif: r.classif, comVenda: 0, emRuptura: 0, vendaRuptura: 0 });
      cm.comVenda++; xm.comVenda++;               // denominador (deveria estar): tudo que vendeu em 30d
      if (r.em_ruptura) {
        emRup++; vendaRup += r.venda;
        cm.emRuptura++; cm.vendaRuptura += r.venda;
        xm.emRuptura++; xm.vendaRuptura += r.venda;
      }
    }
    porLoja.push({ loja_id: l.id, loja: l.nome, comVenda: rows.length, emRuptura: emRup,
      pct: rows.length ? Math.round(emRup / rows.length * 1000) / 10 : 0,
      pctPonderada: vendaTot ? Math.round(vendaRup / vendaTot * 1000) / 10 : 0,
      vendaRuptura: Math.round(vendaRup), custo: Math.round(vendaRup * f), bloqueados: bloq });
    totSold += rows.length; totRup += emRup; totVendaAll += vendaTot; totVendaRup += vendaRup;
  }
  const comPct = x => ({ ...x, pct: x.comVenda ? Math.round(x.emRuptura / x.comVenda * 1000) / 10 : 0, vendaRuptura: Math.round(x.vendaRuptura), custo: Math.round(x.vendaRuptura * f) });
  const porCurva = ['A', 'B', 'C', 'D'].map(c => curvaMap[c]).filter(Boolean).map(comPct);
  const porClassificacao = Object.values(classMap).sort((a, b) => b.vendaRuptura - a.vendaRuptura).map(comPct);
  porLoja.sort((a, b) => b.custo - a.custo);
  return {
    erp: true, fator: f, lojaId: lojaId || null,
    totais: {
      comVenda: totSold, emRuptura: totRup,
      pct: totSold ? Math.round(totRup / totSold * 1000) / 10 : 0,
      pctPonderada: totVendaAll ? Math.round(totVendaRup / totVendaAll * 1000) / 10 : 0,
      vendaRuptura: Math.round(totVendaRup), custo: Math.round(totVendaRup * f), bloqueados: totBloq,
    },
    porLoja, porCurva, porClassificacao,
  };
}

// Lista de PRODUTOS em ruptura (drill), filtrável por loja/curva/classificação, ordenada por valor perdido.
async function rupturaProdutos(empresaId, { lojaId, compradorId, curva, classif, fator, limite = 400 } = {}) {
  if (!habilitado()) return { erp: false };
  const f = fatorRup(fator);
  const prodIds = await produtosDoComprador(empresaId, compradorId);
  if (compradorId && (!prodIds || !prodIds.length)) return { erp: true, semComprador: true, erro: 'Comprador sem grupos vinculados.' };
  const lojas = lojasEmpresa(empresaId).filter(l => !lojaId || l.id === lojaId);
  // Mapa uni → nome da loja (de TODAS as lojas) p/ dizer de ONDE dá pra remanejar.
  const uniToLoja = {};
  for (const l of lojasEmpresa(empresaId)) for (const u of unisEmpresa(empresaId, l.id)) uniToLoja[String(u)] = l.nome;
  const out = [];
  for (const l of lojas) {
    const unis = unisEmpresa(empresaId, l.id);
    if (!unis.length) continue;
    const rows = await _rupturaLoja(unis, prodIds);
    for (const r of rows) {
      if (!r.em_ruptura) continue;
      if (curva && r.curva !== curva) continue;
      if (classif && r.classif !== classif) continue;
      out.push({ produtoid: Number(r.produtoid), codigo: r.codigo || '', ean: r.ean || '', loja: l.nome, loja_id: l.id, descricao: r.descricao, classif: r.classif, curva: r.curva,
        venda30d: r.venda, qtd30d: r.qtd, perdido: Math.round(r.venda * f) });
    }
  }
  // Remanejamento: para cada item em ruptura, quais OUTRAS lojas têm estoque (pra transferir em vez de comprar).
  if (out.length) {
    const pids = [...new Set(out.map(o => o.produtoid))];
    const estq = await erpQuery(`SELECT em.produtoid, es.unidadenegocioid uni, sum(es.estoque)::float8 est
      FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
      WHERE es.estoque>0 AND em.produtoid = ANY($1::bigint[]) GROUP BY em.produtoid, es.unidadenegocioid`, [pids]).catch(() => []);
    const mapa = {};
    for (const e of estq) { const nm = uniToLoja[String(e.uni)]; if (!nm) continue; (mapa[Number(e.produtoid)] = mapa[Number(e.produtoid)] || []).push({ loja: nm, est: Number(e.est) || 0 }); }
    for (const o of out) {
      const outras = (mapa[o.produtoid] || []).filter(x => x.loja !== o.loja && x.est > 0);
      o.remanejar = outras.map(x => `${x.loja} (${Math.round(x.est)})`).join(', ');
      o.remanejavel = outras.length > 0;
    }
  }
  out.sort((a, b) => b.perdido - a.perdido);
  const lista = out.slice(0, Number(limite) || 400);
  return { erp: true, fator: f, total: out.length, remanejaveis: out.filter(o => o.remanejavel).length, produtos: lista };
}

module.exports = { indicadoresEstoque, retornoFalteiro, produtosDoComprador, cmvComprador, cmvCompradorSugestao, vencidoComprador, rupturaAnalise, rupturaProdutos };
