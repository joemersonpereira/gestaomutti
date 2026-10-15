// 050 — log de ciências (histórico de aceites por pessoa numa assinatura)
const db = require('../connection');
console.log('▶ Migração 050 — ciencias');
db.exec(`CREATE TABLE IF NOT EXISTS ciencias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, assinatura_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL, papel TEXT, ip TEXT, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(assinatura_id, colaborador_id)
);`);
console.log('✓ Migração 050 concluída');
