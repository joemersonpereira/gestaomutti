// 042 — ciclo diário do Checklist Operacional (abrir/fechar por loja)
const db = require('../connection');
console.log('▶ Migração 042 — operacional_dia');
db.exec(`CREATE TABLE IF NOT EXISTS operacional_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  aberto_em TEXT, fechado INTEGER DEFAULT 0, fechado_em TEXT,
  UNIQUE(empresa_id, loja_id, data)
);`);
console.log('✓ Migração 042 concluída');
