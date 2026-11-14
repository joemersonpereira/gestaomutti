// 383 — Respostas de satisfação (CSAT) do BotVendas (Joe 2026-11-13). Fonte autoritativa da
// "média de avaliação" do Online: endpoint /api/v2/satisfaction-answers/list (pergunta
// "classificaria seu atendimento", nota 1-5). 1 linha por RESPOSTA (answer id único).
// O extrator da conversa (heurístico) só pegava um subconjunto; aqui vem o número cheio (bate 4,5/341).
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE botvendas_satisfacao (
//   empresa_id text, answer_id bigint, order_id bigint, nota int, pergunta text,
//   vendedor_nome text, attendant_id bigint, colaborador_id text, loja_id text,
//   respondido_em timestamptz, sincronizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, answer_id));
// CREATE INDEX ON botvendas_satisfacao (empresa_id, respondido_em);
const db = require('../connection');
console.log('▶ Migração 383 — botvendas_satisfacao (CSAT do BotVendas)');
db.exec(`CREATE TABLE IF NOT EXISTS botvendas_satisfacao (
  empresa_id TEXT NOT NULL,
  answer_id INTEGER NOT NULL,
  order_id INTEGER,
  nota INTEGER,
  pergunta TEXT,
  vendedor_nome TEXT,
  attendant_id INTEGER,
  colaborador_id TEXT,
  loja_id TEXT,
  respondido_em TEXT,
  sincronizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, answer_id)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bv_sat_emp_data ON botvendas_satisfacao (empresa_id, respondido_em)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bv_sat_emp_loja ON botvendas_satisfacao (empresa_id, loja_id)`);
console.log('✓ Migração 383 concluída');
