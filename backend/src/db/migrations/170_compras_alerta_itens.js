// 170_compras_alerta_itens.js — guarda a lista COMPLETA de itens de cada alerta de compra
// (itens novos, comprado sem venda…) com nome + EAN, p/ a tarefa expandir e mostrar tudo.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS compras_alerta_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id TEXT NOT NULL,
  referencia_id TEXT NOT NULL,   -- ex.: itensnovos:2026-07-15 / semvenda:2026-07-15
  descricao TEXT,
  ean TEXT,
  extra TEXT,                     -- info opcional (fabricante, data…)
  ordem INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cai_ref ON compras_alerta_itens(empresa_id, referencia_id);
`);

console.log('✅ migration 170: compras_alerta_itens criada');
