// 051 — controle de escalonamento da ciência da escala (1 dia antes)
const db = require('../connection');
console.log('▶ Migração 051 — feriado_escala_equipe.escalonado');
try { db.exec(`ALTER TABLE feriado_escala_equipe ADD COLUMN escalonado INTEGER DEFAULT 0`); } catch (e) { /* já existe */ }
console.log('✓ Migração 051 concluída');
