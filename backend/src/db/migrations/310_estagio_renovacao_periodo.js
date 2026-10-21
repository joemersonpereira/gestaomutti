// 310_estagio_renovacao_periodo.js — a renovação passa a registrar o NOVO período do estágio
// (início e fim do período renovado). Ao aprovar, a vigência da ficha vira esse período novo,
// pra o Termo Aditivo sair com as datas certas. Idempotente (ALTER protegido).
const db = require('../connection');
const add = (ddl) => { try { db.exec(`ALTER TABLE estagio_renovacao ADD COLUMN ${ddl}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };
add('periodo_inicio TEXT'); // novo início da vigência (YYYY-MM-DD)
add('periodo_fim TEXT');    // novo fim da vigência (YYYY-MM-DD)
console.log('✅ migration 310: estagio_renovacao periodo_inicio/periodo_fim');
