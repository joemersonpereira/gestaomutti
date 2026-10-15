// 053 — meta geral × por grupo (por pessoa) + venda por grupo
const db = require('../connection');
console.log('▶ Migração 053 — meta por grupo de venda');

try { db.exec(`ALTER TABLE metas ADD COLUMN modo TEXT DEFAULT 'geral'`); } catch (e) { /* já existe */ }
try { db.exec(`ALTER TABLE vendas ADD COLUMN grupo TEXT`); } catch (e) { /* já existe */ }
db.exec(`CREATE TABLE IF NOT EXISTS meta_grupos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, meta_id TEXT NOT NULL, grupo TEXT NOT NULL,
  valor_meta REAL DEFAULT 0, valor_super REAL DEFAULT 0,
  UNIQUE(meta_id, grupo)
);`);

console.log('✓ Migração 053 concluída');
