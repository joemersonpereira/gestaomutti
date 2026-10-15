// 175_email_nova_resposta.js — flag de "nova resposta não lida" na tarefa de e-mail.
const db = require('../connection');
const cols = db.prepare("PRAGMA table_info(email_tarefa_meta)").all().map(c => c.name);
if (!cols.includes('nova_resposta')) {
  db.exec("ALTER TABLE email_tarefa_meta ADD COLUMN nova_resposta INTEGER DEFAULT 0");
  console.log('✅ migration 175: coluna nova_resposta adicionada');
} else {
  console.log('• migration 175: nova_resposta já existe');
}
