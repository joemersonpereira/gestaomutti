// 189_compras_metas_comprador.js — metas do Painel de Compras POR COMPRADOR (override da meta geral).
// Resolução: meta do comprador → meta geral (compras_metas) → valor sugerido (default no código).
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS compras_metas_comprador (
  empresa_id   TEXT    NOT NULL,
  comprador_id INTEGER NOT NULL,     -- pessoa/colaborador (comprador) do ERP
  chave        TEXT    NOT NULL,     -- ex.: ruptura_max, cobertura_min, conversao_novos_meta…
  valor        REAL,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, comprador_id, chave)
)`);
console.log('✅ migration 189: compras_metas_comprador criada');
