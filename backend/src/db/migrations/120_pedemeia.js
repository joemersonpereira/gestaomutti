// 120_pedemeia.js — Pé de Meia: poupança do colaborador (pontos→R$, vale-compras) sacável 1x/ano.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS pedemeia_movimentos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  colaborador_nome TEXT,
  tipo TEXT NOT NULL,            -- deposito_pontos | deposito_vale | saque | ajuste
  valor REAL NOT NULL,          -- R$ (positivo entra, negativo sai)
  pontos INTEGER DEFAULT 0,     -- pontos convertidos (quando aplicável)
  ano INTEGER,
  obs TEXT,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pedemeia ON pedemeia_movimentos(empresa_id, colaborador_id);
`);
console.log('✅ migration 120: pedemeia_movimentos criada');
