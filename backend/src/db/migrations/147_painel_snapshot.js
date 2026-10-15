// 147 — Snapshot mensal dos indicadores do Painel da Gestão: guarda o valor de referência de cada
// área por competência (AAAA-MM) para calcular a TENDÊNCIA mês-a-mês (▲▼) na sala de cobrança.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS painel_snapshot (
  empresa_id TEXT NOT NULL,
  area TEXT NOT NULL,
  competencia TEXT NOT NULL,
  valor REAL,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, area, competencia)
);
`);
console.log('✅ migration 147: painel_snapshot');
