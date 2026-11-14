// 369 — Meu Setor de Compras: premiação ponderada por comprador (Joe 2026-11-12).
// Catálogo de indicadores com bloco (mês 100% / padrão bônus), peso, meta e direção — tudo CADASTRÁVEL.
// Pontuação BINÁRIA (bateu a meta = peso cheio). Nota = Σ(mês batidos) + Σ(padrão batidos, bônus) → 0..130.
// Escala de bônus: ≥90→100% · 80–89→70% · 70–79→40% · <70→sem bônus.
// Indicadores "auto" vêm dos libs de compras; os "manual" o gestor lança o realizado por mês.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE compras_meusetor_indicador (empresa_id text, chave text, bloco text, peso numeric,
//   meta numeric, direcao text, ativo smallint DEFAULT 1, PRIMARY KEY(empresa_id, chave));
// CREATE TABLE compras_meusetor_realizado (empresa_id text, comprador_id text, ano int, mes int,
//   chave text, valor numeric, por text, atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY(empresa_id, comprador_id, ano, mes, chave));
const db = require('../connection');
console.log('▶ Migração 369 — compras_meusetor (premiação ponderada do comprador)');
db.exec(`CREATE TABLE IF NOT EXISTS compras_meusetor_indicador (
  empresa_id TEXT NOT NULL, chave TEXT NOT NULL, bloco TEXT, peso REAL, meta REAL, direcao TEXT,
  ativo INTEGER DEFAULT 1, PRIMARY KEY (empresa_id, chave)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS compras_meusetor_realizado (
  empresa_id TEXT NOT NULL, comprador_id TEXT NOT NULL, ano INTEGER, mes INTEGER, chave TEXT,
  valor REAL, por TEXT, atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, comprador_id, ano, mes, chave)
)`);
console.log('✓ Migração 369 concluída (compras_meusetor)');
