// 404 — LOG de exclusão de anexos da Tesouraria (depósitos/despesas/recargas). Joe 2026-11-14 (fila #8):
// a Diretoria quer ver as EXCLUSÕES de depósitos feitas (quem/quando/qual/valor). Hoje o delete some sem
// deixar rastro. Aqui guardamos a "lápide" do anexo excluído (metadados, sem o arquivo). Idempotente.
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS tesouraria_anexo_exclusao (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id   TEXT NOT NULL,
    anexo_id     TEXT,
    loja_id      TEXT,
    data         TEXT,                  -- data do caixa/depósito
    tipo         TEXT,                  -- deposito | despesa | recarga | orcamento
    descricao    TEXT,
    valor        REAL,
    nome_arquivo TEXT,
    criado_em    TEXT,                  -- quando o anexo tinha sido criado
    excluido_por TEXT,                  -- nome de quem excluiu
    excluido_por_id TEXT,
    motivo       TEXT,
    excluido_em  TEXT DEFAULT (datetime('now'))
  )`).run();
  db.prepare('CREATE INDEX IF NOT EXISTS ix_tes_exclusao ON tesouraria_anexo_exclusao(empresa_id, data, tipo)').run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS tesouraria_anexo_exclusao (
  id            bigserial PRIMARY KEY,
  empresa_id    text NOT NULL,
  anexo_id      text,
  loja_id       text,
  data          date,
  tipo          text,
  descricao     text,
  valor         numeric,
  nome_arquivo  text,
  criado_em     timestamptz,
  excluido_por  text,
  excluido_por_id text,
  motivo        text,
  excluido_em   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tes_exclusao ON tesouraria_anexo_exclusao(empresa_id, data, tipo);
-- No DELETE do anexo: INSERT nesta tabela com os metadados + usuário logado, DENTRO da mesma transação.
-- A Diretoria lista por período (tipo='deposito' em destaque).
*/
