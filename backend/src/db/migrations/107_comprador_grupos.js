// 107 — Painel de Compras: vínculo comprador ↔ grupo de compra do ERP (grupocompra).
// Cada comprador fica responsável por 1+ grupos; os indicadores filtram por isso.
const db = require('../connection');
console.log('▶ Migração 107 — Comprador ↔ grupos de compra');
db.exec(`
CREATE TABLE IF NOT EXISTS comprador_grupos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  comprador_id TEXT NOT NULL,
  grupocompra_id INTEGER NOT NULL,     -- id do grupocompra no ERP
  grupo_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compgrp ON comprador_grupos(empresa_id, comprador_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compgrp_uni ON comprador_grupos(empresa_id, comprador_id, grupocompra_id);
`);
console.log('✓ Migração 107 concluída.');
