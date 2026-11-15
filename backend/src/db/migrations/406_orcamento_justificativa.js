// 406 — justificativa/comentário de desvio do orçamento, por loja/ano/mês/grupo. Joe 2026-11-15.
// No Acompanhamento do orçamento, o responsável justifica POR QUE um grupo estourou.
// loja_id vazio ('') = Rede (visão consolidada). mes 0 = acumulado do ano.
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS orcamento_justificativa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL DEFAULT '',
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    grupo TEXT NOT NULL,
    texto TEXT NOT NULL,
    autor TEXT,
    atualizado_em TEXT DEFAULT (datetime('now')),
    UNIQUE(empresa_id, loja_id, ano, mes, grupo)
  )`).run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS orcamento_justificativa (
  id bigserial PRIMARY KEY,
  empresa_id text NOT NULL,
  loja_id text NOT NULL DEFAULT '',
  ano int NOT NULL,
  mes int NOT NULL,                 -- 0 = acumulado do ano
  grupo text NOT NULL,
  texto text NOT NULL,
  autor text,
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE (empresa_id, loja_id, ano, mes, grupo)
);
*/
