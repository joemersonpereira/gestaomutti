// 292_tmkt_crm_proativo.js — CRM proativo de Trade (fase 1, e-mail):
//  - tmkt_marca_contato: contato de TRADE da MARCA/fabricante (o ERP lista a marca mas não tem o contato dela).
//  - tmkt_evento_classificacao: vincula uma ação do calendário a classificação(ões) do Alpha (quem avisar).
// Idempotente.
const db = require('../connection');

db.exec(`CREATE TABLE IF NOT EXISTS tmkt_marca_contato (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  fabricante_id TEXT NOT NULL,     -- id do fabricante no ERP (Alpha)
  marca_nome TEXT,                 -- nome da marca (cache, p/ exibir)
  email TEXT,
  whatsapp TEXT,
  responsavel TEXT,
  obs TEXT,
  criado_em TEXT,
  atualizado_em TEXT
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_tmkt_marca_contato ON tmkt_marca_contato(empresa_id, fabricante_id)`);

db.exec(`CREATE TABLE IF NOT EXISTS tmkt_evento_classificacao (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  evento_id TEXT NOT NULL,
  classificacao_id TEXT NOT NULL,  -- id da classificacao no ERP
  nome TEXT,                       -- nome da classificacao (cache)
  criado_em TEXT
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_evento_classif ON tmkt_evento_classificacao(evento_id)`);

console.log('✅ migration 292: tmkt_marca_contato + tmkt_evento_classificacao (CRM proativo fase 1)');
