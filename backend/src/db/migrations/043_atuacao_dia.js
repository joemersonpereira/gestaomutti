// 043 — atuação do dia (quem atuou como caixa/conferente, informado pelo gerente)
const db = require('../connection');
console.log('▶ Migração 043 — atuacao_dia');
db.exec(`CREATE TABLE IF NOT EXISTS atuacao_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  colaborador_id TEXT NOT NULL, funcao_atuada TEXT NOT NULL,
  UNIQUE(empresa_id, loja_id, data, colaborador_id, funcao_atuada)
);`);
console.log('✓ Migração 043 concluída');
