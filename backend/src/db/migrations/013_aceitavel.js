// 013_aceitavel.js — % aceitável na regra de premiação (faixa máxima)
const db = require('../connection');
console.log('▶ Migração 013 — % aceitável');
const cols = db.prepare(`PRAGMA table_info(regras_premiacao)`).all().map(c => c.name);
if (!cols.includes('aceitavel')) { db.exec(`ALTER TABLE regras_premiacao ADD COLUMN aceitavel REAL DEFAULT 90`); console.log('  + aceitavel'); }
console.log('✓ Migração 013 concluída');
