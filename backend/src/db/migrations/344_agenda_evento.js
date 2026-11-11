// 344 — Calendário/agenda da empresa (Joe 2026-11-11).
// Calendário GERAL: eventos "empresa" (visibilidade='empresa') todo mundo vê (feiras, Dia D, campanhas,
// reuniões). Eventos "pessoal" (visibilidade='pessoal', dono_id=quem) só o dono vê.
// Agendamentos vindos de lead/prospecção/tarefa NÃO moram aqui — são derivados na hora (GET /agenda)
// e sempre pessoais do responsável. Esta tabela guarda só o que a pessoa agenda à mão. Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE agenda_evento (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   empresa_id text NOT NULL,
//   titulo text NOT NULL,
//   descricao text,
//   data date NOT NULL,                         -- início
//   hora text,                                  -- HH:MM opcional
//   fim date,                                   -- fim (evento de vários dias) opcional
//   local text,
//   cor text,
//   visibilidade text NOT NULL DEFAULT 'pessoal', -- empresa | pessoal
//   dono_id text,                               -- quando pessoal: só esse colaborador vê
//   origem text NOT NULL DEFAULT 'manual',
//   ref_id text,
//   criado_por text,
//   criado_em timestamptz DEFAULT now()
// );
// CREATE INDEX ON agenda_evento(empresa_id, data);
// CREATE INDEX ON agenda_evento(empresa_id, dono_id);
const db = require('../connection');
console.log('▶ Migração 344 — agenda_evento (calendário da empresa)');
db.exec(`
CREATE TABLE IF NOT EXISTS agenda_evento (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data TEXT NOT NULL,
  hora TEXT,
  fim TEXT,
  local TEXT,
  cor TEXT,
  visibilidade TEXT NOT NULL DEFAULT 'pessoal',
  dono_id TEXT,
  origem TEXT NOT NULL DEFAULT 'manual',
  ref_id TEXT,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agenda_emp_data ON agenda_evento(empresa_id, data);
CREATE INDEX IF NOT EXISTS idx_agenda_emp_dono ON agenda_evento(empresa_id, dono_id);
`);
console.log('✓ Migração 344 concluída (agenda_evento)');
