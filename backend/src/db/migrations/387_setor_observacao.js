// 387 — Observações do setor (Joe 2026-11-14): padrão em TODA tela de Meu Setor (compras, caixas,
// online, suporte…). A gestão registra observações datadas sobre o setor (o que explica o resultado,
// combinados, pontos de atenção). Genérico por `setor` (string) p/ um só componente servir todas as telas.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE setor_observacao (id bigserial PRIMARY KEY, empresa_id text, setor text, texto text,
//   autor_id text, autor_nome text, criado_em timestamptz DEFAULT now());
// CREATE INDEX ix_setor_obs ON setor_observacao (empresa_id, setor, criado_em DESC);
const db = require('../connection');
console.log('▶ Migração 387 — setor_observacao (observações do setor, padrão do Meu Setor)');
db.exec(`CREATE TABLE IF NOT EXISTS setor_observacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id TEXT NOT NULL, setor TEXT NOT NULL, texto TEXT NOT NULL,
  autor_id TEXT, autor_nome TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS ix_setor_obs ON setor_observacao (empresa_id, setor, criado_em DESC)');
console.log('✓ Migração 387 concluída');
