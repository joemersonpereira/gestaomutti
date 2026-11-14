// 359 — Lançamento AVULSO de diferença de caixa (falta/sobra) pela gestão (Joe 2026-11-11).
// Às vezes a diferença não vem do ERP e a gestão precisa lançar à mão (falta ou sobra). Entra na aba
// Diferenças junto com as do ERP (marcada como "avulso") e pode alimentar os pontos do Caixa Destaque.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE tesouraria_diferenca_avulsa (id text PRIMARY KEY, empresa_id text NOT NULL, loja_id text,
//   data date NOT NULL, operador text, operador_login text, valor numeric NOT NULL, tipo text NOT NULL,
//   obs text, por text, criado_em timestamptz DEFAULT now());
const db = require('../connection');
console.log('▶ Migração 359 — tesouraria_diferenca_avulsa');
db.exec(`CREATE TABLE IF NOT EXISTS tesouraria_diferenca_avulsa (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT,
  data TEXT NOT NULL, operador TEXT, operador_login TEXT, valor REAL NOT NULL, tipo TEXT NOT NULL,
  obs TEXT, por TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_dif_avulsa ON tesouraria_diferenca_avulsa(empresa_id, data)`);
console.log('✓ Migração 359 concluída (tesouraria_diferenca_avulsa)');
