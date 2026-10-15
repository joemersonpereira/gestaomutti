// comprasErp.js — leituras do ERP para o Painel de Compras.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');

// Grupos de compra do ERP (com nº de itens de cada). Global (não por unidade).
async function listarGruposCompra() {
  if (!habilitado()) return [];
  const rows = await erpQuery(`
    SELECT g.id, g.nome, (SELECT COUNT(*) FROM grupocompraitem i WHERE i.grupocompraid=g.id) itens
    FROM grupocompra g WHERE g.status='A' ORDER BY g.nome`);
  return rows.map(r => ({ id: Number(r.id), nome: r.nome, itens: Number(r.itens) || 0 }));
}

// Classificações do ERP (árvore PRINCIPAL) para o vínculo por comprador.
// Nível 2 = principais (GENERICO, PERFUMARIA, SIMILAR…); nível 3 = individuais.
async function listarClassificacoes() {
  if (!habilitado()) return [];
  const rows = await erpQuery(`
    SELECT c.id, c.nome, c.caminho, c.profundidade,
      (SELECT COUNT(*) FROM classificacaoproduto cp
        JOIN classificacao cc ON cc.id=cp.classificacaoid
        WHERE cc.caminho LIKE c.caminho || '%') itens
    FROM classificacao c
    WHERE c.caminho LIKE 'PRINCIPAL > %' AND c.profundidade IN (2,3)
    ORDER BY c.caminho`);
  return rows.map(r => ({
    id: Number(r.id), nome: r.nome, caminho: r.caminho,
    principal: Number(r.profundidade) === 2, itens: Number(r.itens) || 0,
  }));
}

// Resolve os vínculos de um comprador (grupos de compra e/ou classificações) em um FILTRO de produtos.
// Retorna { fabricantes:[], produtos:[], classificacoes:[], excluir:[] } ou null se vazio.
async function filtroProdutosComprador(empresaId, compradorId) {
  const vinc = db.prepare(`SELECT grupocompra_id id, tipo FROM comprador_grupos WHERE empresa_id=? AND comprador_id=?`).all(empresaId, compradorId);
  if (!vinc.length || !habilitado()) return null;
  const grupos = vinc.filter(v => !['classificacao', 'laboratorio', 'fornecedor'].includes(v.tipo)).map(v => v.id);
  const classifSel = vinc.filter(v => v.tipo === 'classificacao').map(v => v.id);
  const labsSel = vinc.filter(v => v.tipo === 'laboratorio').map(v => v.id);   // fabricanteid do ERP
  const fornSel = vinc.filter(v => v.tipo === 'fornecedor').map(v => v.id);    // fornecedorid do ERP
  const f = { fabricantes: [], produtos: [], classificacoes: [], fornecedores: [], excluir: [] };
  labsSel.forEach(id => f.fabricantes.push(Number(id)));
  fornSel.forEach(id => f.fornecedores.push(Number(id)));

  if (grupos.length) {
    const itens = await erpQuery(`SELECT produtoid, fabricanteid, classificacaoid, desconsiderar FROM grupocompraitem WHERE grupocompraid = ANY($1::bigint[])`, [grupos]);
    for (const it of itens) {
      if (it.desconsiderar && it.produtoid) { f.excluir.push(Number(it.produtoid)); continue; }
      if (it.produtoid) f.produtos.push(Number(it.produtoid));
      else if (it.fabricanteid) f.fabricantes.push(Number(it.fabricanteid));
      else if (it.classificacaoid) f.classificacoes.push(Number(it.classificacaoid));
    }
  }
  if (classifSel.length) {
    // Expande cada classificação selecionada para toda a sua subárvore (via caminho).
    const desc = await erpQuery(`
      SELECT c.id FROM classificacao c
      WHERE EXISTS (SELECT 1 FROM classificacao p WHERE p.id = ANY($1::bigint[]) AND c.caminho LIKE p.caminho || '%')`, [classifSel]);
    for (const d of desc) f.classificacoes.push(Number(d.id));
  }
  return f;
}

