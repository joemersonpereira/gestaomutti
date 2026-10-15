// 236_tesouraria_plano.js — plano de contas na despesa da tesouraria. Idempotente.
const db = require('../connection');
const cols = db.prepare(`PRAGMA table_info(tesouraria_anexo)`).all().map(c => c.name);
if (!cols.includes('plano_contas')) db.exec(`ALTER TABLE tesouraria_anexo ADD COLUMN plano_contas TEXT`);
console.log('✅ migration 236: tesouraria_anexo.plano_contas');
