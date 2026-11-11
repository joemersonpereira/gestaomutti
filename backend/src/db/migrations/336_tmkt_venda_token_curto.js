// 336 — Link curto da negociação de trade (Joe 2026-11-10).
// O link de acompanhamento (/trade.html?t=<32 chars>) fica enorme no WhatsApp. token_curto é um código
// curto (8 chars) que resolve via /t/<codigo> → redireciona pro acompanhamento. Idempotente.
const db = require('../connection');
console.log('▶ Migração 336 — token_curto (link curto do trade)');
const cols = db.prepare('PRAGMA table_info(tmkt_vendas)').all().map(c => c.name);
if (!cols.includes('token_curto')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN token_curto TEXT"); console.log('  + tmkt_vendas.token_curto'); }
else console.log('  = token_curto já existe');
console.log('✓ Migração 336 concluída');
