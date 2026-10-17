// 276_conc_tratativa_remanejo.js — remanejamento de loja na Conciliação de Cartões (Joe 2026-10-17):
// quando a maquininha fica numa loja mas a venda foi lançada em outra, a transação "Operadora pagou,
// ERP não tem" (SO_OPERADORA) é casada manualmente com a "ERP tem, operadora não pagou" (SO_ERP) da
// outra loja. ref_par guarda o vínculo das duas pontas (pra rastrear e reabrir junto).
const db = require('../connection');
try { db.exec(`ALTER TABLE conc_tratativa ADD COLUMN ref_par TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 276: conc_tratativa.ref_par (remanejo de loja / conciliação cruzada)');
