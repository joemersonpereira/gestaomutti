// 238_tesouraria_fiscal.js — marca se o anexo da despesa é NOTA FISCAL (fiscal) ou só recibo. Idempotente.
const db = require('../connection');
const cols = db.prepare(`PRAGMA table_info(tesouraria_anexo)`).all().map(c => c.name);
if (!cols.includes('fiscal')) db.exec(`ALTER TABLE tesouraria_anexo ADD COLUMN fiscal INTEGER`);
if (!cols.includes('tipo_doc')) db.exec(`ALTER TABLE tesouraria_anexo ADD COLUMN tipo_doc TEXT`);
console.log('✅ migration 238: tesouraria_anexo.fiscal + tipo_doc');
