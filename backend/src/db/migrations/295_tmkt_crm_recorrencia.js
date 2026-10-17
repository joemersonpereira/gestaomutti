// 295_tmkt_crm_recorrencia.js — recorrência p/ ESPAÇO no CRM: avisar a cada N dias quando houver vaga livre.
// Idempotente.
const db = require('../connection');
const addCol = (t, c, ddl) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };
addCol('tmkt_crm_outreach', 'intervalo_dias', 'intervalo_dias INTEGER DEFAULT 15'); // p/ espaço: a cada N dias
addCol('tmkt_crm_outreach', 'so_com_estoque', 'so_com_estoque INTEGER DEFAULT 1');  // p/ espaço: só se houver vaga livre
console.log('✅ migration 295: tmkt_crm_outreach.intervalo_dias + so_com_estoque');
