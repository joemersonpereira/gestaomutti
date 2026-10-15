// 110_compras_metas.js — metas editáveis por indicador do Painel de Compras (chave→valor).
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS compras_metas (
  empresa_id TEXT NOT NULL,
  chave TEXT NOT NULL,
  valor REAL,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, chave)
);
`);

console.log('✅ migration 110: compras_metas criada');
