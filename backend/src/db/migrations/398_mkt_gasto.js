// 398 — Gastos itemizados por ação de marketing: verba, TRÁFEGO PAGO, TEMPO DA EQUIPE, material, outro.
// O Joe quer validar o custo real da ação, incluindo o tempo da pessoa do marketing (horas × valor/hora).
// Substitui a "verba" simples pela composição detalhada. Custo da ação = soma dos gastos (alimenta o
// pilar Orçamento do Meu Setor do Marketing).
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS mkt_gasto (
    id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, agenda_id TEXT NOT NULL,
    tipo TEXT,                 -- verba | trafego | tempo_equipe | material | outro
    descricao TEXT,
    valor REAL DEFAULT 0,      -- R$ (p/ tempo_equipe = horas × valor_hora)
    horas REAL, valor_hora REAL,
    criado_por TEXT, criado_em TEXT DEFAULT (datetime('now'))
  )`).run();
  db.prepare('CREATE INDEX IF NOT EXISTS ix_mkt_gasto_agenda ON mkt_gasto(empresa_id, agenda_id)').run();
  // valor/hora padrão da equipe de marketing (p/ pré-preencher o custo de tempo).
  const cols = db.prepare("PRAGMA table_info(mkt_material_config)").all().map(c => c.name);
  if (!cols.includes('valor_hora_padrao')) db.prepare('ALTER TABLE mkt_material_config ADD COLUMN valor_hora_padrao REAL NOT NULL DEFAULT 0').run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS mkt_gasto (id text PRIMARY KEY, empresa_id text NOT NULL, agenda_id text NOT NULL,
  tipo text, descricao text, valor numeric DEFAULT 0, horas numeric, valor_hora numeric,
  criado_por text, criado_em timestamptz DEFAULT now());
ALTER TABLE mkt_material_config ADD COLUMN IF NOT EXISTS valor_hora_padrao numeric NOT NULL DEFAULT 0;
-- custo_acao (indicador Orçamento) = SUM(mkt_gasto.valor) das ações do período.
*/
