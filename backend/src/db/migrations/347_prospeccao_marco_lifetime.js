// 347 — Gatilho de prospecção por compra LIFETIME (acumulado de toda a vida) — Joe 2026-11-11.
// A regra passou de "≥100k nos últimos 12 meses" para "a cada 100k ACUMULADOS na vida do
// fornecedor, volta pra prospecção (empilha card mesmo se já houver um aberto)". Para a VIRADA não
// inundar o funil (o total lifetime pula de uma vez), marcamos a linha de marcos como já
// "baselineada" no lifetime: no 1º cálculo lifetime gravamos o nível atual SEM criar cards do salto
// histórico; só os 100k seguintes geram card novo. Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE tmkt_prospeccao_marco
//   ADD COLUMN IF NOT EXISTS lifetime_base int NOT NULL DEFAULT 0;  -- 1 = baseline lifetime já fixado
const db = require('../connection');
console.log('▶ Migração 347 — tmkt_prospeccao_marco.lifetime_base (gatilho por compra acumulada)');
const cols = db.prepare("PRAGMA table_info(tmkt_prospeccao_marco)").all().map(c => c.name);
if (!cols.includes('lifetime_base')) db.exec("ALTER TABLE tmkt_prospeccao_marco ADD COLUMN lifetime_base INTEGER NOT NULL DEFAULT 0");
console.log('✓ Migração 347 concluída (tmkt_prospeccao_marco.lifetime_base)');
