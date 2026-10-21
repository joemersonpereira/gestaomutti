// 308_estagio_horario.js — horário e carga horária do estágio na ficha (pra alimentar o contrato).
// O contrato pedia horas/horário mas a ficha não capturava. Idempotente.
const db = require('../connection');
const addCol = (ddl) => { try { db.exec(`ALTER TABLE estagio_ficha ADD COLUMN ${ddl}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };
addCol("horario TEXT");        // ex.: "13h às 18h, de segunda a sábado"
addCol("horas_dia TEXT");      // ex.: "05 (cinco)"
addCol("horas_semana TEXT");   // ex.: "30 (trinta)"
addCol("supervisor_id TEXT");  // colaborador que supervisiona o estágio (CLÁUSULA 4ª)
console.log('✅ migration 308: estagio_ficha horario/horas_dia/horas_semana/supervisor_id');
