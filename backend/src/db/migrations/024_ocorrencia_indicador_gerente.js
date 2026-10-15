// 024 — ocorrência liga a 2 indicadores: colaborador (indicador_alvo) e gerente (indicador_gerente)
const db = require('../connection');
console.log('▶ Migração 024 — indicador_gerente nas ocorrências');
for (const [tab, col] of [['ocorrencia_motivos', 'indicador_gerente'], ['ocorrencias', 'indicador_gerente']]) {
  const cols = db.prepare(`PRAGMA table_info(${tab})`).all().map(c => c.name);
  if (!cols.includes(col)) { db.exec(`ALTER TABLE ${tab} ADD COLUMN ${col} TEXT`); console.log(`  + ${tab}.${col}`); }
}
console.log('✓ Migração 024 concluída');
