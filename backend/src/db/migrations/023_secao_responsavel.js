// 023_secao_responsavel.js — quem avalia cada seção (gerente ou função do chefe do setor)
const db = require('../connection');
console.log('▶ Migração 023 — responsável por seção');
db.exec(`CREATE TABLE IF NOT EXISTS checklist_secao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, checklist_id TEXT NOT NULL,
  nome TEXT NOT NULL, peso REAL DEFAULT 0, indicador_alvo TEXT, responsavel TEXT DEFAULT 'gerente'
);`);
const cols = db.prepare(`PRAGMA table_info(checklist_secao)`).all().map(c => c.name);
if (!cols.includes('responsavel')) { db.exec(`ALTER TABLE checklist_secao ADD COLUMN responsavel TEXT DEFAULT 'gerente'`); console.log('  + responsavel'); }
console.log('✓ Migração 023 concluída');
