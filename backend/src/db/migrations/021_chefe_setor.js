// 021_chefe_setor.js — marca quem é o chefe do setor (avaliação administrativa)
const db = require('../connection');
console.log('▶ Migração 021 — chefe do setor');
const cols = db.prepare(`PRAGMA table_info(colaboradores)`).all().map(c => c.name);
if (!cols.includes('chefe_setor')) { db.exec(`ALTER TABLE colaboradores ADD COLUMN chefe_setor INTEGER DEFAULT 0`); console.log('  + chefe_setor'); }
console.log('✓ Migração 021 concluída');
