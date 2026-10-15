// 222_estagio_pagamento_aprovacoes.js — 3 fluxos no pagamento do estágio:
// RH valida o saldo da bolsa → Tesouraria valida descontos → Financeiro marca pago. Idempotente.
const db = require('../connection');
for (const col of [
  'rh_ok INTEGER DEFAULT 0', 'rh_em TEXT', 'rh_por TEXT',
  'tes_ok INTEGER DEFAULT 0', 'tes_em TEXT', 'tes_por TEXT',
  'fin_ok INTEGER DEFAULT 0', 'fin_em TEXT', 'fin_por TEXT',
]) {
  try { db.exec(`ALTER TABLE estagio_pagamento ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
}
console.log('✅ migration 222: estagio_pagamento aprovações RH/Tesouraria/Financeiro');
