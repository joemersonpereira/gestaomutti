// 133 — DFC (fluxo de caixa, regime caixa) importado de planilha, por loja/mês.
// Fonte: exports "exported_table*.xls" do sistema do Joe (plano de contas caixa de janeiro/2026).
// O ERP só tem venda desde 29/01, então estes meses (ex.: janeiro) vêm da planilha; guardamos a hierarquia.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS dfc_importado (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  ordem INTEGER NOT NULL,     -- ordem da linha na planilha (preserva a hierarquia visual)
  nivel INTEGER NOT NULL,     -- 0 = topo (SALDO/RECEITAS/DESPESAS), 1 = grupo, 2 = conta (folha)
  conta TEXT NOT NULL,        -- nome do plano de contas (sem o sufixo (+)/(-))
  sinal TEXT,                 -- '+', '-' ou '' (topo)
  valor REAL DEFAULT 0,       -- em REAIS (já corrigido o formato da planilha)
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dfc_imp_uq ON dfc_importado(empresa_id, loja_id, ano, mes, ordem);
CREATE INDEX IF NOT EXISTS idx_dfc_imp_periodo ON dfc_importado(empresa_id, ano, mes);
`);
console.log('✅ migration 133: dfc_importado');
