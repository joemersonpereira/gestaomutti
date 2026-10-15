// 115_orcamento_rateio.js — config de rateio de planos de contas entre lojas no orçamento do Financeiro.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS orcamento_rateio (
  empresa_id TEXT NOT NULL,
  chave TEXT NOT NULL,          -- plano de contas / grupo (mesma 'chave' do orçamento)
  criterio TEXT NOT NULL DEFAULT 'igual',  -- igual | faturamento
  lojas TEXT NOT NULL,          -- JSON array de loja_id que compõem o rateio
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, chave)
);
`);
console.log('✅ migration 115: orcamento_rateio criada');
