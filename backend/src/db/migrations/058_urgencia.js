// 058 — urgência com penalização: quem marcou urgente e se foi confirmada
const db = require('../connection');
console.log('▶ Migração 058 — urgência (urgente_por / urgente_confirmado)');
for (const col of [`urgente_por TEXT`, `urgente_confirmado TEXT`]) {
  try { db.exec(`ALTER TABLE tarefas ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
}
console.log('✓ Migração 058 concluída');
