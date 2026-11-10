// 330 — Status "perdido" + motivo da perda na negociação de trade (Joe 2026-11-10).
// Cenário: surgiu um trade, foi registrado, mas não dá pra executar (ex.: o produto exigido não tem
// demanda) → finaliza como PERDIDO com o motivo. Guarda `motivo_perda` (texto). O status 'perdido'
// entra no STATUS da rota. Idempotente (ADD COLUMN protegido).
const db = require('../connection');
console.log('▶ Migração 330 — status "perdido" + motivo da perda');
const cols = db.prepare('PRAGMA table_info(tmkt_vendas)').all().map(c => c.name);
if (!cols.includes('motivo_perda')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN motivo_perda TEXT"); console.log('  + tmkt_vendas.motivo_perda'); }
else console.log('  = motivo_perda já existe');
console.log('✓ Migração 330 concluída');
