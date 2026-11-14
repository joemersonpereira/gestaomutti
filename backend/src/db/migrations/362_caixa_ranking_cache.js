// 362 — Snapshot persistente do ranking do Caixa Destaque (Joe 2026-11-11).
// O ranking puxa muito do ERP/Tangerino (~40s). Em vez de recalcular toda vez, guardamos o último
// resultado por (ano, período, loja). Ao acessar, abre na hora o snapshot salvo; o usuário clica
// "Atualizar" (forcar) quando quiser recalcular. Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE caixa_ranking_cache (empresa_id text, ano int, periodo int, loja_id text DEFAULT '',
//   payload jsonb, atualizado_em timestamptz DEFAULT now(), PRIMARY KEY (empresa_id, ano, periodo, loja_id));
const db = require('../connection');
console.log('▶ Migração 362 — caixa_ranking_cache (snapshot do ranking)');
db.exec(`CREATE TABLE IF NOT EXISTS caixa_ranking_cache (
  empresa_id TEXT NOT NULL, ano INTEGER NOT NULL, periodo INTEGER NOT NULL, loja_id TEXT NOT NULL DEFAULT '',
  payload TEXT, atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, ano, periodo, loja_id)
)`);
console.log('✓ Migração 362 concluída (caixa_ranking_cache)');
