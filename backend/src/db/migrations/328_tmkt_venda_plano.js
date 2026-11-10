// 328 — Vincula a negociação (tmkt_vendas) a um PLANO COMERCIAL do portal (tmkt_plano). Joe 2026-11-10.
// Ex.: amarrar uma negociação ao plano "Black Friday Mutti 2026" / "Verão com Mutti". Guarda o id e
// o nome (desnormalizado p/ exibir sem join). Idempotente (ADD COLUMN protegido).
const db = require('../connection');
console.log('▶ Migração 328 — vínculo negociação ↔ plano comercial');
const cols = db.prepare('PRAGMA table_info(tmkt_vendas)').all().map(c => c.name);
if (!cols.includes('plano_id')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN plano_id TEXT"); console.log('  + tmkt_vendas.plano_id'); }
else console.log('  = plano_id já existe');
if (!cols.includes('plano_nome')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN plano_nome TEXT"); console.log('  + tmkt_vendas.plano_nome'); }
else console.log('  = plano_nome já existe');
console.log('✓ Migração 328 concluída');
