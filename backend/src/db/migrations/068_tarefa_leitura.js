// 068 — leitura de comentários por usuário (para o alerta de novos comentários).
const db = require('../connection');
console.log('▶ Migração 068 — leitura de comentários');
db.exec(`CREATE TABLE IF NOT EXISTS tarefa_leitura (
  tarefa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, ultima_leitura TEXT,
  PRIMARY KEY (tarefa_id, colaborador_id)
);`);
console.log('✓ Migracao 068 concluida');
