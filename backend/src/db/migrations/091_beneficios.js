// 091 — Controle de benefícios. Cada concessão (vale-compras/day off do aniversário,
// brinde surpresa dos anos de Mutti, ou manual do RH) vira um registro com status.
const db = require('../connection');
console.log('▶ Migração 091 — Controle de benefícios');
db.exec(`
CREATE TABLE IF NOT EXISTS beneficios (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT,
  colaborador_nome TEXT,
  loja_id TEXT,
  tipo TEXT NOT NULL,               -- vale_compras | day_off | brinde | outro
  valor REAL DEFAULT 0,             -- R$ (vale-compras); 0 nos demais
  motivo TEXT,                      -- aniversario | anos_casa | manual
  competencia TEXT,                 -- ano de referência (ex '2026')
  ref TEXT,                         -- chave de deduplicação (1 por ano/tipo)
  status TEXT NOT NULL DEFAULT 'a_receber', -- a_receber | entregue | usado | cancelado
  concedido_em TEXT DEFAULT (datetime('now')),
  usado_em TEXT,
  registrado_por TEXT,              -- quem marcou entregue/usado
  obs TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_benef_ref ON beneficios(empresa_id, ref);
CREATE INDEX IF NOT EXISTS idx_benef_status ON beneficios(empresa_id, status, tipo);
CREATE INDEX IF NOT EXISTS idx_benef_colab ON beneficios(empresa_id, colaborador_id);
`);
console.log('✓ Migração 091 concluída.');
