// 176_email_contas.js — conta de e-mail PRÓPRIA por colaborador. Quando alguém (ex.: apoio na
// tarefa) responde um e-mail pela tarefa, o envio sai do SERVIDOR/CONTA DELE, não do padrão.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS email_contas (
  usuario_id    TEXT PRIMARY KEY,
  empresa_id    TEXT,
  email         TEXT,
  smtp_host     TEXT,
  smtp_port     INTEGER DEFAULT 465,
  senha         TEXT,
  imap_host     TEXT,
  imap_port     INTEGER DEFAULT 993,
  ativo         INTEGER DEFAULT 1,
  atualizado_em TEXT
)`);
console.log('✅ migration 176: tabela email_contas criada');
