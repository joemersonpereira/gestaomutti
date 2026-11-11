// 351 — PDF do contrato assinado anexado na aba Contrato — Joe 2026-11-11.
// Após a assinatura, o servidor gera um PDF (corpo + evidências: assinatura/selfie/documento/IP/MP)
// e guarda em tmkt_contrato.pdf_b64 (base64), servido por rota dedicada. Idempotente (ALTER por PRAGMA).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE tmkt_contrato ADD COLUMN IF NOT EXISTS pdf_b64 text;  -- PDF assinado (base64, sem prefixo data:)
const db = require('../connection');
console.log('▶ Migração 351 — tmkt_contrato.pdf_b64 (PDF do contrato assinado)');
const cols = db.prepare("PRAGMA table_info(tmkt_contrato)").all().map(c => c.name);
if (!cols.includes('pdf_b64')) db.exec("ALTER TABLE tmkt_contrato ADD COLUMN pdf_b64 TEXT");
console.log('✓ Migração 351 concluída (tmkt_contrato.pdf_b64)');
