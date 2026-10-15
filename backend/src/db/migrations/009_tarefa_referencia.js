// 009_tarefa_referencia.js — campo referencia_id na tarefa (ligar card do Kanban ao item, ex.: meta)
const db = require('../connection');
console.log('▶ Migração 009 — referencia_id na tarefa');
const cols = db.prepare(`PRAGMA table_info(tarefas)`).all().map(c => c.name);
if (!cols.includes('referencia_id')) { db.exec(`ALTER TABLE tarefas ADD COLUMN referencia_id TEXT`); console.log('  + referencia_id'); }
console.log('✓ Migração 009 concluída');
