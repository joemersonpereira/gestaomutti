// 046 — tabela de folgas (motor de folga: pedido/aprovação + substituto)
const db = require('../connection');
console.log('▶ Migração 046 — folgas');
db.exec(`CREATE TABLE IF NOT EXISTS folgas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT, colaborador_id TEXT NOT NULL,
  data TEXT NOT NULL, status TEXT DEFAULT 'pendente',
  solicitado_por_id TEXT, aprovado_por_id TEXT, aprovado_em TEXT,
  substituto_id TEXT, motivo TEXT, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, colaborador_id, data)
);`);
console.log('✓ Migração 046 concluída');
