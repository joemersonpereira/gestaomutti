// faturamentoErp.js — tela de Faturamento (Joe 2026-11-12): venda, CMV, unidades, clientes e ticket
// por LOJA, por VENDEDOR e por GRUPO PRINCIPAL / CLASSIFICAÇÃO, do espelho do ERP. Inclui a PROJEÇÃO
// do mês (mesma base run-rate do orçamento de Compras, pra as projeções futuras baterem).
// CMV = custo (movimentacaoestoque.custo × qtd) ÷ venda. Ticket = venda ÷ cupons. Clientes = pessoas identificadas.
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const db = require('../db/connection');

function nomeLoja(uni) { const r = db.prepare('SELECT nome FROM lojas WHERE erp_unidadenegocio_id=?').get(uni); return r ? r.nome : String(uni); }
const r1 = v => v == null ? null : Math.round(Number(v) * 10) / 10;
const ri = v => Math.round(Number(v) || 0);
const cmvPct = (custo, venda) => venda ? Math.round(custo / venda * 1000) / 10 : null;
const ticket = (venda, cupons) => cupons ? Math.round(venda / cupons * 100) / 100 : null;

// produto → grupo principal (2º nível) + classificação (folha principal)
const PG_CTE = `WITH pg AS (
  SELECT DISTINCT ON (cp.produtoid) cp.produtoid,
    NULLIF(split_part(cl.caminho,' > ',2),'') grupo, cl.nome classificacao
  FROM classificacaoproduto cp JOIN classificacao cl ON cl.id=cp.classificacaoid
  WHERE cl.principal=true
  ORDER BY cp.produtoid, cl.profundidade DESC)`;

// filtro de canal: 'entrega' restringe às vendas que têm entrega (online); '' / 'todos' = tudo.
const canalClause = canal => canal === 'entrega' ? " AND v.orcamentoid IS NOT NULL AND EXISTS (SELECT 1 FROM entrega e WHERE e.orcamentoid=v.orcamentoid)" : '';

