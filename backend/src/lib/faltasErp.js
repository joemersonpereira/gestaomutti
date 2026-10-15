// faltasErp.js — busca de produto no ERP e confronto com pedidos de compra.
const { erpQuery, habilitado } = require('../db/erp');

// Busca embalagens por CÓDIGO DE BARRAS (exato) ou DESCRIÇÃO (parcial), com a marca.
async function buscarProduto(q, limite = 20) {
  if (!habilitado() || !q || String(q).trim().length < 2) return [];
  const termo = String(q).trim();
  const soDigitos = termo.replace(/\D/g, '');
  const rows = await erpQuery(`
    SELECT e.id AS embalagem_id, e.codigobarras AS ean, e.descricao, e.precovenda, e.produtoid,
      (SELECT pe.nome FROM fabricante fb JOIN pessoa pe ON pe.id = fb.pessoaid WHERE fb.id = p.fabricanteid) AS marca
    FROM embalagem e JOIN produto p ON p.id = e.produtoid
    WHERE p.status = 'A' AND (
      ($1 <> '' AND e.codigobarras = $1)
      OR e.descricao ILIKE $2
    )
    ORDER BY (e.codigobarras = $1) DESC, e.descricao
    LIMIT $3`, [soDigitos, `%${termo}%`, limite]);
  return rows.map(r => ({
    embalagem_id: Number(r.embalagem_id), ean: r.ean, descricao: r.descricao,
    marca: r.marca || 'Sem marca', produto_id: r.produtoid ? Number(r.produtoid) : null,
    preco: Number(r.precovenda) || 0,
  }));
}

// Confronto em LOTE: para uma unidade e uma lista de embalagens, diz se há pedido de
// compra pendente (comprador já pediu, aguardando entrega) e se chegou algo recente.
// Retorna { [embalagemId]: { pedido_pendente, pedido_codigo, entrega, falta_receber, chegou_recente } }.
async function confrontoLote(unidadeId, embalagemIds) {
  const out = {};
  if (!habilitado() || !unidadeId || !embalagemIds || !embalagemIds.length) return out;
  const ids = [...new Set(embalagemIds.map(Number).filter(Boolean))];
  if (!ids.length) return out;
  try {
    // pedidos pendentes (item não confirmado/recebido) por embalagem
    const ped = await erpQuery(`
      SELECT DISTINCT ON (i.embalagemid) i.embalagemid,
        pc.codigo, to_char(pc.dataentregaprogramada,'DD/MM/YYYY') AS entrega, to_char(pc.datahora,'DD/MM') AS pedido_em,
        (i.quantidadeembalagem - COALESCE(i.quantidadeembalagemconfirmada,0)) AS falta_receber
      FROM itempedidocompra i JOIN pedidocompra pc ON pc.id = i.pedidocompraid
      WHERE i.embalagemid = ANY($1::bigint[]) AND pc.unidadenegocioid = $2
        AND pc.datahora > now() - interval '90 days'
        AND (i.quantidadeembalagemconfirmada IS NULL OR i.quantidadeembalagemconfirmada < i.quantidadeembalagem)
      ORDER BY i.embalagemid, pc.datahora DESC`, [ids, unidadeId]);
    ped.forEach(r => { out[Number(r.embalagemid)] = { pedido_pendente: true, pedido_codigo: r.codigo, entrega: r.entrega, pedido_em: r.pedido_em, falta_receber: Number(r.falta_receber) || null, ultima_entrada: null }; });
    // última NF de entrada de cada embalagem (p/ saber se/quando chegou)
    const cheg = await erpQuery(`
      SELECT ini.embalagemid, to_char(MAX(nf.datahoraentrada),'YYYY-MM-DD') AS ultima
      FROM itemnotafiscal ini JOIN notafiscal nf ON nf.id = ini.notafiscalid
      WHERE ini.embalagemid = ANY($1::bigint[]) AND nf.unidadenegocioid = $2
        AND nf.tipooperacao = '1' AND nf.datahoraentrada > now() - interval '120 days'
      GROUP BY ini.embalagemid`, [ids, unidadeId]);
    cheg.forEach(r => { const k = Number(r.embalagemid); out[k] = { ...(out[k] || { pedido_pendente: false }), ultima_entrada: r.ultima }; });
  } catch (e) { console.error('[faltas] confronto ERP falhou:', e.message); }
  return out;
}

module.exports = { buscarProduto, confrontoLote };
