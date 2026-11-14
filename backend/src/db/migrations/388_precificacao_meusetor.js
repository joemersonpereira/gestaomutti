// 388 — Meu Setor da PRECIFICAÇÃO (Joe 2026-11-14): área própria, comprador-scoped, igual Online/Suporte,
// mas por COMPRADOR. Indicadores "menor melhor" (nº de itens fora do preço, não corrigidos): abaixo do
// custo, abaixo da margem, comprado mais caro. Meta por comprador + premiação (teto/bônus + pessoas por fator).
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE precificacao_ms_meta (empresa_id text, comprador_id text, chave text, meta numeric, tol numeric,
//   peso numeric, ativo int DEFAULT 1, atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, comprador_id, chave));
// CREATE TABLE precificacao_ms_config (empresa_id text, chave text, valor numeric, PRIMARY KEY (empresa_id, chave));
//   -- chave ∈ {premio_pilar_valor, premio_bonus_pct}
// CREATE TABLE precificacao_premio_pessoa (empresa_id text, comprador_id text, colaborador_id text,
//   fator numeric, ativo int DEFAULT 1, criado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, comprador_id, colaborador_id));
const db = require('../connection');
console.log('▶ Migração 388 — precificacao_meusetor (Meu Setor da Precificação por comprador)');
db.exec(`CREATE TABLE IF NOT EXISTS precificacao_ms_meta (
  empresa_id TEXT NOT NULL, comprador_id TEXT NOT NULL, chave TEXT NOT NULL,
  meta REAL, tol REAL, peso REAL, ativo INTEGER DEFAULT 1,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, comprador_id, chave)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS precificacao_ms_config (
  empresa_id TEXT NOT NULL, chave TEXT NOT NULL, valor REAL,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, chave)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS precificacao_premio_pessoa (
  empresa_id TEXT NOT NULL, comprador_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  fator REAL, ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, comprador_id, colaborador_id)
)`);
console.log('✓ Migração 388 concluída');
