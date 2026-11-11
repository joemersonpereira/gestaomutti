// 357 — Validação fiscal da despesa pelo ESCRITÓRIO (Joe 2026-11-11).
// O gerente anexa a despesa (foto + plano de contas) e o OCR já dá um palpite (fiscal/recibo).
// O escritório, na conferência, VALIDA se é fiscal ou não fiscal — esse é o valor que vale.
// fiscal_conf: NULL = não validado, 1 = fiscal, 0 = não fiscal. Idempotente (ALTER protegido).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE tesouraria_anexo ADD COLUMN IF NOT EXISTS fiscal_conf smallint;
// ALTER TABLE tesouraria_anexo ADD COLUMN IF NOT EXISTS fiscal_conf_por text;
// ALTER TABLE tesouraria_anexo ADD COLUMN IF NOT EXISTS fiscal_conf_em timestamptz;
const db = require('../connection');
console.log('▶ Migração 357 — tesouraria_anexo.fiscal_conf');
const cols = db.prepare("PRAGMA table_info(tesouraria_anexo)").all().map(c => c.name);
if (!cols.includes('fiscal_conf')) db.exec('ALTER TABLE tesouraria_anexo ADD COLUMN fiscal_conf INTEGER');
if (!cols.includes('fiscal_conf_por')) db.exec('ALTER TABLE tesouraria_anexo ADD COLUMN fiscal_conf_por TEXT');
if (!cols.includes('fiscal_conf_em')) db.exec('ALTER TABLE tesouraria_anexo ADD COLUMN fiscal_conf_em TEXT');
console.log('✓ Migração 357 concluída (tesouraria_anexo.fiscal_conf)');
