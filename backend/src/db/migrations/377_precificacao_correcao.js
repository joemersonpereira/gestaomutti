// 377 — Área de Precificação: marcação de "corrigido" por produto e tipo de problema (Joe 2026-11-12).
// tipo: 'abaixo_custo' | 'abaixo_margem' | 'comprado_caro'. A meta de correção é o nº de itens AINDA fora
// do preço (menor melhor) — marcar corrigido tira o item da lista de pendentes.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE precificacao_correcao (empresa_id text, tipo text, produto_id bigint, corrigido_por text,
//   corrigido_em timestamptz DEFAULT now(), obs text, PRIMARY KEY (empresa_id, tipo, produto_id));
const db = require('../connection');
console.log('▶ Migração 377 — precificacao_correcao (marcar "corrigido" por produto/tipo)');
db.exec(`CREATE TABLE IF NOT EXISTS precificacao_correcao (
  empresa_id TEXT NOT NULL, tipo TEXT NOT NULL, produto_id INTEGER NOT NULL,
  corrigido_por TEXT, corrigido_em TEXT DEFAULT (datetime('now')), obs TEXT,
  PRIMARY KEY (empresa_id, tipo, produto_id)
)`);
console.log('✓ Migração 377 concluída (precificacao_correcao)');
