// 224_contabil_cartao_despesa.js — Cartão-despesas / conta orçamentária por loja:
// verba mensal liberada por loja + lançamentos de despesa (com comprovante e flag de validade
// fiscal), para medir quanto se perde por falta de nota. Idempotente. (OCR entra depois.)
const db = require('../connection');

db.exec(`CREATE TABLE IF NOT EXISTS contabil_despesa_cartao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  loja_id TEXT, apelido TEXT,
  verba_mensal REAL DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS contabil_despesa_lancamento (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cartao_id TEXT NOT NULL,
  competencia TEXT,              -- 'YYYY-MM'
  data TEXT, descricao TEXT, plano_contas TEXT, valor REAL DEFAULT 0,
  validade_fiscal INTEGER DEFAULT 0,   -- 0 = sem nota fiscal; 1 = com nota (vale p/ imposto)
  anexo_nome TEXT, anexo_tipo TEXT, anexo_dados TEXT,  -- comprovante (base64)
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);

console.log('✅ migration 224: contabil_despesa_cartao + contabil_despesa_lancamento');
