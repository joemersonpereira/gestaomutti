// 364 — Controle de saldo bancário (Joe 2026-11-11).
// Substitui a planilha: o financeiro anota, por conta, a DATA da última conciliação e o SALDO conferido
// naquela data. Serve de "saldo bate" oficial e alimenta a meta de conciliação em dia.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE tesouraria_saldo_banco (empresa_id text, conta_id text, conta_nome text, loja_erp int,
//   data_conciliacao date, saldo numeric, obs text, por text, atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, conta_id));
const db = require('../connection');
console.log('▶ Migração 364 — tesouraria_saldo_banco (controle de saldo)');
db.exec(`CREATE TABLE IF NOT EXISTS tesouraria_saldo_banco (
  empresa_id TEXT NOT NULL, conta_id TEXT NOT NULL, conta_nome TEXT, loja_erp INTEGER,
  data_conciliacao TEXT, saldo REAL, obs TEXT, por TEXT, atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, conta_id)
)`);
console.log('✓ Migração 364 concluída (tesouraria_saldo_banco)');
