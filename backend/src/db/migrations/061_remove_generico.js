// 061 — remove indicador obsoleto "Genérico / Similar" do pilar Resultado
const db = require('../connection');
console.log('▶ Migração 061 — remove indicador Genérico/Similar');
try {
  const r = db.prepare(`DELETE FROM indicadores_def WHERE id='generico' OR lower(nome) LIKE '%genérico%' OR lower(nome) LIKE '%generico%'`).run();
  db.prepare(`DELETE FROM indicador_nota_manual WHERE indicador_id='generico'`).run();
  console.log(`✓ ${r.changes} indicador(es) removido(s)`);
} catch (e) { console.log('  (nada a remover)', e.message); }
