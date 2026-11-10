// 320 — Fechamento mensal de PREMIAÇÃO (remontagem, Joe 2026-11-10).
// Three tables: as BASES importadas dos relatórios do ERP (Premiação/Perfumaria/Kits/Unidades/
// Vitaminas), as DECISÕES por colaborador (% 3/4/5, gestão, descontos) e a CONFIG de valores
// (R$/un de unidades, faixas de kit do caixa). Idempotente (CREATE IF NOT EXISTS).
const db = require('../connection');
console.log('▶ Migração 320 — tabelas do Fechamento de Premiação');

db.exec(`
CREATE TABLE IF NOT EXISTS premiacao_base (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  tipo TEXT NOT NULL,            -- premiacao | perfumaria | kits | unidades | vitaminas
  nome_norm TEXT NOT NULL,      -- nome normalizado (o relatório trunca nomes longos ~30 chars)
  nome_original TEXT,
  valor REAL DEFAULT 0,          -- base: R$ (premiacao/perfumaria) ou quantidade (kits/unidades/vitaminas)
  pct REAL,                      -- só perfumaria (1 ou 1,5)
  importado_em TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_prem_base ON premiacao_base(empresa_id, mes, ano, tipo, nome_norm);

CREATE TABLE IF NOT EXISTS premiacao_item (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  colaborador_id TEXT NOT NULL,
  premiacao_pct REAL,            -- % escolhido sobre a Venda (3/4/5)
  meta_bateu INTEGER DEFAULT 0,  -- gestão: bateu a meta?
  gestao_valor REAL DEFAULT 0,   -- gestão: valor cheio (bateu) ou digitado (não bateu)
  dif_caixa REAL DEFAULT 0,      -- desconto: diferença de caixa
  outros_desc REAL DEFAULT 0,    -- desconto: outros
  obs TEXT,
  atualizado_em TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_prem_item ON premiacao_item(empresa_id, mes, ano, colaborador_id);

CREATE TABLE IF NOT EXISTS premiacao_cfg (
  empresa_id TEXT NOT NULL,
  chave TEXT NOT NULL,           -- uv_valor_un | kit_min | kit_alto | kit_baixo
  valor REAL DEFAULT 0,
  PRIMARY KEY (empresa_id, chave)
);
`);
console.log('✓ Migração 320 concluída (premiacao_base, premiacao_item, premiacao_cfg).');
