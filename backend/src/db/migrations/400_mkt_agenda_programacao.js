// 400 — Vincula uma AÇÃO de marketing (mkt_agenda) a uma PROGRAMAÇÃO do calendário (tmkt_calendario).
// Ideia do Joe: a programação (tema/plano recorrente do calendário do Trade — ex.: "Dia do Cliente",
// "Quarta do Bem-Estar", dia do suplemento) deixa de ser só um lembrete e passa a ter penduradas as
// ações concretas que a executam (o post, o material, o evento). Assim a estratégia (programação) e a
// execução (ação) ficam amarradas: dá pra ver, a partir da programação, tudo que foi feito pra ela.
// Idempotente: só adiciona a coluna se ainda não existir.
module.exports = function (db) {
  const cols = db.prepare("PRAGMA table_info(mkt_agenda)").all().map(c => c.name);
  if (!cols.includes('programacao_id')) {
    db.prepare("ALTER TABLE mkt_agenda ADD COLUMN programacao_id TEXT").run();
  }
  db.prepare("CREATE INDEX IF NOT EXISTS ix_mkt_agenda_prog ON mkt_agenda(empresa_id, programacao_id)").run();
};

/* === Caminho técnico v2.0 (Postgres) ===
ALTER TABLE mkt_agenda ADD COLUMN IF NOT EXISTS programacao_id text REFERENCES tmkt_calendario(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_mkt_agenda_prog ON mkt_agenda(empresa_id, programacao_id);
-- Leitura: ações de uma programação =
--   SELECT a.* FROM mkt_agenda a WHERE a.programacao_id = $1 ORDER BY a.data_ini;
-- No calendário, o evento 'marketing' (agenda_evento) pode herdar a cor/tema da programação vinculada.
*/
