// 397 — Pauta/briefing/ideias na ação de marketing + comentários (thread). Parte do epic Marketing.
// A "área de pauta" do doc do Joe: qual a pauta, briefing, ideias + comentários da equipe.
module.exports = function (db) {
  const cols = db.prepare("PRAGMA table_info(mkt_agenda)").all().map(c => c.name);
  for (const c of ['pauta', 'briefing', 'ideias']) {
    if (!cols.includes(c)) db.prepare(`ALTER TABLE mkt_agenda ADD COLUMN ${c} TEXT`).run();
  }
  db.prepare(`CREATE TABLE IF NOT EXISTS mkt_comentario (
    id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, agenda_id TEXT NOT NULL,
    texto TEXT NOT NULL, autor_id TEXT, autor_nome TEXT, criado_em TEXT DEFAULT (datetime('now'))
  )`).run();
  db.prepare('CREATE INDEX IF NOT EXISTS ix_mkt_coment_agenda ON mkt_comentario(empresa_id, agenda_id)').run();
};

/* === Caminho técnico v2.0 (Postgres) ===
ALTER TABLE mkt_agenda ADD COLUMN IF NOT EXISTS pauta text, ADD COLUMN IF NOT EXISTS briefing text, ADD COLUMN IF NOT EXISTS ideias text;
CREATE TABLE IF NOT EXISTS mkt_comentario (id text PRIMARY KEY, empresa_id text NOT NULL, agenda_id text NOT NULL,
  texto text NOT NULL, autor_id text, autor_nome text, criado_em timestamptz DEFAULT now());
-- Sell-out da ação: SUM(itemvenda) WHERE cadernoofertaid = <caderno da ação> e venda na janela da ação.
*/
