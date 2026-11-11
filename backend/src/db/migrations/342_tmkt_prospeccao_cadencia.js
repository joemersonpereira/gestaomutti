// 342 — Cadência (periodicidade) na prospecção (Joe 2026-11-11).
// Traz o campo "Cadência" do Leads para o card do funil: diário/semanal/quinzenal/mensal.
// Quando registra um contato sem informar a próxima data, o sistema sugere a próxima pela cadência.
// Idempotente (ALTER protegido).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE tmkt_prospeccao ADD COLUMN IF NOT EXISTS periodicidade text DEFAULT '';
const db = require('../connection');
console.log('▶ Migração 342 — tmkt_prospeccao.periodicidade');
const col = db.prepare("PRAGMA table_info(tmkt_prospeccao)").all().some(c => c.name === 'periodicidade');
if (!col) db.exec(`ALTER TABLE tmkt_prospeccao ADD COLUMN periodicidade TEXT DEFAULT ''`);
console.log('✓ Migração 342 concluída (tmkt_prospeccao.periodicidade)');
