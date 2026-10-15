// vencidosErp.js — análise de vencidos: produtos com lote perto do vencimento que ainda têm estoque,
// correlacionando com a demanda por loja (girar aqui × remanejar p/ loja que vende mais) e os
// clientes que usam o produto (com telefone) para impulsionar a venda.
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const { metaVals } = require('./metasCompra');
const db = require('../db/connection');

function nomeLoja(uni) {
  const r = db.prepare('SELECT nome FROM lojas WHERE erp_unidadenegocio_id=?').get(uni);
  return r ? r.nome : String(uni);
}

// Produtos com lote vencendo (ou vencido) nos próximos `dias`, que ainda têm estoque na loja.
async function analiseVencidos(empresaId, { lojaId, dias = 90 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  const todas = unisEmpresa(empresaId); // p/ comparar demanda entre lojas
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };

  // 1) A vencer/vencido por (loja, produto), lendo de DUAS fontes:
  //    (a) itemprevencido = os itens que a loja CADASTROU na tela "Item Pré-Vencido" do A7 (status Ativo, com saldo);
  //    (b) itemnotafiscallote = estimativa pelo ÚLTIMO lote recebido (o que provavelmente está em estoque), p/ pegar
  //        os que ainda NÃO foram cadastrados. Sem duplicar (b só entra se o produto não está em (a)).
  const lotes = await erpQuery(`
    WITH pv AS (
      SELECT ipv.unidadenegocioid uni, em.produtoid, pr.descricao,
             MIN(ipv.datavalidade) validade,
             SUM(COALESCE(ipv.quantidadeinicial,0) - COALESCE(ipv.quantidademovimentada,0)) qtd
      FROM itemprevencido ipv JOIN embalagem em ON em.id = ipv.embalagemid JOIN produto pr ON pr.id = em.produtoid
      WHERE ipv.unidadenegocioid = ANY($1::bigint[]) AND ipv.status = 'A' AND ipv.datavalidade IS NOT NULL
      GROUP BY ipv.unidadenegocioid, em.produtoid, pr.descricao
      HAVING SUM(COALESCE(ipv.quantidadeinicial,0) - COALESCE(ipv.quantidademovimentada,0)) > 0
         AND MIN(ipv.datavalidade) < now() + ($2 || ' days')::interval),
    nflote AS (
      SELECT DISTINCT ON (nf.unidadenegocioid, em.produtoid)
             nf.unidadenegocioid uni, em.produtoid, pr.descricao, l.datavalidade validade
      FROM itemnotafiscallote l
      JOIN itemnotafiscal ii ON ii.id = l.itemnotafiscalid
      JOIN notafiscal nf ON nf.id = ii.notafiscalid
      JOIN embalagem em ON em.id = ii.embalagemid
      JOIN produto pr ON pr.id = em.produtoid
      WHERE nf.unidadenegocioid = ANY($1::bigint[]) AND l.datavalidade IS NOT NULL AND nf.status NOT IN ('X','E')
      ORDER BY nf.unidadenegocioid, em.produtoid, nf.datahoraentrada DESC, l.datavalidade DESC),
    estq AS (
      SELECT es.unidadenegocioid uni, em.produtoid, SUM(es.estoque) estoque
      FROM estoque es JOIN embalagem em ON em.id = es.embalagemid
      WHERE es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque > 0
      GROUP BY es.unidadenegocioid, em.produtoid),
    base AS (
      SELECT uni, produtoid, descricao, validade, qtd, 'cadastrado' origem FROM pv
      UNION ALL
      SELECT n.uni, n.produtoid, n.descricao, n.validade, e.estoque qtd, 'estimado' origem
      FROM nflote n JOIN estq e ON e.uni = n.uni AND e.produtoid = n.produtoid
      WHERE n.validade < now() + ($2 || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM pv WHERE pv.uni = n.uni AND pv.produtoid = n.produtoid))
    SELECT b.uni, b.produtoid, b.descricao, b.validade, b.qtd qtd_lote, b.qtd estoque, b.origem,
           (b.validade::date - now()::date) dias_para_vencer,
           b.qtd * COALESCE(cpr.customedio, 0) valor,
           (SELECT em2.codigobarras FROM embalagem em2 WHERE em2.produtoid = b.produtoid AND em2.codigobarras IS NOT NULL LIMIT 1) AS ean,
           (SELECT cl.nome FROM classificacaoproduto cp JOIN classificacao cl ON cl.id = cp.classificacaoid
              WHERE cp.produtoid = b.produtoid AND cl.principal = true ORDER BY cl.profundidade DESC LIMIT 1) AS classificacao
    FROM base b
    LEFT JOIN custoproduto cpr ON cpr.produtoid = b.produtoid AND cpr.unidadenegocioid = b.uni
    ORDER BY dias_para_vencer ASC
    LIMIT 3000`, [unis, dias]);
  if (!lotes.length) return { erp: true, itens: [], vazio: true };

  // 2) Demanda (venda 90d, qtd) por produto e por loja — p/ decidir girar aqui × remanejar.
  const prodIds = [...new Set(lotes.map(l => Number(l.produtoid)))];
  const demanda = await erpQuery(`
    SELECT v.unidadenegocioid uni, em.produtoid, SUM(iv.quantidade) qtd
    FROM itemvenda iv JOIN venda v ON v.id = iv.vendaid JOIN embalagem em ON em.id = iv.embalagemid
    WHERE v.status='F' AND em.produtoid = ANY($1::bigint[])
      AND v.unidadenegocioid = ANY($2::bigint[]) AND v.datahorafechamento >= now()-interval '90 days'
    GROUP BY v.unidadenegocioid, em.produtoid`, [prodIds, todas]);
  const demMap = new Map(); // produtoid -> Map(uni -> qtd)
  for (const d of demanda) {
    if (!demMap.has(Number(d.produtoid))) demMap.set(Number(d.produtoid), new Map());
    demMap.get(Number(d.produtoid)).set(Number(d.uni), Number(d.qtd) || 0);
  }

  const itens = lotes.map(l => {
    const uni = Number(l.uni), pid = Number(l.produtoid);
    const porLoja = demMap.get(pid) || new Map();
    const demandaAqui = porLoja.get(uni) || 0;
    let melhorUni = uni, melhorQtd = demandaAqui;
    for (const [u, q] of porLoja) if (q > melhorQtd) { melhorQtd = q; melhorUni = u; }
    const estoque = Number(l.estoque) || 0, ddv = Number(l.dias_para_vencer);
    let sugestao, acao;
    if (demandaAqui > 0 && melhorUni === uni) { sugestao = 'Girar na própria loja (há demanda). Acione clientes que usam.'; acao = 'girar'; }
    else if (melhorQtd > 0 && melhorUni !== uni) { sugestao = `Remanejar para ${nomeLoja(melhorUni)} (vende ${melhorQtd} un/90d).`; acao = 'remanejar'; }
    else { sugestao = 'Sem demanda recente na rede. Negociar troca/devolução ou promoção.'; acao = 'promover'; }
    return {
      uni, loja: nomeLoja(uni), produtoId: pid, descricao: l.descricao,
      ean: l.ean || null, classificacao: l.classificacao || null, origem: l.origem || null,
      validade: l.validade, diasParaVencer: ddv, vencido: ddv < 0,
      estoque, qtdLote: Number(l.qtd_lote) || 0, valor: Math.round(Number(l.valor) || 0),
      demandaAqui, melhorLoja: nomeLoja(melhorUni), melhorDemanda: melhorQtd,
      sugestao, acao,
    };
  });

  // Indicadores + metas p/ cobrar o comprador.
  const soma = (f) => itens.filter(f).reduce((a, i) => a + i.valor, 0);
  const valorRisco = soma(() => true);
  const valorVencido = soma(i => i.vencido);                 // perda materializada/iminente
  const valorRemanejar = soma(i => i.acao === 'remanejar');  // dá p/ salvar remanejando
  const valorGirar = soma(i => i.acao === 'girar');
  const valorPerdaCerta = soma(i => i.acao === 'promover');  // sem demanda na rede → risco de perda
  const m = metaVals(empresaId);
  const pctPerda = valorRisco ? Math.round(valorVencido / valorRisco * 1000) / 10 : 0;
  const semPerda = pctPerda <= (m.vencido_perda_max || 5) ? 'verde' : pctPerda <= (m.vencido_perda_max || 5) * 2 ? 'amarelo' : 'vermelho';

  return {
    erp: true, dias, itens,
    resumo: {
      itens: itens.length, valorRisco,
      vencido: { valor: valorVencido, qtd: itens.filter(i => i.vencido).length, pct: pctPerda, meta: m.vencido_perda_max, semaforo: semPerda },
      remanejar: { valor: valorRemanejar, qtd: itens.filter(i => i.acao === 'remanejar').length, meta: m.remanejar_meta },
      girar: { valor: valorGirar, qtd: itens.filter(i => i.acao === 'girar').length },
      perdaCerta: { valor: valorPerdaCerta, qtd: itens.filter(i => i.acao === 'promover').length },
    },
  };
}

