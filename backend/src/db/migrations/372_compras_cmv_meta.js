// 372 — Meta de CMV por GRUPO PRINCIPAL, por loja ou igual para todas (Joe 2026-11-12).
// O CMV muda muito por categoria (propagado ~84%, genérico ~49%). Então a meta deixa de ser um número
// único e passa a ser por grupo principal (PERFUMARIA, GENERICO, PROPAGADO…). loja_id = '' significa
// "vale para TODAS as lojas" (global); uma loja específica sobrepõe o global. O alvo pode ser gerado
// pela MÉDIA dos últimos meses (cmvGrupoErp.cmvPorGrupo) e depois ajustado à mão.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE compras_cmv_meta (empresa_id text, loja_id text DEFAULT '', grupo text, meta numeric,
//   atualizado_por text, atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, loja_id, grupo));
// loja_id = '' = global (todas as lojas). Efetiva(loja,grupo) = meta da loja se existir, senão a global.
const db = require('../connection');
console.log('▶ Migração 372 — compras_cmv_meta (meta de CMV por grupo principal, global ou por loja)');
db.exec(`CREATE TABLE IF NOT EXISTS compras_cmv_meta (
  empresa_id TEXT NOT NULL,
  loja_id TEXT NOT NULL DEFAULT '',
  grupo TEXT NOT NULL,
  meta REAL,
  atualizado_por TEXT,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, loja_id, grupo)
)`);
console.log('✓ Migração 372 concluída (compras_cmv_meta)');
