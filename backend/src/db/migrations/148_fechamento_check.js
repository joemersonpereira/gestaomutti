// 148 — Checklist de fechamento da Controladoria: cada item por competência vira uma validação
// com CIÊNCIA (quem validou + quando) e pode gerar uma tarefa de análise no painel de Tarefas.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS fechamento_check (
  empresa_id TEXT NOT NULL,
  competencia TEXT NOT NULL,
  item_key TEXT NOT NULL,
  tarefa_id TEXT,
  validado_por TEXT,
  validado_em TEXT,
  PRIMARY KEY (empresa_id, competencia, item_key)
);
`);
console.log('✅ migration 148: fechamento_check');
