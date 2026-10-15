// 093 — Extrato de pontos (#EuSouGrupoMutti). Ledger auditável: cada pontuação ganha
// é uma linha (aniversário, tempo de casa, treinamento, super meta, caixa, post social…).
// Saldo = SUM(lancamentos) − SUM(resgates não cancelados). Substitui o cálculo on-the-fly.
const db = require('../connection');
console.log('▶ Migração 093 — Extrato de pontos');
db.exec(`
CREATE TABLE IF NOT EXISTS pontos_lancamentos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  colaborador_nome TEXT,
  loja_id TEXT,
  tipo TEXT NOT NULL,            -- niver_pessoal | niver_empresa | treinamento | post_interno |
                                 -- post_social | repost | super_meta | produtividade | caixa | performance | manual
  descricao TEXT,
  pontos INTEGER NOT NULL,
  competencia TEXT,             -- 'YYYY-MM'
  origem TEXT,                  -- automatico | manual
  ref TEXT,                     -- chave de deduplicação (1 por evento)
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pl_ref ON pontos_lancamentos(empresa_id, ref);
CREATE INDEX IF NOT EXISTS idx_pl_colab ON pontos_lancamentos(empresa_id, colaborador_id);
CREATE INDEX IF NOT EXISTS idx_pl_comp ON pontos_lancamentos(empresa_id, competencia);
`);
console.log('✓ Migração 093 concluída.');
