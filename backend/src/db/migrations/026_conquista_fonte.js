// 026 — conquistas podem vir de outras fontes além de certificado (ex.: caixa sem erro)
const db = require('../connection');
console.log('▶ Migração 026 — fonte na conquista');
const cols = db.prepare(`PRAGMA table_info(certificados)`).all().map(c => c.name);
if (!cols.includes('fonte')) { db.exec(`ALTER TABLE certificados ADD COLUMN fonte TEXT DEFAULT 'manual'`); console.log('  + fonte'); }
console.log('✓ Migração 026 concluída');
