// 112_orcamento_financeiro.js — orçamento projetado do Financeiro (por loja, ano, mês, categoria).
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS orcamento_financeiro (
  empresa_id TEXT NOT NULL,
  loja_id TEXT NOT NULL,        -- sempre por loja (o geral é a soma)
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,         -- 1..12
  chave TEXT NOT NULL,          -- 'RECEITA' ou nome do grupo de plano de contas / 'CMV'
  tipo TEXT NOT NULL,           -- 'receita' | 'despesa'
  valor REAL NOT NULL DEFAULT 0,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, loja_id, ano, mes, chave)
);
CREATE INDEX IF NOT EXISTS idx_orcfin ON orcamento_financeiro(empresa_id, ano, loja_id);
`);
console.log('✅ migration 112: orcamento_financeiro criada');
