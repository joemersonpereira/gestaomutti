// 019_checklist_def.js — checklists cadastráveis com itens por periodicidade
const db = require('../connection');
console.log('▶ Migração 019 — checklist cadastrável');
db.exec(`CREATE TABLE IF NOT EXISTS checklist_def (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
  destino TEXT DEFAULT 'operacional', ativo INTEGER DEFAULT 1
);`);
const cols = db.prepare(`PRAGMA table_info(operacional_itens)`).all().map(c => c.name);
if (!cols.includes('checklist_id')) { db.exec(`ALTER TABLE operacional_itens ADD COLUMN checklist_id TEXT`); console.log('  + checklist_id'); }
console.log('✓ Migração 019 concluída');
