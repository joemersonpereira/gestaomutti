// 381 — Feira: meses de cobertura (Joe 2026-11-13). A compra de feira ANTECIPA compra futura;
// a verba é amortizada pelos N meses que ela abastece (informado à mão, com sugestão = verba ÷ compra
// média mensal). Assim o estouro do mês da feira não pesa — e sem feira, o estouro gera alerta.
//
// ── Caminho técnico v2.0 (Postgres) ──
// ALTER TABLE feiras ADD COLUMN meses_cobertura integer;
const db = require('../connection');
console.log('▶ Migração 381 — feiras.meses_cobertura');
const cols = db.prepare("SELECT name FROM pragma_table_info('feiras')").all().map(c => c.name);
if (!cols.includes('meses_cobertura')) db.exec('ALTER TABLE feiras ADD COLUMN meses_cobertura INTEGER');
console.log('✓ Migração 381 concluída');
