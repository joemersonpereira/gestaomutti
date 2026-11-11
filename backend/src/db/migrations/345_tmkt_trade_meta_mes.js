// 345 — Metas de atividade do trade POR MÊS + carry-over (Joe 2026-11-11).
// Antes a meta era um valor único sempre ligado (tmkt_trade_meta). Agora dá pra cadastrar a meta de
// vários meses (um período início→fim aplica o mesmo valor em cada mês) e ajustar meses pontuais.
// A tabela tmkt_trade_meta (fixa) CONTINUA como fallback quando não há linha do mês.
// Carry-over ("excedente abate o próximo mês") é calculado na apuração (routes), não gravado aqui.
// Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE tmkt_trade_meta_mes (
//   empresa_id text NOT NULL,
//   escopo text NOT NULL,              -- 'geral' | <colaborador_id>
//   ano int NOT NULL,
//   mes int NOT NULL,                  -- 1..12
//   prospeccoes_mes int DEFAULT 0,
//   contatos_dia int DEFAULT 0,
//   fechamentos_mes int DEFAULT 0,
//   atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, escopo, ano, mes)
// );
const db = require('../connection');
console.log('▶ Migração 345 — tmkt_trade_meta_mes (metas por mês + carry-over)');
db.exec(`
CREATE TABLE IF NOT EXISTS tmkt_trade_meta_mes (
  empresa_id TEXT NOT NULL,
  escopo TEXT NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  prospeccoes_mes INTEGER DEFAULT 0,
  contatos_dia INTEGER DEFAULT 0,
  fechamentos_mes INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, escopo, ano, mes)
);
CREATE INDEX IF NOT EXISTS idx_trade_meta_mes ON tmkt_trade_meta_mes(empresa_id, ano, mes);
`);
console.log('✓ Migração 345 concluída (tmkt_trade_meta_mes)');
