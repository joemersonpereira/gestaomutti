// escopoCompras.js — helpers de escopo para o Painel de Compras (loja, comprador, plano CMV).
const db = require('../db/connection');
const { erpQuery } = require('../db/erp');

// Unidades de negócio (ERP) da empresa. lojaId pode ser: vazio (todas), uma loja, ou VÁRIAS
// (array de ids ou string CSV "id1,id2,..."). Assim toda tela ganha multi-loja sem mudar o backend.
function unisEmpresa(empresaId, lojaId) {
  const ids = normalizarLojas(lojaId);
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    return db.prepare(`SELECT erp_unidadenegocio_id u FROM lojas WHERE empresa_id=? AND id IN (${ph}) AND erp_unidadenegocio_id IS NOT NULL`)
      .all(empresaId, ...ids).map(r => Number(r.u)).filter(Boolean);
  }
  return db.prepare('SELECT erp_unidadenegocio_id u FROM lojas WHERE empresa_id=? AND erp_unidadenegocio_id IS NOT NULL')
    .all(empresaId).map(r => Number(r.u)).filter(Boolean);
}

// Normaliza o filtro de loja em uma lista de ids (aceita id único, array ou CSV). Vazio = todas.
function normalizarLojas(lojaId) {
  if (lojaId == null || lojaId === '' || lojaId === 'todas') return [];
  const arr = Array.isArray(lojaId) ? lojaId : String(lojaId).split(',');
  return arr.map(x => String(x).trim()).filter(x => x && x !== 'todas');
}

// Lojas da empresa para o seletor de filtro.
function lojasEmpresa(empresaId) {
  return db.prepare('SELECT id, nome, erp_unidadenegocio_id FROM lojas WHERE empresa_id=? AND erp_unidadenegocio_id IS NOT NULL ORDER BY nome').all(empresaId);
}

// IDs do plano de contas CMV (compras) — subárvore com "CMV" no caminho. Cacheado.
let _cmvCache = null;
async function planoCmvIds() {
  if (_cmvCache) return _cmvCache;
  const rows = await erpQuery(`SELECT id FROM planocontas WHERE caminho ILIKE '%CMV%' OR nome ILIKE '%CMV%'`);
  _cmvCache = rows.map(r => Number(r.id));
  return _cmvCache;
}

module.exports = { unisEmpresa, lojasEmpresa, planoCmvIds, normalizarLojas };
