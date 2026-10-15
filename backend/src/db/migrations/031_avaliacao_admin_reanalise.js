// 031 — coluna reanalise_motivo na avaliacao_admin (contestação do avaliado)
const db = require('../connection');
console.log('▶ Migração 031 — avaliacao_admin.reanalise_motivo');
const cols = db.prepare(`PRAGMA table_info(avaliacao_admin)`).all().map(c => c.name);
if (!cols.includes('reanalise_motivo')) {
  db.exec(`ALTER TABLE avaliacao_admin ADD COLUMN reanalise_motivo TEXT`);
  console.log('  + coluna reanalise_motivo');
}
if (!cols.includes('reanalisada')) {
  db.exec(`ALTER TABLE avaliacao_admin ADD COLUMN reanalisada INTEGER DEFAULT 0`);
  console.log('  + coluna reanalisada');
}
console.log('✓ Migração 031 concluída');
