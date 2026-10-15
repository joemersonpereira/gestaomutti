// 066 — cadastro de empresas terceirizadas (para o registro do colaborador).
const db = require('../connection');
console.log('▶ Migração 066 — empresas terceirizadas');
db.exec(`CREATE TABLE IF NOT EXISTS empresas_terceirizadas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, cnpj TEXT,
  ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
);`);
console.log('✓ Migracao 066 concluida');
