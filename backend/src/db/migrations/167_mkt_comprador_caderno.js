// 167 — A resposta do comprador é a SELEÇÃO de um caderno de oferta do ERP (não texto livre).
const db = require('../connection');
for (const [c, t] of [['comprador_caderno_id', 'TEXT'], ['comprador_caderno_nome', 'TEXT']]) {
  try { db.exec(`ALTER TABLE mkt_agenda ADD COLUMN ${c} ${t}`); } catch { /* já existe */ }
}
console.log('✅ migration 167: mkt_agenda comprador_caderno_id/nome (resposta = caderno de oferta do ERP)');
