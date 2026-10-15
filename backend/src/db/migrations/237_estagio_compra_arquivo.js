// 237_estagio_compra_arquivo.js — arquivo (foto/PDF) anexado a uma compra da Faturas. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS estagio_compra_arquivo (
  empresa_id TEXT NOT NULL, doc_id TEXT NOT NULL, nome TEXT, tipo_mime TEXT, dados TEXT,
  criado_em TEXT DEFAULT (datetime('now')), PRIMARY KEY (empresa_id, doc_id)
)`);
console.log('✅ migration 237: estagio_compra_arquivo');
