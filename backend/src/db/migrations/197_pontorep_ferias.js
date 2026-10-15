// 197_pontorep_ferias.js — Férias com as regras da CLT (art.129–145). Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_ferias (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  aquisitivo_ini TEXT,
  aquisitivo_fim TEXT,
  data_ini       TEXT NOT NULL,
  dias           INTEGER NOT NULL,
  abono_dias     INTEGER DEFAULT 0,     -- venda de até 1/3 (art.143)
  status         TEXT DEFAULT 'solicitada', -- solicitada | aprovada | recusada
  alertas_json   TEXT,
  aprovado_por_id TEXT,
  aprovado_em    TEXT,
  criado_por_id  TEXT,
  criado_em      TEXT DEFAULT (datetime('now'))
)`);
console.log('✅ migration 197: pontorep_ferias criada');
