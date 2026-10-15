// 121_acordos.js — Acordos e Negociações com fornecedores (Kanban de trade marketing).
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS acordos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  codigo TEXT NOT NULL,
  fornecedor_id TEXT,
  fornecedor_nome TEXT NOT NULL,
  comprador_id TEXT,
  comprador_nome TEXT,
  status TEXT NOT NULL DEFAULT 'novo',   -- novo|prospeccao|negociacao|contrato|execucao|concluido|cancelado
  tipo TEXT,                             -- verba | bonificacao | desconto | acao | outro
  valor_total REAL DEFAULT 0,
  data_inicio TEXT, data_fim TEXT,
  observacao TEXT,
  status_desde TEXT DEFAULT (datetime('now')),
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS acordo_condicoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  acordo_id TEXT NOT NULL,
  tipo TEXT,                             -- verba | bonificacao | desconto | rebate | acao | outro
  descricao TEXT,
  valor REAL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS acordo_historico (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  acordo_id TEXT NOT NULL,
  de_status TEXT, para_status TEXT,
  colaborador_id TEXT, colaborador_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acordos ON acordos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_acordo_cond ON acordo_condicoes(acordo_id);
`);
console.log('✅ migration 121: acordos + condições + histórico');
