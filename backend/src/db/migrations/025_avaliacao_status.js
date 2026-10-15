// 025 — avaliação de atendimento ruim (≤3) pode ser anulada pelo Diretor
const db = require('../connection');
console.log('▶ Migração 025 — status na avaliacoes_tarefa');
const cols = db.prepare(`PRAGMA table_info(avaliacoes_tarefa)`).all().map(c => c.name);
if (!cols.includes('status')) { db.exec(`ALTER TABLE avaliacoes_tarefa ADD COLUMN status TEXT DEFAULT 'ativa'`); console.log('  + status'); }
console.log('✓ Migração 025 concluída');
