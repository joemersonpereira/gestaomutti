// 072 — Cadernos de oferta que alimentam o indicador "Campanhas".
// O gestor seleciona quais cadernos de oferta do ERP contam; o realizado do
// indicador Campanhas por vendedor = unidades vendidas dos itens desses cadernos.
const db = require('../connection');
console.log('▶ Migração 072 — cadernos de oferta do indicador Campanhas');
db.exec(`CREATE TABLE IF NOT EXISTS campanha_cadernos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  caderno_id TEXT NOT NULL,   -- id do cadernooferta no ERP (bigint como texto)
  nome TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, caderno_id)
);`);
console.log('✓ Migração 072 concluída.');
