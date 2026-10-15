// 081 — coluna `ref` no mural (dedupe de posts automáticos, ex.: conquistas de curso).
const db = require('../connection');
console.log('▶ Migração 081 — mural_posts.ref');
const cols = db.prepare('PRAGMA table_info(mural_posts)').all().map(c => c.name);
if (!cols.includes('ref')) {
  db.exec('ALTER TABLE mural_posts ADD COLUMN ref TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_mural_ref ON mural_posts(empresa_id, ref)');
  console.log('  + mural_posts.ref');
} else { console.log('  = já existe'); }
console.log('✓ Migração 081 concluída.');
