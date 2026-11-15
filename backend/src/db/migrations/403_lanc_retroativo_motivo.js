// 403 — MOTIVO de lançamento retroativo (auditoria). O ERP é só leitura: a detecção do retroativo vem
// de lá (movimentacaocontacorrente: datahorainclusao >> datahora), mas o MOTIVO que a Diretoria cobra é
// guardado aqui no app, por lançamento (id do movimento no ERP). Joe 2026-11-14 (item #7 da fila).
// Idempotente.
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS lanc_retroativo_motivo (
    empresa_id  TEXT NOT NULL,
    lanc_id     TEXT NOT NULL,            -- id do movimentacaocontacorrente (ERP)
    motivo      TEXT,
    usuario     TEXT,                     -- quem justificou
    criado_em   TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (empresa_id, lanc_id)
  )`).run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS lanc_retroativo_motivo (
  empresa_id text NOT NULL,
  lanc_id    text NOT NULL,              -- movimentacaocontacorrente.id do ERP
  motivo     text,
  usuario    text,
  criado_em  timestamptz DEFAULT now(),
  PRIMARY KEY (empresa_id, lanc_id)
);
-- O "X dias" (limiar do retroativo) fica em configuracoes (chave 'lanc_retroativo_dias', default 5).
-- Detecção (ERP, read-only): movimentacaocontacorrente onde
--   (datahorainclusao::date - datahora::date) > X  AND  datahora >= '2015-01-01'
--   e as mesmas exclusões dos lançamentos manuais (usuario <> 'sistema', opcional sem 'Baixa de Cartão').
-- A Diretoria vê a lista e cobra o motivo; o setor preenche (LEFT JOIN desta tabela por lanc_id).
*/
