// 269_tmkt_calendario_espacos.js — posições vinculadas a um evento do calendário (Joe 2026-10-16):
// uma ação/dia patrocinável amarra O QUE pode ser comercializado nela (Stories, TikTok, tabloide,
// e-commerce, ponta de gôndola…) — igual o plano amarra posições. O fornecedor patrocina comprando-as.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_calendario_espacos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, evento_id TEXT NOT NULL,
  espaco_id TEXT NOT NULL, quantidade INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_cal_espacos ON tmkt_calendario_espacos(empresa_id, evento_id)`);
console.log('✅ migration 269: tmkt_calendario_espacos (posições vinculadas ao evento)');
