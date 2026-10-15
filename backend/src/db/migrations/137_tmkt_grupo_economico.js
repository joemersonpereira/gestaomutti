// 137 — Grupos econômicos: agrupa fornecedores (ex.: mesma matriz/CNPJ raiz) p/ visão consolidada.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS tmkt_grupos_economicos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
  observacao TEXT, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tmkt_grupo_fornecedores (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, grupo_id TEXT NOT NULL,
  fornecedor_id TEXT, fornecedor_nome TEXT, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tmkt_gforn ON tmkt_grupo_fornecedores(empresa_id, grupo_id);
`);
console.log('✅ migration 137: tmkt_grupos_economicos + tmkt_grupo_fornecedores');
