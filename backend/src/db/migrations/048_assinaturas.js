// 048 — assinaturas/ciência documentada (foto + IP + hora → PDF)
const db = require('../connection');
console.log('▶ Migração 048 — assinaturas');
db.exec(`CREATE TABLE IF NOT EXISTS assinaturas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT, colaborador_id TEXT NOT NULL,
  tipo TEXT, referencia_id TEXT, titulo TEXT, texto TEXT,
  foto_base64 TEXT, ip TEXT, user_agent TEXT, assinado_em TEXT,
  baixado_por_id TEXT, baixado_em TEXT, criado_em TEXT DEFAULT (datetime('now'))
);`);
console.log('✓ Migração 048 concluída');
