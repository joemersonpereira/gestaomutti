// 169_email_tarefas.js — regras remetente→responsável e controle de e-mails já processados (e-mail vira tarefa).
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS email_regras (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  remetente TEXT NOT NULL,          -- e-mail exato (contato@x.com) ou domínio (@x.com / x.com)
  responsavel_id TEXT,              -- colaborador dono da tarefa (null = fila)
  rotulo TEXT,                       -- rótulo opcional p/ o título da tarefa
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_regras_emp ON email_regras(empresa_id);

CREATE TABLE IF NOT EXISTS email_processados (
  empresa_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, message_id)
);
`);

console.log('✅ migration 169: email_regras + email_processados criadas');
