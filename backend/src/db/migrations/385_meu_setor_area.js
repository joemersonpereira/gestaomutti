// 385 — Meu Setor por ÁREA (Online e Suporte Loja) — Joe 2026-11-13. Pilares/indicadores com metas
// cadastráveis (igual ao Meu Setor de Compras). Config por empresa+área+indicador; sem registro = default
// do catálogo. Pesos iguais por padrão (o Joe gosta assim).
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE meu_setor_area_meta (empresa_id text, area text, chave text, meta numeric, peso numeric,
//   direcao text, ativo int DEFAULT 1, atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, area, chave));
const db = require('../connection');
console.log('▶ Migração 385 — meu_setor_area_meta (pilares/metas de Online e Suporte)');
db.exec(`CREATE TABLE IF NOT EXISTS meu_setor_area_meta (
  empresa_id TEXT NOT NULL, area TEXT NOT NULL, chave TEXT NOT NULL,
  meta REAL, peso REAL, direcao TEXT, ativo INTEGER DEFAULT 1,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, area, chave)
)`);
console.log('✓ Migração 385 concluída');
