// 246_tmkt_fornecedor_acesso.js — conta de acesso do FORNECEDOR no portal de Trade.
// Ele compra com o CNPJ e cria e-mail + senha; depois entra pra acompanhar o resultado (vendas
// antes × depois da ação). Uma conta por CNPJ. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_fornecedor (
  empresa_id TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  nome TEXT,
  email TEXT,
  senha_hash TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, cnpj)
)`);
console.log('✅ migration 246: tmkt_fornecedor (acesso do fornecedor)');
