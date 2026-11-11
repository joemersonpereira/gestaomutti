// 340 — Flag "trade" no colaborador (Joe 2026-11-10).
// Marca quem é do time de Trade Marketing: usado p/ filtrar o responsável das prospecções/metas e
// para a premiação do vendedor de trade. Idempotente (ALTER protegido).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS trade boolean NOT NULL DEFAULT false;
const db = require('../connection');
console.log('▶ Migração 340 — colaborador.trade');
const col = db.prepare("PRAGMA table_info(colaboradores)").all().some(c => c.name === 'trade');
if (!col) db.exec(`ALTER TABLE colaboradores ADD COLUMN trade INTEGER NOT NULL DEFAULT 0`);
console.log('✓ Migração 340 concluída (colaborador.trade)');
