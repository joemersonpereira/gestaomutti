// 020_checklist_indicador.js — ligação do checklist a indicador (inteiro ou por seção)
const db = require('../connection');
console.log('▶ Migração 020 — checklist → indicador');
const colsDef = db.prepare(`PRAGMA table_info(checklist_def)`).all().map(c => c.name);
if (!colsDef.includes('modo')) { db.exec(`ALTER TABLE checklist_def ADD COLUMN modo TEXT DEFAULT 'inteiro'`); console.log('  + modo'); }
if (!colsDef.includes('indicador_alvo')) { db.exec(`ALTER TABLE checklist_def ADD COLUMN indicador_alvo TEXT`); console.log('  + indicador_alvo'); }
const colsItem = db.prepare(`PRAGMA table_info(operacional_itens)`).all().map(c => c.name);
if (!colsItem.includes('secao_id')) { db.exec(`ALTER TABLE operacional_itens ADD COLUMN secao_id TEXT`); console.log('  + secao_id'); }
db.exec(`CREATE TABLE IF NOT EXISTS checklist_secao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, checklist_id TEXT NOT NULL,
  nome TEXT NOT NULL, peso REAL DEFAULT 0, indicador_alvo TEXT
);`);
console.log('✓ Migração 020 concluída');
