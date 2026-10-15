// 012_regras_premiacao.js — cadastro de regras de premiação por faixa de %
const db = require('../connection');
console.log('▶ Migração 012 — regras de premiação');
db.exec(`CREATE TABLE IF NOT EXISTS regras_premiacao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, area TEXT NOT NULL,
  faixa1_valor REAL DEFAULT 0, faixa2_valor REAL DEFAULT 0, faixa3_valor REAL DEFAULT 0,
  UNIQUE(empresa_id, area)
);`);
console.log('✓ Migração 012 concluída');
