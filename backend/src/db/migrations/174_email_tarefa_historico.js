// 174_email_tarefa_historico.js — histórico (thread) de cada tarefa de e-mail: mensagens
// recebidas e enviadas, na ordem, p/ mostrar a conversa dentro da tarefa.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS email_tarefa_historico (
  id TEXT PRIMARY KEY,
  tarefa_id TEXT NOT NULL,
  empresa_id TEXT NOT NULL,
  direcao TEXT NOT NULL,          -- 'recebido' | 'enviado'
  de_nome TEXT,
  de_email TEXT,
  para TEXT,
  assunto TEXT,
  texto TEXT,
  message_id TEXT,
  por TEXT,                        -- quem enviou (colaborador), p/ 'enviado'
  data TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eth_tarefa ON email_tarefa_historico(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_eth_msg ON email_tarefa_historico(message_id);
`);

console.log('✅ migration 174: email_tarefa_historico criada');
