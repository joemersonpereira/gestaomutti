// 016_avaliacao_atendimento.js — avaliação mútua de atendimento nas tarefas
const db = require('../connection');
console.log('▶ Migração 016 — avaliação de atendimento');
const cols = db.prepare(`PRAGMA table_info(avaliacoes_tarefa)`).all().map(c => c.name);
if (!cols.includes('avaliado_id')) { db.exec(`ALTER TABLE avaliacoes_tarefa ADD COLUMN avaliado_id TEXT`); console.log('  + avaliado_id'); }
// SQLite não altera CHECK facilmente; o setup.js recria com o tipo 'atendimento'. Em bases antigas, o tipo é validado na aplicação.
console.log('✓ Migração 016 concluída');
