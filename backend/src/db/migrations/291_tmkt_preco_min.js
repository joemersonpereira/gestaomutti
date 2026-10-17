// 291_tmkt_preco_min.js — piso de negociação da posição ("até onde o vendedor pode chegar").
// INTERNO: aparece só na gestão/negociação, NUNCA no portal do fornecedor. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_espaco_loja ADD COLUMN preco_min REAL`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 291: tmkt_espaco_loja.preco_min (piso de negociação, interno)');
