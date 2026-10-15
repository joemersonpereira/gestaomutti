// 003_pct_aceitavel.js — adiciona o campo "% aceitável" aos indicadores (motor auto-balanceado)
const db = require('../connection');

console.log('▶ Migração 003 — % aceitável dos indicadores');

const cols = db.prepare(`PRAGMA table_info(config_indicadores)`).all();
if (!cols.some(c => c.name === 'pct_aceitavel')) {
  db.exec(`ALTER TABLE config_indicadores ADD COLUMN pct_aceitavel INTEGER DEFAULT 80`);
  console.log('  + coluna pct_aceitavel adicionada');
} else {
  console.log('  = coluna pct_aceitavel já existia');
}

console.log('✓ Migração 003 concluída');
