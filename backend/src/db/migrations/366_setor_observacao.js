// 366 — Observações do "Meu Setor" (Joe 2026-11-12).
// Bloco de anotações que a equipe vai acumulando dentro do Meu Setor (Tesouraria, Retail, …).
// Genérico por `setor` pra reaproveitar em qualquer área que tenha o painel de metas em pilares.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE setor_observacao (id text PRIMARY KEY, empresa_id text, setor text, usuario_id text,
//   autor_nome text, texto text, criado_em timestamptz DEFAULT now());
// CREATE INDEX ON setor_observacao (empresa_id, setor, criado_em DESC);
const db = require('../connection');
console.log('▶ Migração 366 — setor_observacao (observações do Meu Setor)');
db.exec(`CREATE TABLE IF NOT EXISTS setor_observacao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, setor TEXT NOT NULL,
  usuario_id TEXT, autor_nome TEXT, texto TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_setor_obs ON setor_observacao (empresa_id, setor, criado_em DESC)');
console.log('✓ Migração 366 concluída (setor_observacao)');
