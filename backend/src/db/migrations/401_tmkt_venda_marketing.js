// 401 — A MESMA "Nova ação" do Marketing, acionável de dentro da venda/negociação do Trade.
// Ideia do Joe: na venda do Trade (espaço patrocinado por fornecedor) teria o MESMO botão de ação do
// Marketing — não um fluxo paralelo. A pessoa do comercial cria ali a ação de marketing (post, material,
// evento) e ela nasce já ligada àquela venda. É a mesma mkt_agenda (vai pro calendário, gera tarefa,
// tem materiais), só que com o vínculo tmkt_venda_id apontando pra venda que a originou.
// Idempotente: só adiciona a coluna se faltar.
module.exports = function (db) {
  const cols = db.prepare("PRAGMA table_info(mkt_agenda)").all().map(c => c.name);
  if (!cols.includes('tmkt_venda_id')) {
    db.prepare("ALTER TABLE mkt_agenda ADD COLUMN tmkt_venda_id TEXT").run();
  }
  db.prepare("CREATE INDEX IF NOT EXISTS ix_mkt_agenda_venda ON mkt_agenda(empresa_id, tmkt_venda_id)").run();
};

/* === Caminho técnico v2.0 (Postgres) ===
ALTER TABLE mkt_agenda ADD COLUMN IF NOT EXISTS tmkt_venda_id text REFERENCES tmkt_vendas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_mkt_agenda_venda ON mkt_agenda(empresa_id, tmkt_venda_id);
-- Da venda, listar as ações: SELECT * FROM mkt_agenda WHERE tmkt_venda_id = $1 ORDER BY data_ini;
-- O formulário de ação é o MESMO do Marketing; aberto do Trade ele chega com envolvido=fornecedor da
-- venda e tmkt_venda_id preenchido. Nada de tabela/fluxo novo: reusa mkt_agenda + agenda_evento + tarefas.
*/
