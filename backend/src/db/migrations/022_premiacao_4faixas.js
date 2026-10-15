// 022_premiacao_4faixas.js — 4ª faixa de premiação (100% só com 100 no indicador)
const db = require('../connection');
console.log('▶ Migração 022 — premiação 4 faixas');
const cols = db.prepare(`PRAGMA table_info(regras_premiacao)`).all().map(c => c.name);
if (!cols.includes('faixa4_valor')) { db.exec(`ALTER TABLE regras_premiacao ADD COLUMN faixa4_valor REAL DEFAULT 0`); console.log('  + faixa4_valor'); }
console.log('✓ Migração 022 concluída');
