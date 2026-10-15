// 227_contabil_config.js — config chave/valor da Contabilidade (ex.: caminho base das NFs no OneDrive). Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_config (
  empresa_id TEXT NOT NULL, chave TEXT NOT NULL, valor TEXT,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, chave)
)`);
console.log('✅ migration 227: contabil_config');
