// 391 — Regime tributário: override MANUAL + flag (Joe 2026-11-14). Pros fornecedores que a API nunca
// resolve (ficam "Desconhecido"), a gestão fixa o regime à mão — e o manual NÃO é sobrescrito na revalidação.
//
// ── Caminho técnico v2.0 (Postgres) ──
// ALTER TABLE fornecedor_regime ADD COLUMN manual int DEFAULT 0;
// ALTER TABLE fornecedor_regime ADD COLUMN manual_por text;
const db = require('../connection');
console.log('▶ Migração 391 — fornecedor_regime: coluna manual');
const cols = db.prepare("PRAGMA table_info(fornecedor_regime)").all().map(c => c.name);
if (!cols.includes('manual')) db.exec('ALTER TABLE fornecedor_regime ADD COLUMN manual INTEGER DEFAULT 0');
if (!cols.includes('manual_por')) db.exec('ALTER TABLE fornecedor_regime ADD COLUMN manual_por TEXT');
console.log('✓ Migração 391 concluída');
