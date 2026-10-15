// 006_aceites_campanha.js — tabela de aceite formal de campanha (prova legal)
const db = require('../connection');

console.log('▶ Migração 006 — Aceite formal de campanha');

db.exec(`CREATE TABLE IF NOT EXISTS aceites_campanha (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, meta_id TEXT NOT NULL, colaborador_id TEXT,
  colaborador_nome TEXT, campanha_nome TEXT, ip TEXT, user_agent TEXT, selfie TEXT,
  aceito_em TEXT DEFAULT (datetime('now'))
);`);

console.log('✓ Migração 006 concluída');
