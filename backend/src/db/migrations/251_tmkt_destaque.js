// 251_tmkt_destaque.js — espaço em DESTAQUE no portal do fornecedor (aparece em evidência). Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_espaco_loja ADD COLUMN destaque INTEGER DEFAULT 0`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 251: tmkt_espaco_loja.destaque');
