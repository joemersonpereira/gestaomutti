// 232_loja_escritorio.js — cadastra o ESCRITÓRIO (unidadenegocio id=1 no Alpha) como "loja" no app,
// pra aparecer nos seletores e trazer as contas a pagar dele (folha, impostos, etc.) na Contabilidade.
// Idempotente (INSERT OR IGNORE).
const db = require('../connection');
db.prepare(`INSERT OR IGNORE INTO lojas (id, empresa_id, nome, cidade, ativa, erp_unidadenegocio_id, tem_farmacia_popular, apelido)
  VALUES ('loja-escritorio','empresa-mutti-001','Escritório','Alagoinhas-BA',1,1,0,'ESCRITÓRIO')`).run();
console.log('✅ migration 232: loja Escritório (unidade 1) cadastrada');
