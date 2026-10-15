// 037 — anexos de tarefas (arquivo/imagem/áudio) + assinatura (selfie+ip+hora)
const db = require('../connection');
console.log('▶ Migração 037 — anexos de tarefas');
db.exec(`CREATE TABLE IF NOT EXISTS tarefa_anexos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT NOT NULL,
  autor_id TEXT, autor_nome TEXT,
  tipo TEXT, nome TEXT, mime TEXT, tamanho INTEGER, dados TEXT,
  exige_assinatura INTEGER DEFAULT 0, assinado INTEGER DEFAULT 0,
  assinado_por_id TEXT, assinado_por_nome TEXT,
  assinatura_selfie TEXT, assinatura_ip TEXT, assinatura_em TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);`);
console.log('✓ Migração 037 concluída');
