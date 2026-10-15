// 055 — documento da advertência/suspensão (texto do termo preenchido pelo RH)
const db = require('../connection');
console.log('▶ Migração 055 — documento de advertência/suspensão');
try { db.exec(`ALTER TABLE ocorrencias ADD COLUMN documento TEXT`); } catch (e) { /* já existe */ }
console.log('✓ Migração 055 concluída');
