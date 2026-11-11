// 332 — "Quais lojas serão envolvidas" na negociação de trade (Joe 2026-11-10).
// Permite marcar MAIS DE UMA loja no topo da negociação. Guarda CSV de loja ids em `lojas`.
// `loja_id` continua sendo a primeira (compat com o resto). Idempotente (ADD COLUMN protegido).
const db = require('../connection');
console.log('▶ Migração 332 — lojas envolvidas (multi) na negociação');
const cols = db.prepare('PRAGMA table_info(tmkt_vendas)').all().map(c => c.name);
if (!cols.includes('lojas')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN lojas TEXT"); console.log('  + tmkt_vendas.lojas (CSV de loja ids)'); }
else console.log('  = lojas já existe');
console.log('✓ Migração 332 concluída');
