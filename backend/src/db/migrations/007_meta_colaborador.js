// 007_meta_colaborador.js — campo "atingida" para metas de colaborador (regra dos 90%)
const db = require('../connection');
console.log('▶ Migração 007 — meta de colaborador (atingida)');
const cols = db.prepare(`PRAGMA table_info(metas)`).all().map(c => c.name);
if (!cols.includes('atingida')) { db.exec(`ALTER TABLE metas ADD COLUMN atingida INTEGER DEFAULT 0`); console.log('  + atingida'); }
console.log('✓ Migração 007 concluída');
