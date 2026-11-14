// 373 — Metas de FATURAMENTO por indicador, global ou por loja (Joe 2026-11-12).
// Indicadores: ticket médio, CMV, unidades vendidas, clientes identificados, vitaminas, vendas na entrega.
// loja_id = '' = vale para todas as lojas (global); uma loja específica sobrepõe.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE faturamento_meta (empresa_id text, loja_id text DEFAULT '', indicador text, meta numeric,
//   atualizado_por text, atualizado_em timestamptz DEFAULT now(), PRIMARY KEY (empresa_id, loja_id, indicador));
const db = require('../connection');
console.log('▶ Migração 373 — faturamento_meta (metas de faturamento por indicador, global ou por loja)');
db.exec(`CREATE TABLE IF NOT EXISTS faturamento_meta (
  empresa_id TEXT NOT NULL,
  loja_id TEXT NOT NULL DEFAULT '',
  indicador TEXT NOT NULL,
  meta REAL,
  atualizado_por TEXT,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, loja_id, indicador)
)`);
console.log('✓ Migração 373 concluída (faturamento_meta)');
