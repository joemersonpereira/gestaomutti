// 367 — Diretoria: validação do fechamento do setor (Joe 2026-11-12).
// A diretoria valida 5 requisitos por pessoa por ciclo pra liberar a premiação. Cada requisito NÃO
// validado desconta 10% do prêmio (os 5 = a metade em risco; a outra metade é garantida). Piso = 50%.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE setor_fechamento_validacao (empresa_id text, setor text, ciclo text, colaborador_id text,
//   pontualidade smallint DEFAULT 0, conduta smallint DEFAULT 0, sla_pulsy smallint DEFAULT 0,
//   desenvolvimento smallint DEFAULT 0, avaliacao_pulsy smallint DEFAULT 0, por text,
//   atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, setor, ciclo, colaborador_id));
const db = require('../connection');
console.log('▶ Migração 367 — setor_fechamento_validacao (Diretoria: fechamento do setor)');
db.exec(`CREATE TABLE IF NOT EXISTS setor_fechamento_validacao (
  empresa_id TEXT NOT NULL, setor TEXT NOT NULL, ciclo TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  pontualidade INTEGER DEFAULT 0, conduta INTEGER DEFAULT 0, sla_pulsy INTEGER DEFAULT 0,
  desenvolvimento INTEGER DEFAULT 0, avaliacao_pulsy INTEGER DEFAULT 0,
  por TEXT, atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, setor, ciclo, colaborador_id)
)`);
console.log('✓ Migração 367 concluída (setor_fechamento_validacao)');
