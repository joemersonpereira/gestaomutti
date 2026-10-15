// 011_tesouraria.js — justificativa de diferença de caixa (Tesouraria)
const db = require('../connection');
console.log('▶ Migração 011 — Tesouraria (justificativa)');
const cols = db.prepare(`PRAGMA table_info(lancamentos_caixa)`).all().map(c => c.name);
if (!cols.includes('justificativa')) { db.exec(`ALTER TABLE lancamentos_caixa ADD COLUMN justificativa TEXT`); console.log('  + justificativa'); }
if (!cols.includes('justif_status')) { db.exec(`ALTER TABLE lancamentos_caixa ADD COLUMN justif_status TEXT`); console.log('  + justif_status'); }
console.log('✓ Migração 011 concluída');
