// 132 — Tesouraria: controle de cobrança das quebras de caixa (sobra/falta) e config do setor.
// A quebra em si vem do ERP (quebracaixa); aqui o Mutti só rastreia a DECISÃO de cobrança por quebra.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS caixa_cobrancas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  quebra_erp_id TEXT NOT NULL,          -- quebracaixa.id no ERP (idempotência)
  loja_id TEXT,
  operador_erp_id TEXT,                  -- usuario.id no ERP (responsável pela quebra)
  operador_nome TEXT,
  colaborador_id TEXT,                   -- vínculo com colaborador do Mutti (se casar por nome/login)
  data TEXT,                             -- data da quebra (yyyy-MM-dd)
  valor REAL,                            -- negativo = falta, positivo = sobra
  tipo TEXT,                             -- 'falta' | 'sobra'
  status TEXT DEFAULT 'pendente',        -- pendente | cobrado | perdoado | pontuado
  valor_cobrado REAL DEFAULT 0,
  observacao TEXT,
  competencia TEXT,                      -- yyyy-MM
  criado_em TEXT DEFAULT (datetime('now')),
  resolvido_em TEXT,
  resolvido_por TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_caixa_cobr_quebra ON caixa_cobrancas(empresa_id, quebra_erp_id);
CREATE INDEX IF NOT EXISTS idx_caixa_cobr_status ON caixa_cobrancas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_caixa_cobr_oper ON caixa_cobrancas(empresa_id, operador_erp_id);

CREATE TABLE IF NOT EXISTS tesouraria_config (
  empresa_id TEXT NOT NULL,
  chave TEXT NOT NULL,
  valor TEXT,
  PRIMARY KEY (empresa_id, chave)
);
`);
console.log('✅ migration 132: caixa_cobrancas + tesouraria_config');
