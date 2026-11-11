// 339 — Metas de atividade do trade (Joe 2026-11-10).
// Além da % de premiação (tmkt_prem_vend_regra), a aba "Metas" cadastra metas de ATIVIDADE:
// quantas prospecções no mês, quantos contatos por dia, quantos fechamentos no mês.
// Escopo 'geral' vale para todos; um registro por colaborador sobrepõe o geral. Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE tmkt_trade_meta (
//   empresa_id text NOT NULL,
//   escopo text NOT NULL DEFAULT 'geral',        -- 'geral' | <colaborador_id>
//   prospeccoes_mes int DEFAULT 0,
//   contatos_dia int DEFAULT 0,
//   fechamentos_mes int DEFAULT 0,
//   atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, escopo)
// );
const db = require('../connection');
console.log('▶ Migração 339 — Metas de atividade do trade');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_trade_meta (
  empresa_id TEXT NOT NULL,
  escopo TEXT NOT NULL DEFAULT 'geral',
  prospeccoes_mes INTEGER DEFAULT 0,
  contatos_dia INTEGER DEFAULT 0,
  fechamentos_mes INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, escopo)
)`);
console.log('✓ Migração 339 concluída (tmkt_trade_meta)');