async function faturamento(empresaId, { lojaId = '', dias = 30, ini = '', fim = '', canal = 'todos' } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const dd = Math.max(1, Math.min(366, Number(dias) || 30));
  // período: datas específicas (ini..fim) OU últimos `dias`. "hoje" = ini=fim=hoje.
  const usarDatas = /^\d{4}-\d{2}-\d{2}$/.test(ini) && /^\d{4}-\d{2}-\d{2}$/.test(fim);
  const periodo = usarDatas ? "v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)" : "v.datahorafechamento >= now() - ($2 || ' days')::interval";
  const per = usarDatas ? [unis, ini, fim] : [unis, dd];
  const cc = canalClause(canal);

  const periodoAb = periodo.replace(/datahorafechamento/g, 'datahoraabertura'); // cestas descartadas usam a abertura
  const [lojaR, vendR, grupoR, projR, entregaR, cestasR, cestasVendR] = await Promise.all([
    // por LOJA — métricas de cupom (venda-nível) + item
    erpQuery(`SELECT v.unidadenegocioid uni,
        count(DISTINCT v.id) cupons,
        count(DISTINCT v.pessoaid) FILTER (WHERE v.pessoaid IS NOT NULL) clientes,
        sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) unidades
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND ${periodo}${cc}
      GROUP BY v.unidadenegocioid`, per),
    // por VENDEDOR (usuarioid → usuario.nome)
    erpQuery(`SELECT v.usuarioid, COALESCE(up.nome, u.apelido, u.login) nome,
        count(DISTINCT v.id) cupons,
        count(DISTINCT v.pessoaid) FILTER (WHERE v.pessoaid IS NOT NULL) clientes,
        sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) unidades
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      LEFT JOIN usuario u ON u.id=v.usuarioid
      LEFT JOIN pessoa up ON up.id=u.pessoaid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND ${periodo}${cc}
      GROUP BY v.usuarioid, COALESCE(up.nome, u.apelido, u.login) ORDER BY sum(iv.valortotal) DESC NULLS LAST LIMIT 100`, per),
    // por GRUPO PRINCIPAL + CLASSIFICAÇÃO (item-nível)
    erpQuery(`${PG_CTE}
      SELECT pg.grupo, pg.classificacao,
        sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) unidades
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
        JOIN embalagem em ON em.id=iv.embalagemid JOIN pg ON pg.produtoid=em.produtoid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND ${periodo}${cc}
      GROUP BY pg.grupo, pg.classificacao`, per),
    // PROJEÇÃO do mês corrente: run-rate em TODAS as métricas. Mesma base do orçamento de Compras.
    erpQuery(`SELECT sum(iv.valortotal) venda_mes, sum(me.custo*abs(me.quantidade)) custo_mes,
        sum(iv.quantidade) unidades_mes, count(DISTINCT v.id) cupons_mes,
        count(DISTINCT v.pessoaid) FILTER (WHERE v.pessoaid IS NOT NULL) clientes_mes,
        EXTRACT(DAY FROM now())::int dia, EXTRACT(DAY FROM (date_trunc('month',now())+interval '1 month -1 day'))::int dias_mes
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND v.datahorafechamento >= date_trunc('month', now())${cc}`, [unis]),
    // VENDAS NA ENTREGA por loja: venda cujo orçamento tem uma entrega (entrega.orcamentoid = venda.orcamentoid)
    erpQuery(`SELECT v.unidadenegocioid uni, count(DISTINCT v.id) cupons, sum(iv.valortotal) venda
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND ${periodo}
        AND v.orcamentoid IS NOT NULL AND EXISTS (SELECT 1 FROM entrega e WHERE e.orcamentoid=v.orcamentoid)
      GROUP BY v.unidadenegocioid`, per),
    // CESTAS EXCLUÍDAS por motivo (venda descartada: motivodescarteid) — perda potencial por motivo.
    erpQuery(`SELECT m.descricao motivo, count(DISTINCT v.id) cestas, COALESCE(sum(iv.valortotal),0) valor
      FROM venda v JOIN motivo m ON m.id=v.motivodescarteid LEFT JOIN itemvenda iv ON iv.vendaid=v.id
      WHERE v.motivodescarteid IS NOT NULL AND v.unidadenegocioid=ANY($1::bigint[]) AND ${periodoAb}
      GROUP BY m.descricao ORDER BY sum(iv.valortotal) DESC NULLS LAST LIMIT 30`, per).catch(() => []),
    // CESTAS EXCLUÍDAS por VENDEDOR (quem mais descarta) — venda.usuarioid → usuario
    erpQuery(`SELECT COALESCE(up.nome, u.apelido, u.login, 'Sem vendedor') vendedor, v.usuarioid,
        count(DISTINCT v.id) cestas, COALESCE(sum(iv.valortotal),0) valor
      FROM venda v LEFT JOIN usuario u ON u.id=v.usuarioid LEFT JOIN pessoa up ON up.id=u.pessoaid
        LEFT JOIN itemvenda iv ON iv.vendaid=v.id
      WHERE v.motivodescarteid IS NOT NULL AND v.unidadenegocioid=ANY($1::bigint[]) AND ${periodoAb}
      GROUP BY v.usuarioid, COALESCE(up.nome, u.apelido, u.login, 'Sem vendedor')
      ORDER BY count(DISTINCT v.id) DESC LIMIT 40`, per).catch(() => []),
  ]);
  const entMap = new Map();
  for (const r of entregaR) entMap.set(Number(r.uni), { venda: ri(r.venda), cupons: Number(r.cupons) || 0 });
  const cestasExcluidas = { total: 0, valor: 0, motivos: [], porVendedor: [] };
  for (const r of cestasR) { const v = ri(r.valor), n = Number(r.cestas) || 0; cestasExcluidas.total += n; cestasExcluidas.valor += v; cestasExcluidas.motivos.push({ motivo: (r.motivo || '—').trim(), cestas: n, valor: v }); }
  for (const r of cestasVendR) cestasExcluidas.porVendedor.push({ vendedor: (r.vendedor || 'Sem vendedor').trim(), usuarioId: r.usuarioid ? Number(r.usuarioid) : null, cestas: Number(r.cestas) || 0, valor: ri(r.valor) });

  const porLoja = lojaR.map(r => {
    const venda = ri(r.venda), custo = ri(r.custo);
    const ent = entMap.get(Number(r.uni)) || { venda: 0, cupons: 0 };
    return { uni: Number(r.uni), loja: nomeLoja(Number(r.uni)), venda, custo, cmv: cmvPct(custo, venda),
      unidades: ri(r.unidades), cupons: Number(r.cupons) || 0, clientes: Number(r.clientes) || 0,
      ticket: ticket(venda, Number(r.cupons) || 0),
      identificacao: r.cupons > 0 ? Math.round(Number(r.clientes) / Number(r.cupons) * 1000) / 10 : null,
      vendaEntrega: ent.venda, cuponsEntrega: ent.cupons };
  }).sort((a, b) => b.venda - a.venda);

  const porVendedor = vendR.map(r => {
    const venda = ri(r.venda), custo = ri(r.custo);
    return { usuarioId: r.usuarioid ? Number(r.usuarioid) : null, nome: (r.nome || 'Sem vendedor').trim(),
      venda, custo, cmv: cmvPct(custo, venda), unidades: ri(r.unidades),
      cupons: Number(r.cupons) || 0, clientes: Number(r.clientes) || 0, ticket: ticket(venda, Number(r.cupons) || 0),
      identificacao: r.cupons > 0 ? Math.round(Number(r.clientes) / Number(r.cupons) * 1000) / 10 : null };
  });

  // agrega grupo (com as classificações dentro)
  const gmap = new Map();
  for (const r of grupoR) {
    const g = r.grupo || 'Outros';
    if (!gmap.has(g)) gmap.set(g, { grupo: g, venda: 0, custo: 0, unidades: 0, classificacoes: [] });
    const o = gmap.get(g); const venda = ri(r.venda), custo = ri(r.custo);
    o.venda += venda; o.custo += custo; o.unidades += ri(r.unidades);
    o.classificacoes.push({ classificacao: r.classificacao || '—', venda, custo, cmv: cmvPct(custo, venda), unidades: ri(r.unidades) });
  }
  const vendaTot = [...gmap.values()].reduce((a, g) => a + g.venda, 0);
  const porGrupo = [...gmap.values()].map(g => ({
    ...g, cmv: cmvPct(g.custo, g.venda), pct: vendaTot ? Math.round(g.venda / vendaTot * 1000) / 10 : 0,
    classificacoes: g.classificacoes.sort((a, b) => b.venda - a.venda),
  })).sort((a, b) => b.venda - a.venda);

  const totCupons = porLoja.reduce((a, l) => a + l.cupons, 0);
  const totClientes = porLoja.reduce((a, l) => a + l.clientes, 0);
  const totCusto = porLoja.reduce((a, l) => a + l.custo, 0);
  const vendaEntregaTot = porLoja.reduce((a, l) => a + (l.vendaEntrega || 0), 0);
  const cuponsEntregaTot = porLoja.reduce((a, l) => a + (l.cuponsEntrega || 0), 0);
  const totais = { venda: vendaTot, custo: totCusto, cmv: cmvPct(totCusto, vendaTot),
    unidades: porGrupo.reduce((a, g) => a + g.unidades, 0), cupons: totCupons, clientes: totClientes,
    ticket: ticket(vendaTot, totCupons), identificacao: totCupons ? Math.round(totClientes / totCupons * 1000) / 10 : null,
    vendaEntrega: vendaEntregaTot, cuponsEntrega: cuponsEntregaTot };

  const p = projR[0] || {};
  const vendaMes = ri(p.venda_mes), custoMes = ri(p.custo_mes), unidMes = ri(p.unidades_mes);
  const cupMes = Number(p.cupons_mes) || 0, cliMes = Number(p.clientes_mes) || 0;
  const dia = Number(p.dia) || 1, diasMes = Number(p.dias_mes) || 30;
  const rr = v => dia > 0 ? Math.round(v / dia * diasMes) : null; // run-rate p/ o fim do mês
  const projecao = {
    vendaMes, dia, diasMes, projecaoMes: rr(vendaMes),
    // volumes projetados p/ fim do mês; ratios ficam ≈ constantes (já são a tendência do mês)
    tendencia: {
      venda: rr(vendaMes), unidades: rr(unidMes), clientes: rr(cliMes), cupons: rr(cupMes),
      cmv: cmvPct(custoMes, vendaMes), ticket: ticket(vendaMes, cupMes),
      identificacao: cupMes ? Math.round(cliMes / cupMes * 1000) / 10 : null,
    },
    base: 'run-rate (métrica do mês ÷ dias decorridos × dias do mês) — mesma base do orçamento de Compras' };

  return { erp: true, dias: dd, lojaId: lojaId || '', totais, projecao, porGrupo, porLoja, porVendedor, cestasExcluidas };
}

