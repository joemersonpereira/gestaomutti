// eficienciaCompradorErp.js — Eficiência por COMPRADOR (análogo à eficiência por loja).
// Destaque: compra que ENTRA SEM PEDIDO no sistema (impede a conciliação com o XML da NF).
// Atribuição por produto → grupo/classificação → comprador (mesmo vínculo do resto do Painel).
const { erpQuery, habilitado } = require('../db/erp');
const db = require('../db/connection');
const { unisEmpresa } = require('./escopoCompras');
const { filtroProdutosComprador, clausulaProdutos } = require('./comprasErp');
const { indicadoresEstoque } = require('./indicadoresCompraErp');

async function prodIdsComprador(empresaId, compradorId) {
  const filtro = await filtroProdutosComprador(empresaId, compradorId);
  if (!filtro) return [];
  const { expr, params } = clausulaProdutos(filtro, 'p');
  const rows = await erpQuery(`SELECT p.id FROM produto p WHERE p.status='A' AND ${expr}`, params);
  return rows.map(r => Number(r.id));
}

// Resolve o período de análise: por datas (de/ate) OU pelos últimos `dias`. Retorna YYYY-MM-DD.
function resolvePeriodo({ dias = 90, de, ate } = {}) {
  const iso = d => d.toISOString().slice(0, 10);
  const valida = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  if (valida(de) && valida(ate)) return { desde: de, ate, dias: null, porData: true };
  const hoje = new Date();
  const d = Math.max(1, Number(dias) || 90);
  return { desde: iso(new Date(hoje.getTime() - d * 864e5)), ate: iso(hoje), dias: d, porData: false };
}

// Compras (NF entrada) do comprador + parte SEM PEDIDO vinculado (impede a conciliação da NF).
// "TEM PEDIDO" = o pedido de compra do A7 está amarrado à NF por QUALQUER destes caminhos:
//   1) conciliacaocompra.notafiscalprincipalid  (conciliação — a NF principal do lote)
//   2) conciliacaocompraitem.notafiscalid       (conciliação — NFs secundárias do mesmo lote)
//   3) itemrecebimentofisico.pedidocompraid     (o recebimento físico apontou o pedido)
//   4) itemnotafiscal.numeropedidocompra        (o fornecedor citou o nº do pedido no XML)
// (Antes só usava o item 4, um TEXTO do XML que o fornecedor quase nunca preenche → dava ~55% falso.)
// A base é só ENTRADA REAL de fornecedor (tipooperacao='1', exclui devolução). BONIFICAÇÃO
// (tipomovimentacaofisica='B') não gera pedido por natureza → conta em "compras" mas NUNCA em "sem pedido".
async function comprasSemPedido(unis, prodIds, per) {
  const r = (await erpQuery(`
    WITH base AS (
      SELECT nf.id nfid, nf.tipomovimentacaofisica mov, ii.valortotal v,
             (COALESCE(ii.numeropedidocompra,'') <> '') xmlped
      FROM notafiscal nf
      JOIN itemnotafiscal ii ON ii.notafiscalid = nf.id
      JOIN embalagem em ON em.id = ii.embalagemid
      WHERE nf.unidadenegocioid = ANY($1::bigint[]) AND nf.status NOT IN ('X','E')
        AND nf.fornecedorid IS NOT NULL AND nf.tipooperacao = '1'
        AND nf.datahoraentrada >= $3::date AND nf.datahoraentrada < ($4::date + interval '1 day')
        AND em.produtoid = ANY($2::bigint[])),
    ped AS (  -- resolve o vínculo de pedido UMA vez por NF (não por item)
      SELECT s.nfid,
        (EXISTS(SELECT 1 FROM conciliacaocompra c WHERE c.notafiscalprincipalid = s.nfid)
         OR EXISTS(SELECT 1 FROM conciliacaocompraitem ci WHERE ci.notafiscalid = s.nfid)
         OR EXISTS(SELECT 1 FROM itemrecebimentofisico irf WHERE irf.notafiscalid = s.nfid AND irf.pedidocompraid IS NOT NULL)) concil
      FROM (SELECT DISTINCT nfid FROM base) s)
    SELECT COALESCE(sum(b.v),0)::float8 compras, count(DISTINCT b.nfid) nfs,
      COALESCE(sum(b.v) FILTER (WHERE NOT (p.concil OR b.xmlped) AND b.mov <> 'B'),0)::float8 sp_valor,
      count(DISTINCT b.nfid) FILTER (WHERE NOT (p.concil OR b.xmlped) AND b.mov <> 'B') sp_nfs
    FROM base b JOIN ped p ON p.nfid = b.nfid`, [unis, prodIds, per.desde, per.ate]))[0] || {};
  const compras = Math.round(Number(r.compras) || 0), spValor = Math.round(Number(r.sp_valor) || 0);
  return {
    compras, nfs: Number(r.nfs) || 0, semPedidoValor: spValor, semPedidoNfs: Number(r.sp_nfs) || 0,
    semPedidoPct: compras > 0 ? Math.round(spValor / compras * 1000) / 10 : 0,
  };
}

