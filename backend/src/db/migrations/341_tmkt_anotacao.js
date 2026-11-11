// 341 — Anotações pessoais do painel de trade (Joe 2026-11-10).
// Bloco de notas rápido do colaborador na lateral da área de trade (lembretes soltos, recados).
// É por usuário. Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE tmkt_anotacao (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   empresa_id text NOT NULL,
//   usuario_id text NOT NULL,
//   texto text NOT NULL,
//   feito boolean NOT NULL DEFAULT false,
//   criado_em timestamptz DEFAULT now()
// );
// CREATE INDEX ON tmkt_anotacao(empresa_id, usuario_id, feito);
const db = require('../connection');
console.log('▶ Migração 341 — Anotações do painel de trade');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_anotacao (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  texto TEXT NOT NULL,
  feito INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tmkt_anotacao ON tmkt_anotacao(empresa_id, usuario_id, feito);`);
console.log('✓ Migração 341 concluída (tmkt_anotacao)');
