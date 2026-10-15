// 168_financeiro_benchmark.js — benchmark do mercado farma por linha (chave→valor % do faturamento), editável por empresa.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS financeiro_benchmark (
  empresa_id TEXT NOT NULL,
  chave TEXT NOT NULL,
  valor REAL,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, chave)
);
`);

console.log('✅ migration 168: financeiro_benchmark criada');