// Divergência NF × pedido (sobra/falta + preço) dos produtos do comprador.
async function divergComprador(unis, prodIds, per) {
  const r = (await erpQuery(`
    WITH item AS (
      SELECT sum(ip.quantidadeembalagem)::float8 qp, sum(ii.quantidade)::float8 qn,
        max(ip.precocompra)::float8 pp, max(ii.valorunitario)::float8 pn
      FROM itemrecebimentofisico irf
      JOIN notafiscal nf ON nf.id=irf.notafiscalid
      JOIN embalagem erf ON erf.id=irf.embalagemid
      JOIN itemnotafiscal ii ON ii.notafiscalid=irf.notafiscalid AND ii.embalagemid=irf.embalagemid
      JOIN itempedidocompra ip ON ip.pedidocompraid=irf.pedidocompraid
      JOIN embalagem eip ON eip.id=ip.embalagemid AND eip.produtoid=erf.produtoid
      WHERE nf.status NOT IN ('X','E') AND nf.unidadenegocioid=ANY($1::bigint[])
        AND nf.datahoraentrada >= $3::date AND nf.datahoraentrada < ($4::date + interval '1 day') AND erf.produtoid = ANY($2::bigint[])
      GROUP BY irf.notafiscalid, irf.pedidocompraid, erf.produtoid)
    SELECT count(*) FILTER (WHERE qn<>qp OR (pp>0 AND abs(pn-pp)>0.01*pp)) divergentes,
      count(*) FILTER (WHERE qn>qp) sobras, count(*) FILTER (WHERE qn<qp) faltas,
      COALESCE(sum((pn-pp)*qn) FILTER (WHERE pp>0 AND abs(pn-pp)>0.01*pp),0)::float8 impacto
    FROM item`, [unis, prodIds, per.desde, per.ate]))[0] || {};
  return { divergentes: Number(r.divergentes) || 0, sobras: Number(r.sobras) || 0, faltas: Number(r.faltas) || 0, impactoPreco: Math.round(Number(r.impacto) || 0) };
}