// Histórico mês a mês dos indicadores de meta (p/ replicar do mês anterior ou usar média).
// lojaId ''=todas; vendedorId opcional (filtra um vendedor — mesmas métricas por mês).
async function historico(empresaId, { lojaId = '', vendedorId = null, meses = 6, canal = 'todos' } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, meses: [] };
  const m = Math.max(1, Math.min(12, Number(meses) || 6));
  const vend = (vendedorId ? ` AND v.usuarioid = ${Number(vendedorId)}` : '') + canalClause(canal);
  const janela = `v.datahorafechamento >= date_trunc('month', now()) - (($2-1) || ' months')::interval`;
  const [geral, vit, ent] = await Promise.all([
    erpQuery(`SELECT to_char(date_trunc('month',v.datahorafechamento),'YYYY-MM') mes,
        count(DISTINCT v.id) cupons, count(DISTINCT v.pessoaid) FILTER (WHERE v.pessoaid IS NOT NULL) clientes,
        sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) unidades
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])${vend} AND ${janela}
      GROUP BY 1 ORDER BY 1`, [unis, m]),
    erpQuery(`${PG_CTE}
      SELECT to_char(date_trunc('month',v.datahorafechamento),'YYYY-MM') mes, sum(iv.valortotal) venda
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN embalagem em ON em.id=iv.embalagemid JOIN pg ON pg.produtoid=em.produtoid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])${vend}
        AND (pg.grupo ILIKE '%VITAMIN%' OR pg.grupo ILIKE '%SUPLEMENTO%') AND ${janela}
      GROUP BY 1`, [unis, m]),
    erpQuery(`SELECT to_char(date_trunc('month',v.datahorafechamento),'YYYY-MM') mes, sum(iv.valortotal) venda
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])${vend}
        AND v.orcamentoid IS NOT NULL AND EXISTS(SELECT 1 FROM entrega e WHERE e.orcamentoid=v.orcamentoid) AND ${janela}
      GROUP BY 1`, [unis, m]),
  ]);
  const vitMap = new Map(vit.map(r => [r.mes, ri(r.venda)]));
  const entMap = new Map(ent.map(r => [r.mes, ri(r.venda)]));
  const lista = geral.map(r => {
    const venda = ri(r.venda), custo = ri(r.custo), cupons = Number(r.cupons) || 0, clientes = Number(r.clientes) || 0;
    return { mes: r.mes, venda, cmv: cmvPct(custo, venda), ticket: ticket(venda, cupons), unidades: ri(r.unidades),
      clientes_identif: cupons ? Math.round(clientes / cupons * 1000) / 10 : null,
      vitaminas: vitMap.get(r.mes) || 0, entrega: entMap.get(r.mes) || 0 };
  });
  return { erp: true, lojaId: lojaId || '', meses: lista };
}

