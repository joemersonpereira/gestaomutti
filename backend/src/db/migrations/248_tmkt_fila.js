// 248_tmkt_fila.js — fila de espera do Trade: quem quer um espaço que está OCUPADO entra na fila
// e é avisado quando liberar. Guarda o fornecedor, o período desejado e a posição. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_fila (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  espaco_id TEXT NOT NULL,
  cnpj TEXT,
  fornecedor_nome TEXT,
  contato_nome TEXT,
  contato_email TEXT,
  contato_fone TEXT,
  periodo_ini TEXT,
  periodo_fim TEXT,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'esperando',  -- esperando | avisado | atendido | cancelado
  criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_fila_espaco ON tmkt_fila (empresa_id, espaco_id, status)`);
console.log('✅ migration 248: tmkt_fila (fila de espera)');
