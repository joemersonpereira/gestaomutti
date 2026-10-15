// 028 — avaliação administrativa (chefe do setor)
const db = require('../connection');
console.log('▶ Migração 028 — avaliacao_admin');
db.exec(`CREATE TABLE IF NOT EXISTS avaliacao_admin (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  funcao_id TEXT NOT NULL, avaliado_id TEXT NOT NULL, chefe_id TEXT NOT NULL,
  nota TEXT, status TEXT DEFAULT 'pendente', reanalise INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now'))
);`);
console.log('✓ Migração 028 concluída');
