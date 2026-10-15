// 083 — Data de nascimento no cadastro do colaborador (para aniversariantes).
// A admissão (tempo de casa) já existe em colaboradores.admissao.
const db = require('../connection');
console.log('▶ Migração 083 — colaboradores.nascimento');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('nascimento')) {
  db.exec('ALTER TABLE colaboradores ADD COLUMN nascimento TEXT'); // AAAA-MM-DD
  console.log('  + colaboradores.nascimento');
} else { console.log('  = já existe'); }
console.log('✓ Migração 083 concluída. (rode erp-backfill-nascimento.js p/ puxar do ERP)');
