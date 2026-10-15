// 035 — afastamentos e férias
const db = require('../connection');
console.log('▶ Migração 035 — afastamentos');
db.exec(`CREATE TABLE IF NOT EXISTS afastamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, lancado_por_id TEXT,
  tipo TEXT NOT NULL, data_inicio TEXT NOT NULL, data_fim TEXT, motivo TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);`);
console.log('✓ Migração 035 concluída');
