// 396 — Desenvolvimento de MATERIAL por ação de marketing, controlado por PRAZO DE ENTREGA + comprovação.
// Dor do Joe: material atrasa (ex.: Quarta do Bem-Estar precisa do material 2 dias antes das lojas).
// Cada ação (mkt_agenda) tem N materiais (post IG, rádio, monitor, card de oferta, tabloide, tráfego…),
// cada um com responsável, prazo, status e anexo de comprovação (evidência do envio/veiculação).
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS mkt_material (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    agenda_id TEXT NOT NULL,
    tipo TEXT,                       -- post_ig/story/radio/monitor/card_oferta/tabloide/banner/trafego/outro (livre)
    descricao TEXT,
    responsavel_id TEXT, responsavel_nome TEXT,
    prazo TEXT,                      -- data limite de entrega (AAAA-MM-DD). Padrão = data da ação − N dias.
    status TEXT DEFAULT 'a_fazer',   -- a_fazer | producao | entregue | veiculado | cancelado
    comprovacao TEXT, comprovacao_mime TEXT, comprovacao_nome TEXT,  -- evidência (base64)
    entregue_em TEXT, veiculado_em TEXT, obs TEXT,
    criado_por TEXT, criado_em TEXT DEFAULT (datetime('now'))
  )`).run();
  db.prepare('CREATE INDEX IF NOT EXISTS ix_mkt_material_agenda ON mkt_material(empresa_id, agenda_id)').run();
  // Config: quantos dias antes da ação o material deve estar pronto (padrão 2 — "2 dias antes das lojas").
  db.prepare(`CREATE TABLE IF NOT EXISTS mkt_material_config (empresa_id TEXT PRIMARY KEY, dias_antes INTEGER NOT NULL DEFAULT 2)`).run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS mkt_material (
  id text PRIMARY KEY, empresa_id text NOT NULL, agenda_id text NOT NULL,
  tipo text, descricao text, responsavel_id text, responsavel_nome text,
  prazo date, status text DEFAULT 'a_fazer',
  comprovacao text, comprovacao_mime text, comprovacao_nome text,
  entregue_em timestamptz, veiculado_em timestamptz, obs text,
  criado_por text, criado_em timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_mkt_material_agenda ON mkt_material(empresa_id, agenda_id);
CREATE TABLE IF NOT EXISTS mkt_material_config (empresa_id text PRIMARY KEY, dias_antes int NOT NULL DEFAULT 2);
-- "atrasado" = status NOT IN ('entregue','veiculado','cancelado') AND prazo < current_date.
-- Indicador do marketing: % materiais entregues até o prazo (prazo no mês) — direção maior.
*/
