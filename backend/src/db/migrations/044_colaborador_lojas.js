// 044 — colaborador atua em mais de uma loja
const db = require('../connection');
console.log('▶ Migração 044 — colaborador_lojas');
db.exec(`CREATE TABLE IF NOT EXISTS colaborador_lojas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  UNIQUE(colaborador_id, loja_id)
);`);
console.log('✓ Migração 044 concluída');
