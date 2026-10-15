// 243_contabil_sped_hash.js — hash do conteúdo pra dedupe (o vigia de pasta pode reenviar o mesmo
// arquivo; o servidor ignora se já existe). + fonte (manual|pasta). Idempotente.
const db = require('../connection');
for (const [col, ddl] of [['hash', 'TEXT'], ['fonte', "TEXT DEFAULT 'manual'"]]) {
  try { db.exec(`ALTER TABLE contabil_sped ADD COLUMN ${col} ${ddl}`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
db.exec(`CREATE INDEX IF NOT EXISTS ix_contabil_sped_hash ON contabil_sped (empresa_id, hash)`);
console.log('✅ migration 243: contabil_sped.hash + fonte');
