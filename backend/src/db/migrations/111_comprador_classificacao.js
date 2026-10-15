// 111_comprador_classificacao.js — vínculo do comprador passa a aceitar CLASSIFICAÇÃO (principal/individual),
// além do grupo de compra. Coluna 'tipo' distingue; grupocompra_id guarda o id (grupo ou classificação).
const db = require('../connection');

const cols = db.prepare("PRAGMA table_info(comprador_grupos)").all().map(c => c.name);
if (!cols.includes('tipo')) {
  db.exec(`ALTER TABLE comprador_grupos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'grupo'`); // 'grupo' | 'classificacao'
  console.log('✅ migration 111: coluna tipo adicionada em comprador_grupos');
} else {
  console.log('ℹ️ migration 111: coluna tipo já existe');
}
