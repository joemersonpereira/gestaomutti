// 065 — motivo declara se exige termo (advertência/suspensão) + tipo; ocorrência carrega o flag.
const db = require('../connection');
console.log('▶ Migração 065 — exige_termo em motivos e ocorrências');

for (const [tab, cols] of [
  ['ocorrencia_motivos', [['exige_termo', 'INTEGER DEFAULT 0'], ['termo_tipo', 'TEXT']]],
  ['ocorrencias', [['exige_termo', 'INTEGER DEFAULT 0'], ['termo_tipo', 'TEXT']]],
]) {
  for (const [col, tipo] of cols) {
    try { db.exec(`ALTER TABLE ${tab} ADD COLUMN ${col} ${tipo}`); console.log(`  ${tab}.${col} ok`); }
    catch (e) { console.log(`  ${tab}.${col} já existe`); }
  }
}
// Marca os motivos de advertência/suspensão existentes
try {
  db.prepare(`UPDATE ocorrencia_motivos SET exige_termo=1, termo_tipo='suspensao' WHERE motivo LIKE 'Suspens%'`).run();
  db.prepare(`UPDATE ocorrencia_motivos SET exige_termo=1, termo_tipo='advertencia' WHERE motivo LIKE 'Advert%'`).run();
} catch (e) {}
console.log('✓ Migracao 065 concluida');
