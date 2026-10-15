// 116_formulas_controle.js — controle de entrega das fórmulas manipuladas (camada local sobre o ERP).
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS formulas_controle (
  empresa_id TEXT NOT NULL,
  crediario_id TEXT NOT NULL,       -- crediarioreceber.id do ERP
  loja_id TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando', -- aguardando | chegou | avisado | entregue | cancelado
  responsavel_id TEXT,
  responsavel_nome TEXT,
  obs TEXT,
  tarefa_id TEXT,
  atualizado_por TEXT,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, crediario_id)
);
`);
console.log('✅ migration 116: formulas_controle criada');
