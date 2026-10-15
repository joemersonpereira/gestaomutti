// 015_tarefa_comentarios.js — comentários/justificativas + reanálise nas tarefas
const db = require('../connection');
console.log('▶ Migração 015 — comentários e reanálise de tarefas');
const cols = db.prepare(`PRAGMA table_info(tarefas)`).all().map(c => c.name);
if (!cols.includes('reanalise_status')) { db.exec(`ALTER TABLE tarefas ADD COLUMN reanalise_status TEXT`); console.log('  + reanalise_status'); }
db.exec(`CREATE TABLE IF NOT EXISTS tarefa_comentarios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT NOT NULL,
  autor_id TEXT, autor_nome TEXT, texto TEXT NOT NULL, tipo TEXT DEFAULT 'comentario',
  criado_em TEXT DEFAULT (datetime('now'))
);`);
console.log('✓ Migração 015 concluída');
