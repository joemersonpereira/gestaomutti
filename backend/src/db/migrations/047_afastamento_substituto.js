// 047 — substituto no afastamento/férias (redireciona tarefas no período)
const db = require('../connection');
console.log('▶ Migração 047 — afastamentos.substituto_id');
try { db.exec(`ALTER TABLE afastamentos ADD COLUMN substituto_id TEXT`); } catch (e) { /* já existe */ }
console.log('✓ Migração 047 concluída');
