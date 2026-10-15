// 018_operacional.js — checklist operacional adiável
const db = require('../connection');
console.log('▶ Migração 018 — operacional');
db.exec(`CREATE TABLE IF NOT EXISTS operacional_itens (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT, nome TEXT NOT NULL,
  periodicidade TEXT NOT NULL, responsavel_funcao TEXT, ativo INTEGER DEFAULT 1
);`);
db.exec(`CREATE TABLE IF NOT EXISTS operacional_exec (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, item_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  periodo_ref TEXT NOT NULL, data_prevista TEXT, status TEXT DEFAULT 'pendente',
  adiamentos INTEGER DEFAULT 0, feito_em TEXT,
  UNIQUE(empresa_id, item_id, loja_id, periodo_ref)
);`);
console.log('✓ Migração 018 concluída');
