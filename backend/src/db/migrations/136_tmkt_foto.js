// 136 — Foto do ponto (espaço físico) no Trade Marketing.
const db = require('../connection');
const cols = db.prepare("PRAGMA table_info(tmkt_espaco_loja)").all().map(c => c.name);
if (!cols.includes('foto')) db.exec('ALTER TABLE tmkt_espaco_loja ADD COLUMN foto TEXT'); // data:image base64
console.log('✅ migration 136: tmkt_espaco_loja.foto');
