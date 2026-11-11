// 353 — Flag "tesouraria" no colaborador (Joe 2026-11-11).
// Marca quem, dentro do Financeiro, cuida da Tesouraria (fechamento do dia, conferência de caixa,
// lançamento de depósitos/despesas). Usado p/ a lateral de metas do responsável e p/ filtrar acesso.
// NÃO é a antiga função "Tesouraria" — é um marcador sobre o colaborador, igual ao flag `trade`.
// Idempotente (ALTER protegido).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS tesouraria boolean NOT NULL DEFAULT false;
const db = require('../connection');
console.log('▶ Migração 353 — colaborador.tesouraria');
const col = db.prepare("PRAGMA table_info(colaboradores)").all().some(c => c.name === 'tesouraria');
if (!col) db.exec(`ALTER TABLE colaboradores ADD COLUMN tesouraria INTEGER NOT NULL DEFAULT 0`);
console.log('✓ Migração 353 concluída (colaborador.tesouraria)');
