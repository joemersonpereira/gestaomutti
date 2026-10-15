// 029 — tabela de configurações (chave/valor), ex.: tempo mínimo de fechamento do checklist
const db = require('../connection');
console.log('▶ Migração 029 — configuracoes');
db.exec(`CREATE TABLE IF NOT EXISTS configuracoes (
  empresa_id TEXT NOT NULL, chave TEXT NOT NULL, valor TEXT, PRIMARY KEY (empresa_id, chave)
);`);
console.log('✓ Migração 029 concluída');
