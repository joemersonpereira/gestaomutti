// 109_compras_config.js — configurações do Painel de Compras (meta de CMV editável, etc).
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS compras_config (
  empresa_id TEXT PRIMARY KEY,
  cmv_meta REAL,                 -- meta de CMV% (editável); null = usa o CMV real do ERP
  dias_transf_aceitavel INTEGER DEFAULT 7,
  crescimento_meta REAL,         -- crescimento % anual desejado (fallback quando não há histórico)
  atualizado_em TEXT
);
`);

console.log('✅ migration 109: compras_config criada');
