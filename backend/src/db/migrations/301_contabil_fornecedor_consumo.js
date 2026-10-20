// 301_contabil_fornecedor_consumo.js — marca o fornecedor como "conta de consumo" (Luz/Água/Telefone):
// ELE EMITE nota, mas o ERP não vincula a NF (dá 0% c/ nota) — o documento se confere na PASTA (recibo).
// consumo=1 tira da "perda" (como quem não emite) e liga a rechecagem contra os recibos anexados.
// Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE contabil_fornecedor ADD COLUMN consumo INTEGER DEFAULT 0`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 301: contabil_fornecedor.consumo');
