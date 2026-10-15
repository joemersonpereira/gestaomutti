// 130 — configuração dos planos de contas para o DLP/DFC gerencial (variável/fixa/não-operacional).
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS dre_config (
  empresa_id TEXT NOT NULL, grupo TEXT NOT NULL,   -- grupo = plano de contas nível 2 (ex.: "2.03 - DESPESAS COM PESSOAL (-)")
  classe TEXT NOT NULL,                            -- variavel | fixa | despesa_nao_op | receita_nao_op | ignorar
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, grupo)
);
`);
console.log('✅ migration 130: dre_config');
