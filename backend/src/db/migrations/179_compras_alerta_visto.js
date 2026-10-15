// 179_compras_alerta_visto.js — memória do que já foi alertado, p/ a tarefa diária de compras
// NÃO repetir os mesmos itens todo dia. Cada produto é alertado uma vez por tipo de alerta.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS compras_alerta_visto (
  empresa_id TEXT,
  tipo       TEXT,   -- 'semvenda' | 'itemnovo'
  ref        TEXT,   -- produtoid
  visto_em   TEXT,
  PRIMARY KEY (empresa_id, tipo, ref)
)`);
console.log('✅ migration 179: compras_alerta_visto criada');
