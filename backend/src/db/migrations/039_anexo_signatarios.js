// 039 — múltiplos signatários por anexo (quem envia escolhe quem assina)
const db = require('../connection');
console.log('▶ Migração 039 — signatários do anexo');
db.exec(`CREATE TABLE IF NOT EXISTS tarefa_anexo_assinaturas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, anexo_id TEXT NOT NULL,
  signatario_id TEXT NOT NULL, signatario_nome TEXT,
  assinado INTEGER DEFAULT 0, selfie TEXT, ip TEXT, assinado_em TEXT, ciente INTEGER DEFAULT 0
);`);
console.log('✓ Migração 039 concluída');
