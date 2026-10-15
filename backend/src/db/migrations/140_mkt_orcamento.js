// 140 — Orçamento (verba) do Marketing por mês. O gasto vem das ações/eventos do calendário
// (mkt_agenda.verba); aqui a gestão define quanto pode gastar por mês e acompanha o saldo.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS mkt_orcamento (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,          -- 1..12
  valor REAL DEFAULT 0,
  criado_por TEXT,
  atualizado_em TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_orc_uq ON mkt_orcamento(empresa_id, ano, mes);
`);
console.log('✅ migration 140: mkt_orcamento');
