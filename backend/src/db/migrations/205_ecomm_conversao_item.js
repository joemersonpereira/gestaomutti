// 205_ecomm_conversao_item.js — guarda o item do cupom (itemvenda.id do A7) que confirmou a venda,
// para o mesmo item nunca confirmar um segundo checkout. Idempotente.
const db = require('../connection');

try { db.exec(`ALTER TABLE ecomm_conversao_log ADD COLUMN erp_item_id TEXT`); } catch (e) { /* já existe */ }
db.exec(`CREATE INDEX IF NOT EXISTS idx_ecomm_conv_item ON ecomm_conversao_log (erp_item_id)`);

console.log('✅ migration 205: ecomm_conversao_log.erp_item_id');
