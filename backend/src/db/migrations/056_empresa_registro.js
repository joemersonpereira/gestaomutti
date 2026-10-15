// 056 — empresa de registro e de atuação do colaborador (terceirizados)
const db = require('../connection');
console.log('▶ Migração 056 — empresa de registro/atuação');
for (const col of [`empresa_registro TEXT`, `empresa_atuacao TEXT`]) {
  try { db.exec(`ALTER TABLE colaboradores ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
}
console.log('✓ Migração 056 concluída');