// Detalhe de um VENDEDOR: vendas por grupo principal (+ CMV, unidades) — p/ o clique na linha do vendedor.
async function vendedorGrupos(empresaId, { usuarioId, lojaId = '', dias = 30, canal = 'todos' } = {}) {
  if (!habilitado()) return { erp: false };
  if (!usuarioId) return { erp: true, grupos: [] };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, grupos: [] };
  const dd = Math.max(1, Math.min(365, Number(dias) || 30));
  const rows = await erpQuery(`${PG_CTE}
    SELECT pg.grupo, sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) unidades
    FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      JOIN embalagem em ON em.id=iv.embalagemid JOIN pg ON pg.produtoid=em.produtoid
    WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
      AND v.usuarioid=$3 AND v.datahorafechamento >= now() - ($2 || ' days')::interval${canalClause(canal)}
    GROUP BY pg.grupo`, [unis, dd, Number(usuarioId)]);
  const tot = rows.reduce((a, r) => a + ri(r.venda), 0);
  const grupos = rows.map(r => { const venda = ri(r.venda), custo = ri(r.custo);
    return { grupo: r.grupo || 'Outros', venda, cmv: cmvPct(custo, venda), unidades: ri(r.unidades), pct: tot ? Math.round(venda / tot * 1000) / 10 : 0 };
  }).sort((a, b) => b.venda - a.venda);
  return { erp: true, dias: dd, grupos };
}

