// 252_tmkt_espaco_galeria.js — galeria de fotos do espaço (mais imagens) + observações. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_espaco_loja ADD COLUMN observacoes TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_espaco_foto (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, espaco_id TEXT NOT NULL,
  foto TEXT, tipo_mime TEXT, ordem INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_espaco_foto ON tmkt_espaco_foto (empresa_id, espaco_id, ordem)`);
console.log('✅ migration 252: tmkt_espaco_foto (galeria) + observacoes');
