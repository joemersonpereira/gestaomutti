// 386 — Meu Setor por ÁREA: faixa de valor (tolerância) + premiação igual caixas — Joe 2026-11-14.
// Fecha o "igual fizemos em caixas": cada indicador ganha TOLERÂNCIA (a banda do amarelo, que cria a
// FAIXA DE VALOR verde/amarelo/vermelho em torno da meta), cada ÁREA ganha teto de prêmio por pilar (R$,
// nota 100 = teto) + bônus % na superação, e PESSOAS vinculadas por fator (titular 1 = cheio, auxiliar 0,5).
//
// ── Caminho técnico v2.0 (Postgres) ──
// ALTER TABLE meu_setor_area_meta ADD COLUMN tol numeric;
// CREATE TABLE meu_setor_area_config (empresa_id text, area text, chave text, valor numeric,
//   atualizado_em timestamptz DEFAULT now(), PRIMARY KEY (empresa_id, area, chave));
//   -- chave ∈ {premio_pilar_valor, premio_bonus_pct}
// CREATE TABLE meu_setor_area_premio_pessoa (empresa_id text, area text, colaborador_id text,
//   fator numeric, ativo int DEFAULT 1, criado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, area, colaborador_id));
const db = require('../connection');
console.log('▶ Migração 386 — meu_setor_area: tolerância + premiação (teto/bônus/pessoas)');

// 1) tol (banda do amarelo) na tabela de metas — ALTER protegido (idempotente).
const temTol = db.prepare("PRAGMA table_info(meu_setor_area_meta)").all().some(c => c.name === 'tol');
if (!temTol) db.exec('ALTER TABLE meu_setor_area_meta ADD COLUMN tol REAL');

// 2) Config de prêmio por área (teto por pilar + bônus % na superação).
db.exec(`CREATE TABLE IF NOT EXISTS meu_setor_area_config (
  empresa_id TEXT NOT NULL, area TEXT NOT NULL, chave TEXT NOT NULL, valor REAL,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, area, chave)
)`);

// 3) Pessoas vinculadas à premiação por fator (igual Tesouraria/Compras, mas por ÁREA).
db.exec(`CREATE TABLE IF NOT EXISTS meu_setor_area_premio_pessoa (
  empresa_id TEXT NOT NULL, area TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  fator REAL, ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, area, colaborador_id)
)`);
console.log('✓ Migração 386 concluída');
