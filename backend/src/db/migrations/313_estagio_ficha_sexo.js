// 313_estagio_ficha_sexo.js — guarda o SEXO do estagiário na ficha (pro seguro/relações à seguradora).
// Idempotente (ALTER protegido). O sexo também vem do ERP no export, mas aqui fica o que a seguradora
// pediu e o RH completou (quando o ERP não tem).
const db = require('../connection');
try { db.exec(`ALTER TABLE estagio_ficha ADD COLUMN sexo TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 313: estagio_ficha.sexo');
