// 230_contabil_feriado.js — feriados personalizados (ex.: municipais) por empresa, somados aos
// nacionais/Bahia já calculados. Usados no índice de conciliação (contar dias úteis). Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_feriado (
  empresa_id TEXT NOT NULL,
  data TEXT NOT NULL,            -- YYYY-MM-DD
  nome TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, data)
)`);
console.log('✅ migration 230: contabil_feriado');
