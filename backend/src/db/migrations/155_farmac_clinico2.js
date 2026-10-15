// 155 — Cuidado farmacêutico (fase clínica): resultado do serviço (aferição/glicemia), produto
// aplicado (lote/validade), vínculo com venda do ERP (COO), e dados de receita (CRM/data/anexo).
const db = require('../connection');
const cols = [
  ['resultado', 'TEXT'], ['produto', 'TEXT'], ['lote', 'TEXT'], ['validade', 'TEXT'],
  ['coo', 'TEXT'], ['crm', 'TEXT'], ['receita_data', 'TEXT'], ['receita_anexo', 'TEXT'],
];
for (const [c, t] of cols) { try { db.exec(`ALTER TABLE servicos_farmaceuticos ADD COLUMN ${c} ${t}`); } catch { /* já existe */ } }
console.log('✅ migration 155: campos clínicos (resultado, produto/lote/validade, coo, receita)');
