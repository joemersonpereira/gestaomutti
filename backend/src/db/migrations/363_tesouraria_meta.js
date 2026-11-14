// 363 — Metas do setor Tesouraria (Joe 2026-11-11).
// Cada meta tem alvo cadastrável; o REALIZADO é calculado automático do sistema (ver lib/tesourariaMetas.js)
// e vira um farol verde/amarelo/vermelho. O catálogo (label/direção/unidade) fica no código; aqui guardamos
// só o alvo e o ativo por chave.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE tesouraria_meta (empresa_id text, chave text, meta_valor numeric, ativo boolean DEFAULT true,
//   atualizado_em timestamptz DEFAULT now(), PRIMARY KEY (empresa_id, chave));
const db = require('../connection');
console.log('▶ Migração 363 — tesouraria_meta (metas do setor)');
db.exec(`CREATE TABLE IF NOT EXISTS tesouraria_meta (
  empresa_id TEXT NOT NULL, chave TEXT NOT NULL, meta_valor REAL, ativo INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT DEFAULT (datetime('now')), PRIMARY KEY (empresa_id, chave)
)`);
console.log('✓ Migração 363 concluída (tesouraria_meta)');
