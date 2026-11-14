// 382 — Pessoas vinculadas à premiação do comprador por FATOR (Joe 2026-11-13), igual à Tesouraria,
// mas POR COMPRADOR: cada colaborador vinculado recebe a premiação daquele comprador × o fator dele
// (1 = cheio, 0,5 = metade). Ex.: comprador titular 100% + assistente 50%.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE compras_premio_pessoa (empresa_id text, comprador_id text, colaborador_id text,
//   fator numeric, ativo int DEFAULT 1, criado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, comprador_id, colaborador_id));
const db = require('../connection');
console.log('▶ Migração 382 — compras_premio_pessoa (pessoas por fator, por comprador)');
db.exec(`CREATE TABLE IF NOT EXISTS compras_premio_pessoa (
  empresa_id TEXT NOT NULL, comprador_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  fator REAL, ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, comprador_id, colaborador_id)
)`);
console.log('✓ Migração 382 concluída');
