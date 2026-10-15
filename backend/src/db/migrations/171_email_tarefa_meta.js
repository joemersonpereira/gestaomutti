// 171_email_tarefa_meta.js — guarda remetente/assunto/message-id de cada tarefa de e-mail,
// p/ permitir RESPONDER o e-mail direto da tarefa (via SMTP).
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS email_tarefa_meta (
  tarefa_id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  remetente TEXT,
  remetente_nome TEXT,
  assunto TEXT,
  message_id TEXT,
  respondido_em TEXT,
  respondido_por TEXT
);
`);

console.log('✅ migration 171: email_tarefa_meta criada');
