// 008_meta_campanha_situacao.js — vínculo meta↔campanha e situação do colaborador (afastado/férias)
const db = require('../connection');
console.log('▶ Migração 008 — meta↔campanha + situação do colaborador');
const mCols = db.prepare(`PRAGMA table_info(metas)`).all().map(c => c.name);
if (!mCols.includes('campanha_id')) { db.exec(`ALTER TABLE metas ADD COLUMN campanha_id TEXT`); console.log('  + metas.campanha_id'); }
const cCols = db.prepare(`PRAGMA table_info(colaboradores)`).all().map(c => c.name);
if (!cCols.includes('situacao')) { db.exec(`ALTER TABLE colaboradores ADD COLUMN situacao TEXT DEFAULT 'ativo'`); console.log('  + colaboradores.situacao'); }
console.log('✓ Migração 008 concluída');
