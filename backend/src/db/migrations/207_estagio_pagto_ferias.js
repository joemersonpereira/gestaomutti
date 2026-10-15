// 207_estagio_pagto_ferias.js — Estágios fases 6/7: fechamento mensal/pagamento (com descontos),
// férias (programação/lançamento) e rescisão. Idempotente.
const db = require('../connection');

db.exec(`CREATE TABLE IF NOT EXISTS estagio_pagamento (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, ficha_id TEXT NOT NULL,
  competencia TEXT NOT NULL,            -- 'YYYY-MM'
  bolsa REAL DEFAULT 0, vt REAL DEFAULT 0, desconto REAL DEFAULT 0, desconto_obs TEXT,
  liquido REAL DEFAULT 0,
  status TEXT DEFAULT 'aberto',         -- aberto | liberado | pago
  liberado_por TEXT, liberado_em TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, ficha_id, competencia)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS estagio_ferias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, ficha_id TEXT NOT NULL,
  data_ini TEXT, data_fim TEXT, dias INTEGER,
  status TEXT DEFAULT 'programada',     -- programada | lancada
  obs TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS estagio_rescisao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, ficha_id TEXT NOT NULL,
  data TEXT, motivo TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);

console.log('✅ migration 207: estagio_pagamento + ferias + rescisao');
