// 306_estagio_doc_status.js — controle de assinatura do contrato por estagiário: acompanha onde o
// documento está (pendente → enviado pra loja → com o estagiário → assinado/devolvido), com data e
// observação. Pedido do Joe: às vezes manda o contrato e demora a voltar — precisa acompanhar.
// Idempotente.
const db = require('../connection');
const addCol = (t, ddl) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };
addCol('estagio_ficha', "doc_status TEXT DEFAULT 'pendente'"); // pendente|enviado_loja|com_estagiario|assinado
addCol('estagio_ficha', 'doc_status_em TEXT');
addCol('estagio_ficha', 'doc_obs TEXT');
console.log('✅ migration 306: estagio_ficha doc_status/doc_status_em/doc_obs');
