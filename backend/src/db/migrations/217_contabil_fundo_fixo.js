// 217_contabil_fundo_fixo.js — fundo de caixa fixo por loja (o que sempre fica na loja).
// Usado no "Saldo em caixa 30/31": dinheiro não depositado no cofre − fundo fixo. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_fundo_fixo (
  empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, valor REAL DEFAULT 0,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, loja_id)
)`);
console.log('✅ migration 217: contabil_fundo_fixo');
