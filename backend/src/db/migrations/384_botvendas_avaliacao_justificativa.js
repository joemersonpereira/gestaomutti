// 384 — Justificativa de avaliação baixa do BotVendas (Joe 2026-11-13). Toda avaliação (CSAT) com
// nota < 3 precisa de justificativa do responsável (o vendedor do atendimento), vista na "minha área"
// do Online. 1 justificativa por resposta (answer_id).
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE botvendas_avaliacao_justificativa (
//   empresa_id text, answer_id bigint, justificativa text, colaborador_id text, por text,
//   criado_em timestamptz DEFAULT now(), PRIMARY KEY (empresa_id, answer_id));
const db = require('../connection');
console.log('▶ Migração 384 — botvendas_avaliacao_justificativa');
db.exec(`CREATE TABLE IF NOT EXISTS botvendas_avaliacao_justificativa (
  empresa_id TEXT NOT NULL,
  answer_id INTEGER NOT NULL,
  justificativa TEXT,
  colaborador_id TEXT,
  por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, answer_id)
)`);
console.log('✓ Migração 384 concluída');
