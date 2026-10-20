// 302_erp_cache.js — cache GENÉRICO de relatórios que leem o ERP (Alpha), reutilizável por qualquer tela.
// Política (lib/erpCache.js): período fechado (termina antes do mês atual) guarda pra sempre;
// período que inclui o mês atual recalcula no máximo 1x por hora; ?forcar=1 recalcula na hora.
// Chave = base|empresa|querystring ordenada. Idempotente.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS erp_cache (
  chave         TEXT PRIMARY KEY,
  empresa_id    TEXT NOT NULL,
  payload       TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_erpcache_emp ON erp_cache (empresa_id);
`);
console.log('✅ migration 302: erp_cache');
