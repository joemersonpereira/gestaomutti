// 218_loja_dados_contrato.js — dados da loja para o contrato de estágio: apelido, razão social, CNPJ.
// (endereço e cidade já existem em lojas). Idempotente.
const db = require('../connection');
for (const col of ['apelido TEXT', 'razao_social TEXT', 'cnpj TEXT']) {
  try { db.exec(`ALTER TABLE lojas ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
}
console.log('✅ migration 218: lojas.apelido/razao_social/cnpj');