// Valor em risco de vencimento (estoque a custo dos produtos do comprador com lote vencendo na janela).
async function vencidosComprador(unis, prodIds, dias = 90) {
  const r = (await erpQuery(`
    WITH lote AS (
      SELECT em.produtoid FROM itemnotafiscallote l
      JOIN itemnotafiscal ii ON ii.id=l.itemnotafiscalid JOIN notafiscal nf ON nf.id=ii.notafiscalid JOIN embalagem em ON em.id=ii.embalagemid
      WHERE nf.unidadenegocioid=ANY($1::bigint[]) AND l.datavalidade IS NOT NULL
        AND l.datavalidade < now()+($3 || ' days')::interval AND em.produtoid=ANY($2::bigint[])
      GROUP BY em.produtoid),
    estq AS (
      SELECT em.produtoid, es.unidadenegocioid uni, SUM(es.estoque) estoque
      FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
      WHERE es.unidadenegocioid=ANY($1::bigint[]) AND es.estoque>0 AND em.produtoid=ANY($2::bigint[])
      GROUP BY em.produtoid, es.unidadenegocioid)
    SELECT COALESCE(sum(e.estoque*COALESCE(cpr.customedio,0)),0)::float8 valor, count(DISTINCT e.produtoid) itens
    FROM lote l JOIN estq e ON e.produtoid=l.produtoid
    LEFT JOIN custoproduto cpr ON cpr.produtoid=e.produtoid AND cpr.unidadenegocioid=e.uni`, [unis, prodIds, dias]).catch(() => [{}]))[0] || {};
  return { valor: Math.round(Number(r.valor) || 0), itens: Number(r.itens) || 0 };
}

// Resolve o mês (YYYY-MM) → período do mês + se é mês PASSADO (usa a foto/snapshot dos indicadores).
function resolveMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) return null;
  const ano = +mes.slice(0, 4), m = +mes.slice(5, 7);
  const iso = d => d.toISOString().slice(0, 10);
  const per = { desde: iso(new Date(ano, m - 1, 1)), ate: iso(new Date(ano, m, 0)), porData: true, dias: null, mes: true };
  const hoje = new Date();
  const passado = ano < hoje.getFullYear() || (ano === hoje.getFullYear() && m < hoje.getMonth() + 1);
  return { ano, m, per, passado };
}

async function eficienciaCompradores(empresaId, { dias = 90, de, ate, mes } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, null);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const mObj = resolveMes(mes);
  const per = mObj ? mObj.per : resolvePeriodo({ dias, de, ate });
  const usarSnapshot = !!(mObj && mObj.passado); // mês passado → indicadores "de foto" vêm do snapshot
  const snap = {};
  if (usarSnapshot) {
    for (const r of db.prepare('SELECT * FROM compras_indicador_snapshot WHERE empresa_id=? AND ano=? AND mes=?').all(empresaId, mObj.ano, mObj.m)) snap[r.comprador_id] = r;
  }
  const compradores = db.prepare(`SELECT c.id, c.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.nome LIKE 'Comprador%' ORDER BY c.nome`).all(empresaId);
  const out = [];
  for (const c of compradores) {
    const prodIds = await prodIdsComprador(empresaId, c.id);
    if (!prodIds.length) { out.push({ id: c.id, nome: c.nome, semGrupo: true }); continue; }
    // Métricas do PERÍODO (compras/sem pedido/divergência) — sempre calculadas sobre o intervalo.
    const [cs, dv] = await Promise.all([comprasSemPedido(unis, prodIds, per), divergComprador(unis, prodIds, per)]);
    // Indicadores "de foto" (ruptura/cobertura/excesso/estoque/vencendo/conversão):
    // mês passado → snapshot daquele mês; mês atual/janela → posição atual (ao vivo).
    let ind = null, venc = { valor: null, itens: null }, semSnap = false;
    if (usarSnapshot) {
      const sn = snap[c.id];
      if (sn) {
        ind = { ruptura: { pct: sn.ruptura }, cobertura: { dias: sn.cobertura }, orcamentoEstoque: { excesso: sn.excesso }, estoque: { valor: sn.estoque }, produtosNovos: { pct: sn.conversao_novos } };
        venc = { valor: sn.vencidos_valor, itens: sn.vencidos_itens };
      } else { semSnap = true; }
    } else {
      [ind, venc] = await Promise.all([
        indicadoresEstoque(empresaId, { compradorId: c.id }).catch(() => null),
        vencidosComprador(unis, prodIds, 90),
      ]);
    }
    const lo = db.prepare(`SELECT COUNT(*) t, SUM(CASE WHEN comprador_status='respondido' AND comprador_no_prazo=1 THEN 1 ELSE 0 END) ok
      FROM mkt_agenda WHERE empresa_id=? AND comprador_id=?`).get(empresaId, c.id);
    const sp = cs.semPedidoPct;
    const semSemPedido = sp < 10 ? 'verde' : sp < 25 ? 'amarelo' : 'vermelho';
    out.push({
      id: c.id, nome: c.nome, produtos: prodIds.length,
      compras: cs.compras, nfs: cs.nfs,
      semPedidoValor: cs.semPedidoValor, semPedidoNfs: cs.semPedidoNfs, semPedidoPct: sp, semSemPedido,
      diverg: dv,
      ruptura: ind && ind.ruptura ? ind.ruptura.pct : null,
      cobertura: ind && ind.cobertura ? ind.cobertura.dias : null,
      conversaoNovos: ind && ind.produtosNovos ? ind.produtosNovos.pct : null,
      estoque: ind && ind.estoque ? ind.estoque.valor : null,
      excesso: ind && ind.orcamentoEstoque ? ind.orcamentoEstoque.excesso : null,
      vencidosValor: venc.valor, vencidosItens: venc.itens,
      semSnapshot: semSnap,
      listasTotal: lo.t || 0, listasNoPrazoPct: lo.t ? Math.round((lo.ok || 0) / lo.t * 100) : null,
    });
  }
  return { erp: true, dias: per.dias, de: per.desde, ate: per.ate, porData: per.porData, mes: mObj ? mes : null, snapshot: usarSnapshot, compradores: out };
}

