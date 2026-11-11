// 334 — Comprovação por POSIÇÃO vendida (Joe 2026-11-10).
// A comprovação da ação precisa ser de cada execução/posição vendida. Liga a comprovação do briefing
// (tmkt_venda_briefing) ao espaço vendido (tmkt_venda_espacos) via espaco_id. Null = comprovação geral
// da negociação (como era antes). Idempotente.
const db = require('../connection');
console.log('▶ Migração 334 — comprovação por posição (espaco_id no briefing)');
const cols = db.prepare('PRAGMA table_info(tmkt_venda_briefing)').all().map(c => c.name);
if (!cols.includes('espaco_id')) { db.exec("ALTER TABLE tmkt_venda_briefing ADD COLUMN espaco_id TEXT"); console.log('  + tmkt_venda_briefing.espaco_id'); }
else console.log('  = espaco_id já existe');
console.log('✓ Migração 334 concluída');
