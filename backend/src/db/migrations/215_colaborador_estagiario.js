// 215_colaborador_estagiario.js — flag "é estagiário" no colaborador + vínculo com a ficha de estágio. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE colaboradores ADD COLUMN is_estagiario INTEGER DEFAULT 0`); } catch (e) { /* já existe */ }
try { db.exec(`ALTER TABLE estagio_ficha ADD COLUMN colaborador_id TEXT`); } catch (e) { /* já existe */ }
console.log('✅ migration 215: colaboradores.is_estagiario + estagio_ficha.colaborador_id');