// Captura a FOTO dos indicadores do mês (posição atual) por comprador. Roda no boot e no dia 1,
// e a cada dia sobrescreve o mês corrente — quando o mês vira, a última foto do mês fica congelada.
async function capturarSnapshot(empresaId, ano, mes) {
  if (!habilitado()) return { ok: false };
  const now = new Date();
  ano = ano || now.getFullYear(); mes = mes || (now.getMonth() + 1);
  const unis = unisEmpresa(empresaId, null);
  if (!unis.length) return { ok: false };
  const compradores = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.nome LIKE 'Comprador%'`).all(empresaId);
  const up = db.prepare(`INSERT INTO compras_indicador_snapshot (empresa_id,comprador_id,ano,mes,ruptura,cobertura,excesso,estoque,vencidos_valor,vencidos_itens,conversao_novos,capturado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,comprador_id,ano,mes) DO UPDATE SET ruptura=excluded.ruptura, cobertura=excluded.cobertura, excesso=excluded.excesso,
      estoque=excluded.estoque, vencidos_valor=excluded.vencidos_valor, vencidos_itens=excluded.vencidos_itens, conversao_novos=excluded.conversao_novos, capturado_em=excluded.capturado_em`);
  let n = 0;
  for (const c of compradores) {
    const prodIds = await prodIdsComprador(empresaId, c.id);
    if (!prodIds.length) continue;
    const [ind, venc] = await Promise.all([
      indicadoresEstoque(empresaId, { compradorId: c.id }).catch(() => null),
      vencidosComprador(unis, prodIds, 90),
    ]);
    if (!ind) continue;
    up.run(empresaId, c.id, ano, mes,
      ind.ruptura ? ind.ruptura.pct : null, ind.cobertura ? ind.cobertura.dias : null,
      ind.orcamentoEstoque ? ind.orcamentoEstoque.excesso : null, ind.estoque ? ind.estoque.valor : null,
      venc.valor, venc.itens, ind.produtosNovos ? ind.produtosNovos.pct : null);
    n++;
  }
  return { ok: true, capturados: n, ano, mes };
}

module.exports = { eficienciaCompradores, capturarSnapshot };