// Clientes que compraram o produto (com telefone) — p/ ligar e impulsionar a venda.
async function clientesProduto(empresaId, produtoId, { lojaId } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  const rows = await erpQuery(`
    SELECT p.nome, MAX(v.datahorafechamento) ultima, count(DISTINCT v.id) compras, sum(iv.quantidade) qtd,
      (SELECT c.ddd || c.contato FROM contato c WHERE c.pessoaid = v.pessoaid AND c.tipo <> 'E'
         ORDER BY c.principal DESC NULLS LAST LIMIT 1) telefone
    FROM itemvenda iv JOIN venda v ON v.id = iv.vendaid JOIN embalagem em ON em.id = iv.embalagemid
    LEFT JOIN pessoa p ON p.id = v.pessoaid
    WHERE em.produtoid = $1 AND v.status='F' AND v.pessoaid IS NOT NULL
      AND v.unidadenegocioid = ANY($2::bigint[]) AND v.datahorafechamento >= now()-interval '365 days'
    GROUP BY p.nome, v.pessoaid
    ORDER BY ultima DESC
    LIMIT 60`, [Number(produtoId), unis]);
  return {
    erp: true,
    clientes: rows.map(r => ({
      nome: r.nome || 'Consumidor', telefone: r.telefone || null,
      ultima: r.ultima, compras: Number(r.compras) || 0, qtd: Number(r.qtd) || 0,
    })),
  };
}

module.exports = { analiseVencidos, clientesProduto };
