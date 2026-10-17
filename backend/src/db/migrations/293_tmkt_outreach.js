// 293_tmkt_outreach.js — motor de disparo do CRM proativo (e-mail):
//  - tmkt_evento_outreach: config por ação (ligado, dias antes, recorrente, assunto/mensagem).
//  - tmkt_outreach_log: registro de cada envio (anti-dup por ação+ocorrência+marca+canal).
// Idempotente.
const db = require('../connection');

db.exec(`CREATE TABLE IF NOT EXISTS tmkt_evento_outreach (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  evento_id TEXT NOT NULL,
  ativo INTEGER DEFAULT 0,
  dias_antes INTEGER DEFAULT 15,
  recorrente INTEGER DEFAULT 1,
  assunto TEXT,
  mensagem TEXT,
  criado_em TEXT,
  atualizado_em TEXT
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_tmkt_evento_outreach ON tmkt_evento_outreach(empresa_id, evento_id)`);

db.exec(`CREATE TABLE IF NOT EXISTS tmkt_outreach_log (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  evento_id TEXT NOT NULL,
  ocorrencia TEXT,
  fabricante_id TEXT,
  marca_nome TEXT,
  email TEXT,
  canal TEXT DEFAULT 'email',
  status TEXT,
  erro TEXT,
  enviado_em TEXT
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_outreach_log ON tmkt_outreach_log(evento_id, ocorrencia)`);

console.log('✅ migration 293: tmkt_evento_outreach + tmkt_outreach_log (disparo CRM)');
