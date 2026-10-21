// 307_estagio_assinante.js — vincula na ficha quem assina pela empresa (sócio ou funcionário),
// pra ficar guardado por estagiário e sair no contrato. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE estagio_ficha ADD COLUMN assinante_empresa_id TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 307: estagio_ficha.assinante_empresa_id');
