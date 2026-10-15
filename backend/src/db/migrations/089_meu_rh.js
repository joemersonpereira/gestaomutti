// 089 — Meu RH: endereço do colaborador + documentos que ele mesmo anexa.
const db = require('../connection');
console.log('▶ Migração 089 — Meu RH (endereço + docs do colaborador)');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('endereco')) { db.exec('ALTER TABLE colaboradores ADD COLUMN endereco TEXT'); console.log('  + colaboradores.endereco'); }
db.exec(`
CREATE TABLE IF NOT EXISTS colaborador_docs (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  nome TEXT, mime TEXT, dados TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_colabdocs ON colaborador_docs(colaborador_id);
`);
console.log('  + colaborador_docs');
console.log('✓ Migração 089 concluída.');
