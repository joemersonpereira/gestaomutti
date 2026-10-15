// 216_contabil_emprestimo.js — Módulo Contabilidade: Empréstimos (local + anexos + parcelas auto).
// A contabilidade acessa (read-only via perfil); o financeiro/direção lança. Idempotente.
const db = require('../connection');

db.exec(`CREATE TABLE IF NOT EXISTS contabil_emprestimo (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  loja_id TEXT,                         -- loja tomadora (opcional; vazio = grupo)
  descricao TEXT,                       -- ex.: "Capital de giro Bradesco"
  credor TEXT,                          -- banco/pessoa que emprestou
  tipo TEXT,                            -- bancario | socio | fornecedor | outro
  valor_principal REAL DEFAULT 0,
  taxa_juros REAL DEFAULT 0,            -- % a.m. (informativo)
  num_parcelas INTEGER DEFAULT 1,
  valor_parcela REAL DEFAULT 0,         -- valor de cada parcela (com juros, se houver)
  data_contratacao TEXT,               -- 'YYYY-MM-DD'
  data_primeira_parcela TEXT,          -- 'YYYY-MM-DD'
  status TEXT DEFAULT 'ativo',          -- ativo | quitado | cancelado
  observacao TEXT,
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT DEFAULT (datetime('now'))
)`);

// Parcelas (geração automática a partir de nº parcelas / 1ª data / valor). A contabilidade só acessa.
db.exec(`CREATE TABLE IF NOT EXISTS contabil_emprestimo_parcela (
  id TEXT PRIMARY KEY, emprestimo_id TEXT NOT NULL,
  numero INTEGER, vencimento TEXT, valor REAL DEFAULT 0,
  pago INTEGER DEFAULT 0, data_pagamento TEXT,
  UNIQUE(emprestimo_id, numero)
)`);

// Anexos (contrato e documentos), base64 como os demais anexos do sistema.
db.exec(`CREATE TABLE IF NOT EXISTS contabil_emprestimo_anexo (
  id TEXT PRIMARY KEY, emprestimo_id TEXT NOT NULL,
  nome TEXT, tipo TEXT, dados TEXT,     -- dados = data URL base64
  criado_em TEXT DEFAULT (datetime('now'))
)`);

console.log('✅ migration 216: contabil_emprestimo + parcela + anexo');
