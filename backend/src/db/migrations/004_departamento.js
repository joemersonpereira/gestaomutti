// 004_departamento.js — adiciona o campo "departamento" ao colaborador (tarefas por área)
const db = require('../connection');

console.log('▶ Migração 004 — departamento do colaborador');

const cols = db.prepare(`PRAGMA table_info(colaboradores)`).all();
if (!cols.some(c => c.name === 'departamento')) {
  db.exec(`ALTER TABLE colaboradores ADD COLUMN departamento TEXT`);
  console.log('  + coluna departamento adicionada');
} else {
  console.log('  = coluna departamento já existia');
}

console.log('✓ Migração 004 concluída');
