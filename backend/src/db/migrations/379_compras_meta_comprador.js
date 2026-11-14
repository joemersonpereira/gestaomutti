// 379 — Meta do Meu Setor de Compras POR COMPRADOR (Joe 2026-11-13).
// Hoje a meta/alvo é global por indicador (compras_meusetor_indicador.meta). Mas alvos em R$
// (saldo de estoque, redução de curva D) e mesmo os %/dias variam por comprador — cada um tem o
// seu nível. Esta tabela guarda o alvo ESPECÍFICO de um comprador; quando não existe, cai no global.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE compras_meusetor_meta (empresa_id text, comprador_id text, chave text, meta numeric,
//   por text, atualizado_em timestamptz DEFAULT now(), PRIMARY KEY (empresa_id, comprador_id, chave));
const db = require('../connection');
console.log('▶ Migração 379 — compras_meusetor_meta (meta por comprador)');
db.exec(`CREATE TABLE IF NOT EXISTS compras_meusetor_meta (
  empresa_id TEXT NOT NULL, comprador_id TEXT NOT NULL, chave TEXT NOT NULL,
  meta REAL, por TEXT, atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, comprador_id, chave)
)`);
console.log('✓ Migração 379 concluída (compras_meusetor_meta)');
