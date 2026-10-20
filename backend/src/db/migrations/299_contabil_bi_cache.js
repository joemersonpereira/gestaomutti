// 299_contabil_bi_cache.js — cache dos relatórios que leem o ERP (Alpha), pra não buscar toda hora.
// Mês fechado guarda pra sempre; mês atual recalcula sozinho 1x por hora (ou no botão 🔄 atualizar).
// Chave = relatório|competência|escopo (ex.: 'lead-estoque|2026-09|loja-farmarocha'). Idempotente.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS contabil_bi_cache (
  empresa_id    TEXT NOT NULL,
  chave         TEXT NOT NULL,
  competencia   TEXT,
  payload       TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, chave)
);
`);
console.log('✅ migration 299: contabil_bi_cache');
