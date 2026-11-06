// 315_tmkt_associacao.js — Trade via ASSOCIAÇÃO (ex.: Multmais). A associação bonifica a farmácia
// por EXPOR o produto de um laboratório (ponta de gôndola) — diferente do modelo direto (farmácia
// aluga o espaço ao fornecedor). Guarda o cadastro de associações e marca a origem na negociação.
const db = require('../connection');

db.exec(`CREATE TABLE IF NOT EXISTS tmkt_associacao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL, cnpj TEXT, observacao TEXT,
  ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tmkt_assoc ON tmkt_associacao(empresa_id, ativo)`);

// origem: 'direto' (padrão) = farmácia vende o espaço ao fornecedor · 'associacao' = bonificação
// recebida da associação por expor a marca. Na associação, fornecedor_* guarda o LABORATÓRIO exposto.
for (const [col, ddl] of [
  ['origem', `ALTER TABLE tmkt_vendas ADD COLUMN origem TEXT DEFAULT 'direto'`],
  ['associacao_id', `ALTER TABLE tmkt_vendas ADD COLUMN associacao_id TEXT`],
  ['associacao_nome', `ALTER TABLE tmkt_vendas ADD COLUMN associacao_nome TEXT`],
]) {
  try { db.exec(ddl); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
console.log('✅ migration 315: tmkt_associacao + tmkt_vendas.origem/associacao');
