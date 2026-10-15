// 219_colaborador_socio.js — flag "é sócio" no colaborador (quem assina contratos de estágio). Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE colaboradores ADD COLUMN is_socio INTEGER DEFAULT 0`); } catch (e) { /* já existe */ }
console.log('✅ migration 219: colaboradores.is_socio');
