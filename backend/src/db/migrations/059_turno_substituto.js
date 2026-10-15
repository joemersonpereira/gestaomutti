// 059 — turno na folga/afastamento (para informar ao substituto)
const db = require('../connection');
console.log('▶ Migração 059 — turno em folgas/afastamentos');
try { db.exec(`ALTER TABLE folgas ADD COLUMN turno TEXT`); } catch (e) { /* já existe */ }
try { db.exec(`ALTER TABLE afastamentos ADD COLUMN turno TEXT`); } catch (e) { /* já existe */ }
console.log('✓ Migração 059 concluída');
