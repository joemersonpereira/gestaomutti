// 231_drop_cartao_despesa.js — remove o antigo "Cartão-despesas" (substituído pelo módulo Orçamento,
// que lê a conta "Orçamento - <loja>" direto do ERP). Tabelas estavam órfãs e vazias. Idempotente.
const db = require('../connection');
db.exec(`DROP TABLE IF EXISTS contabil_despesa_lancamento`);
db.exec(`DROP TABLE IF EXISTS contabil_despesa_cartao`);
console.log('✅ migration 231: cartão-despesa antigo removido (tabelas dropadas)');