// Métricas de um período [ini,fim] (datas 'YYYY-MM-DD'), p/ o comparativo. canal opcional.
async function metricasPeriodo(unis, ini, fim, canal) {
  const cc = canalClause(canal);
  const per = [unis, ini, fim];
  const [tot, grp, loj] = await Promise.all([
    erpQuery(`SELECT count(DISTINCT v.id) cupons, count(DISTINCT v.pessoaid) FILTER (WHERE v.pessoaid IS NOT NULL) clientes,
        sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) unidades
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)${cc}`, per),
    erpQuery(`${PG_CTE}
      SELECT pg.grupo, sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) unidades
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
        JOIN embalagem em ON em.id=iv.embalagemid JOIN pg ON pg.produtoid=em.produtoid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)${cc}
      GROUP BY pg.grupo`, per),
    erpQuery(`SELECT v.unidadenegocioid uni, sum(iv.valortotal) venda
      FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)${cc}
      GROUP BY v.unidadenegocioid`, per),
  ]);
  const t = tot[0] || {}; const venda = ri(t.venda), custo = ri(t.custo), cupons = Number(t.cupons) || 0, clientes = Number(t.clientes) || 0;
  const grupos = grp.map(g => { const vv = ri(g.venda), cc2 = ri(g.custo); return { grupo: g.grupo || 'Outros', venda: vv, cmv: cmvPct(cc2, vv), unidades: ri(g.unidades) }; });
  const porLoja = loj.map(l => ({ uni: Number(l.uni), venda: ri(l.venda) }));
  return { venda, custo, cmv: cmvPct(custo, venda), cupons, clientes, unidades: ri(t.unidades), ticket: ticket(venda, cupons), identificacao: cupons ? Math.round(clientes / cupons * 1000) / 10 : null, grupos, porLoja };
}

