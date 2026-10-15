// 124_trademkt.js — módulo Trade Marketing (aluguel de espaços da loja a fornecedores).
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS tmkt_areas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, descricao TEXT NOT NULL, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tmkt_espacos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, area_id TEXT, descricao TEXT NOT NULL,
  observacoes TEXT, valor_ref REAL DEFAULT 0, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tmkt_temas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, descricao TEXT NOT NULL, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tmkt_vendas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, codigo TEXT,
  fornecedor_id TEXT, fornecedor_nome TEXT, loja_id TEXT,
  forma_pagamento TEXT, tema_id TEXT, tema_desc TEXT,
  contrato_url TEXT, vigencia_ini TEXT, vigencia_fim TEXT,
  valor REAL DEFAULT 0, status TEXT DEFAULT 'rascunho',
  eans_monitorados TEXT, observacao TEXT,
  status_desde TEXT DEFAULT (datetime('now')), criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS tmkt_venda_espacos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, venda_id TEXT NOT NULL,
  espaco_id TEXT, espaco_desc TEXT, area_desc TEXT, valor REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tmkt_parcelas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, venda_id TEXT NOT NULL,
  numero INTEGER, vencimento TEXT, valor REAL DEFAULT 0,
  recebido INTEGER DEFAULT 0, recebido_em TEXT, recebido_valor REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tmkt_vespacos ON tmkt_venda_espacos(venda_id);
CREATE INDEX IF NOT EXISTS idx_tmkt_parcelas ON tmkt_parcelas(venda_id);
`);
console.log('✅ migration 124: trade marketing (áreas, espaços, temas, vendas de espaço, parcelas)');
