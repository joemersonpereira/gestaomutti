// 346 — Excluir venda da premiação/meta (validador do diretor) — Joe 2026-11-11.
// Em campanhas de fim de ano algumas vendas não devem contar na premiação/meta. Um DIRETOR marca a
// negociação como "não considerar" e ela sai da contagem (premiação por espaço e meta). Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE tmkt_vendas
//   ADD COLUMN IF NOT EXISTS nao_premia int NOT NULL DEFAULT 0,   -- 1 = fora da premiação/meta
//   ADD COLUMN IF NOT EXISTS nao_premia_motivo text,
//   ADD COLUMN IF NOT EXISTS nao_premia_por text,                 -- colaborador (diretor) que marcou
//   ADD COLUMN IF NOT EXISTS nao_premia_em timestamptz;
const db = require('../connection');
console.log('▶ Migração 346 — tmkt_vendas.nao_premia (excluir da premiação/meta)');
const cols = db.prepare("PRAGMA table_info(tmkt_vendas)").all().map(c => c.name);
const add = (nome, ddl) => { if (!cols.includes(nome)) db.exec(`ALTER TABLE tmkt_vendas ADD COLUMN ${ddl}`); };
add('nao_premia', 'nao_premia INTEGER NOT NULL DEFAULT 0');
add('nao_premia_motivo', 'nao_premia_motivo TEXT');
add('nao_premia_por', 'nao_premia_por TEXT');
add('nao_premia_em', 'nao_premia_em TEXT');
console.log('✓ Migração 346 concluída (tmkt_vendas.nao_premia)');