// Comparativo de 2 períodos (o que subiu/caiu) em todas as métricas + por grupo (categorias que crescem/caem).
async function comparativo(empresaId, { lojaId = '', canal = 'todos', ini1, fim1, ini2, fim2 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  if (!(ini1 && fim1 && ini2 && fim2)) return { erp: true, erro: 'Informe os dois períodos.' };
  const [A, B] = await Promise.all([metricasPeriodo(unis, ini1, fim1, canal), metricasPeriodo(unis, ini2, fim2, canal)]);
  const ga = new Map(A.grupos.map(g => [g.grupo, g])), gb = new Map(B.grupos.map(g => [g.grupo, g]));
  const keys = new Set([...ga.keys(), ...gb.keys()]);
  const grupos = [...keys].map(k => {
    const a = ga.get(k) || { venda: 0, cmv: null, unidades: 0 }, b = gb.get(k) || { venda: 0, cmv: null, unidades: 0 };
    const deltaPct = a.venda ? Math.round((b.venda - a.venda) / a.venda * 1000) / 10 : (b.venda ? null : 0);
    return { grupo: k, vendaA: a.venda, vendaB: b.venda, deltaVenda: b.venda - a.venda, deltaPct, cmvA: a.cmv, cmvB: b.cmv, unA: a.unidades, unB: b.unidades };
  }).sort((x, y) => y.vendaB - x.vendaB);
  const delta = (a, b) => (a != null && b != null && a !== 0) ? Math.round((b - a) / Math.abs(a) * 1000) / 10 : null;
  const METR = [['venda', 'Venda', 'maior'], ['cmv', 'CMV', 'menor'], ['ticket', 'Ticket médio', 'maior'], ['unidades', 'Unidades', 'maior'], ['clientes', 'Clientes', 'maior'], ['identificacao', 'Identificação', 'maior']];
  const metricas = METR.map(([k, nome, dir]) => ({ chave: k, nome, dir, a: A[k], b: B[k], delta: delta(A[k], B[k]) }));
  // por loja: quem impacta a variação (só faz sentido quando se olha a rede/várias)
  const la = new Map(A.porLoja.map(l => [l.uni, l.venda])), lb = new Map(B.porLoja.map(l => [l.uni, l.venda]));
  const porLoja = [...new Set([...la.keys(), ...lb.keys()])].map(u => {
    const a = la.get(u) || 0, b = lb.get(u) || 0;
    return { uni: u, loja: nomeLoja(u), vendaA: a, vendaB: b, deltaVenda: b - a, deltaPct: a ? Math.round((b - a) / a * 1000) / 10 : null };
  }).sort((x, y) => y.deltaVenda - x.deltaVenda);
  // #2 se o período B ainda está em andamento (fim no futuro/hoje), projeta B pelo run-rate dos dias decorridos.
  const hoje = new Date().toISOString().slice(0, 10);
  let bProjecao = null;
  if (fim2 >= hoje && ini2 <= hoje) {
    const dd = s => new Date(s + 'T00:00:00Z').getTime();
    const decorridos = Math.max(1, Math.round((dd(hoje) - dd(ini2)) / 86400000) + 1);
    const totalDias = Math.max(decorridos, Math.round((dd(fim2) - dd(ini2)) / 86400000) + 1);
    const fator = decorridos > 0 ? totalDias / decorridos : 1;
    const vproj = Math.round(B.venda * fator);
    bProjecao = { fator: Math.round(fator * 100) / 100, decorridos, totalDias, venda: vproj, unidades: Math.round(B.unidades * fator), clientes: Math.round(B.clientes * fator), deltaVendaPct: A.venda ? Math.round((vproj - A.venda) / A.venda * 1000) / 10 : null };
  }
  return { erp: true, A, B, metricas, grupos, porLoja, bProjecao };
}

// Drill-down: itens (produtos) de um grupo, venda A × B — p/ clicar na categoria e ver os produtos.
async function comparativoItens(empresaId, { lojaId = '', canal = 'todos', grupo, ini1, fim1, ini2, fim2 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !grupo || !(ini1 && fim1 && ini2 && fim2)) return { erp: true, itens: [] };
  const cc = canalClause(canal);
  const rows = await erpQuery(`${PG_CTE}
    SELECT pr.descricao, em.produtoid,
      sum(iv.valortotal) FILTER (WHERE v.datahorafechamento >= $3::date AND v.datahorafechamento < ($4::date + 1)) venda_a,
      sum(iv.valortotal) FILTER (WHERE v.datahorafechamento >= $5::date AND v.datahorafechamento < ($6::date + 1)) venda_b
    FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id JOIN embalagem em ON em.id=iv.embalagemid
      JOIN produto pr ON pr.id=em.produtoid JOIN pg ON pg.produtoid=em.produtoid
    WHERE pg.grupo=$2 AND v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
      AND v.datahorafechamento >= least($3::date,$5::date) AND v.datahorafechamento < (greatest($4::date,$6::date) + 1)${cc}
    GROUP BY pr.descricao, em.produtoid
    HAVING COALESCE(sum(iv.valortotal) FILTER (WHERE v.datahorafechamento >= $3::date AND v.datahorafechamento < ($4::date + 1)),0) > 0
        OR COALESCE(sum(iv.valortotal) FILTER (WHERE v.datahorafechamento >= $5::date AND v.datahorafechamento < ($6::date + 1)),0) > 0
    ORDER BY COALESCE(sum(iv.valortotal) FILTER (WHERE v.datahorafechamento >= $5::date AND v.datahorafechamento < ($6::date + 1)),0) DESC
    LIMIT 120`, [unis, grupo, ini1, fim1, ini2, fim2]);
  const itens = rows.map(r => { const a = ri(r.venda_a), b = ri(r.venda_b); return { produto: (r.descricao || '').trim(), produtoId: Number(r.produtoid), vendaA: a, vendaB: b, deltaVenda: b - a, deltaPct: a ? Math.round((b - a) / a * 1000) / 10 : null }; });
  return { erp: true, grupo, itens };
}

// Média (e último mês) da venda de CADA vendedor nos últimos `meses` — p/ gerar meta de todos de uma vez.
async function mediaVendaVendedores(empresaId, { lojaId = '', meses = 6, canal = 'todos' } = {}) {
  if (!habilitado()) return {};
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return {};
  const m = Math.max(1, Math.min(12, Number(meses) || 6));
  const cc = canalClause(canal);
  const rows = await erpQuery(`SELECT v.usuarioid, to_char(date_trunc('month',v.datahorafechamento),'YYYY-MM') mes, sum(iv.valortotal) venda
    FROM venda v JOIN itemvenda iv ON iv.vendaid=v.id
    WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[]) AND v.usuarioid IS NOT NULL
      AND v.datahorafechamento >= date_trunc('month',now()) - (($2-1)||' months')::interval${cc}
    GROUP BY v.usuarioid, mes`, [unis, m]);
  const map = {};
  for (const r of rows) { const u = String(r.usuarioid); (map[u] = map[u] || {}); map[u][r.mes] = ri(r.venda); }
  const out = {};
  for (const u in map) { const nums = Object.keys(map[u]).sort().map(k => map[u][k]); if (!nums.length) continue; out[u] = { media: Math.round(nums.reduce((a, b) => a + b, 0) / nums.length), ultimo: nums[nums.length - 1] }; }
  return out;
}

// Média MENSAL por vendedor de TODOS os indicadores (p/ gerar a grade completa, não só venda):
// venda, CMV%, ticket, unidades, clientes identificados %, vitaminas (R$, grupo SUPLEMENTO ALIMENTAR) e entrega (R$).
async function mediaIndicadoresVendedores(empresaId, { lojaId = '', meses = 6, canal = 'todos' } = {}) {
  if (!habilitado()) return {};
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return {};
  const m = Math.max(1, Math.min(12, Number(meses) || 6));
  const cc = canalClause(canal);
  const rows = await erpQuery(`${PG_CTE},
    mensal AS (
      SELECT v.usuarioid uid, date_trunc('month',v.datahorafechamento) mes,
        count(DISTINCT v.id) cupons,
        count(DISTINCT v.pessoaid) FILTER (WHERE v.pessoaid IS NOT NULL) clientes,
        sum(iv.valortotal) venda,
        sum(me.custo*abs(me.quantidade)) custo,
        sum(iv.quantidade) unidades,
        sum(iv.valortotal) FILTER (WHERE pg.grupo='SUPLEMENTO ALIMENTAR') vitaminas,
        sum(iv.valortotal) FILTER (WHERE v.orcamentoid IS NOT NULL AND EXISTS (SELECT 1 FROM entrega e WHERE e.orcamentoid=v.orcamentoid)) entrega
      FROM venda v
      JOIN itemvenda iv ON iv.vendaid=v.id
      JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      JOIN embalagem em ON em.id=iv.embalagemid
      LEFT JOIN pg ON pg.produtoid=em.produtoid
      WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
        AND v.usuarioid IS NOT NULL
        AND v.datahorafechamento >= date_trunc('month',now()) - (($2-1)||' months')::interval${cc}
      GROUP BY v.usuarioid, mes)
    SELECT uid,
      avg(venda) venda,
      avg(CASE WHEN venda>0 THEN custo/venda*100 END) cmv,
      avg(CASE WHEN cupons>0 THEN venda/cupons END) ticket,
      avg(unidades) unidades,
      avg(CASE WHEN cupons>0 THEN clientes*100.0/cupons END) identif,
      avg(COALESCE(vitaminas,0)) vitaminas,
      avg(COALESCE(entrega,0)) entrega
    FROM mensal GROUP BY uid`, [unis, m]);
  const out = {};
  for (const r of rows) out[String(r.uid)] = {
    venda: ri(r.venda), cmv: r1(r.cmv), ticket: r1(r.ticket), unidades: ri(r.unidades),
    clientes_identif: r1(r.identif), vitaminas: ri(r.vitaminas), entrega: ri(r.entrega),
  };
  return out;
}

module.exports = { faturamento, historico, vendedorGrupos, comparativo, comparativoItens, mediaVendaVendedores, mediaIndicadoresVendedores };