// Monta uma cláusula SQL (e params) que seleciona os produtoids do comprador. Base p/ indicadores.
// Retorna { where, params } para usar como: WHERE produto.id IN (SELECT ... ) — aqui devolvemos a
// expressão booleana sobre um alias de produto `p`.
function clausulaProdutos(filtro, alias = 'p') {
  if (!filtro) return { expr: 'false', params: [] };
  const ors = []; const params = [];
  if (filtro.fabricantes.length) { params.push(filtro.fabricantes); ors.push(`${alias}.fabricanteid = ANY($${params.length}::bigint[])`); }
  if (filtro.produtos.length) { params.push(filtro.produtos); ors.push(`${alias}.id = ANY($${params.length}::bigint[])`); }
  if (filtro.classificacoes.length) { params.push(filtro.classificacoes); ors.push(`EXISTS (SELECT 1 FROM classificacaoproduto cp WHERE cp.produtoid=${alias}.id AND cp.classificacaoid = ANY($${params.length}::bigint[]))`); }
  // Fornecedor não é atributo do produto → resolve pelos produtos já comprados daquele fornecedor (via NF).
  if (filtro.fornecedores && filtro.fornecedores.length) { params.push(filtro.fornecedores); ors.push(`EXISTS (SELECT 1 FROM itemnotafiscal ii JOIN embalagem em ON em.id=ii.embalagemid JOIN notafiscal nf ON nf.id=ii.notafiscalid WHERE em.produtoid=${alias}.id AND nf.fornecedorid = ANY($${params.length}::bigint[]))`); }
  let expr = ors.length ? '(' + ors.join(' OR ') + ')' : 'false';
  if (filtro.excluir.length) { params.push(filtro.excluir); expr = `(${expr} AND NOT (${alias}.id = ANY($${params.length}::bigint[])))`; }
  return { expr, params };
}

// Transferências (remanejamentos) ainda não concluídas — as paradas há mais de `diasAceitavel`.
// status: A=Aberta, S=Em separação, E=Em trânsito (enviada, não recebida). R/C = concluída/cancelada.
const STATUS_TRANSF = { A: 'Aberta', S: 'Em separação', E: 'Em trânsito' };
async function transferenciasPendentes(diasAceitavel = 7, uni = null) {
  if (!habilitado()) return { transferencias: [], erp: false };
  const lista = Array.isArray(uni) ? uni.filter(Boolean) : (uni ? [uni] : []);
  const filtroLoja = lista.length ? 'AND (t.unidadenegocioorigemid = ANY($1::bigint[]) OR t.unidadenegociodestinoid = ANY($1::bigint[]))' : '';
  const rows = await erpQuery(`
    SELECT t.id, t.codigo, t.status, t.datahora,
      uo.nome origem, ud.nome destino,
      (now()::date - t.datahora::date) dias,
      (SELECT COUNT(*) FROM itemtransferencia i WHERE i.transferenciaid=t.id) itens,
      (SELECT COALESCE(SUM(i.valortotal),0) FROM itemtransferencia i WHERE i.transferenciaid=t.id) valor
    FROM transferencia t
    JOIN unidadenegocio uo ON uo.id = t.unidadenegocioorigemid
    JOIN unidadenegocio ud ON ud.id = t.unidadenegociodestinoid
    WHERE t.status IN ('A','S','E') ${filtroLoja}
    ORDER BY t.datahora ASC`, lista.length ? [lista] : []);
  const transferencias = rows.map(r => ({
    id: Number(r.id), codigo: r.codigo, status: r.status, statusLabel: STATUS_TRANSF[r.status] || r.status,
    origem: r.origem, destino: r.destino, data: r.datahora,
    dias: Number(r.dias) || 0, itens: Number(r.itens) || 0, valor: Number(r.valor) || 0,
    atrasada: (Number(r.dias) || 0) > diasAceitavel,
  }));
  const atrasadas = transferencias.filter(t => t.atrasada);
  return {
    erp: true, diasAceitavel,
    transferencias,
    resumo: {
      pendentes: transferencias.length,
      atrasadas: atrasadas.length,
      valorParado: transferencias.reduce((a, t) => a + t.valor, 0),
      valorAtrasado: atrasadas.reduce((a, t) => a + t.valor, 0),
      maisAntigaDias: transferencias.length ? transferencias[0].dias : 0,
    },
  };
}

// Produtos de UMA transferência/remanejamento (p/ o drill ao clicar na linha).
async function itensTransferencia(transferenciaId) {
  if (!habilitado() || !transferenciaId) return { erp: true, itens: [] };
  const rows = await erpQuery(`
    SELECT it.id, pr.descricao, COALESCE(it.quantidade,0) qtd, COALESCE(it.valortotal,0) valor, it.lote,
      (SELECT em2.codigobarras FROM embalagem em2 WHERE em2.produtoid=em.produtoid AND em2.codigobarras IS NOT NULL ORDER BY length(em2.codigobarras) DESC LIMIT 1) ean
    FROM itemtransferencia it
    JOIN embalagem em ON em.id = it.embalagemid
    JOIN produto pr ON pr.id = em.produtoid
    WHERE it.transferenciaid = $1::bigint
    ORDER BY it.valortotal DESC NULLS LAST
    LIMIT 500`, [Number(transferenciaId)]).catch(() => []);
  return {
    erp: true,
    itens: rows.map(r => ({ id: Number(r.id), descricao: r.descricao, ean: r.ean || null, lote: r.lote || null, qtd: Number(r.qtd) || 0, valor: Number(r.valor) || 0 })),
    total: rows.reduce((a, r) => a + (Number(r.valor) || 0), 0),
  };
}

module.exports = { listarGruposCompra, listarClassificacoes, filtroProdutosComprador, clausulaProdutos, transferenciasPendentes, itensTransferencia };
