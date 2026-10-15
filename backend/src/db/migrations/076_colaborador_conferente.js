// 076 — Marcação "é conferente" no cadastro do colaborador.
// Ser conferente é um FLAG do colaborador (não a função): a maioria dos conferentes
// também é vendedor. Quem tem conferente=1 entra na avaliação/premiação de conferente
// (checklist + comissão sobre as vendas dele), além da premiação da própria função.
const db = require('../connection');
console.log('▶ Migração 076 — flag "conferente" no colaborador');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('conferente')) {
  db.exec('ALTER TABLE colaboradores ADD COLUMN conferente INTEGER DEFAULT 0');
  console.log('  + colaboradores.conferente (0/1)');
} else {
  console.log('  = colaboradores.conferente já existe');
}
// Marca como conferente quem já tem vínculo de usuário do ERP de recebimento
// (veio do seed erp-seed-conferentes) e também quem é func-conferente dedicado.
const upd = db.prepare(`UPDATE colaboradores SET conferente=1
  WHERE conferente=0 AND (erp_usuario_id IS NOT NULL OR funcao_id='func-conferente')`);
const r = upd.run();
console.log(`  ~ ${r.changes} colaborador(es) marcados como conferente (vínculo ERP ou func-conferente).`);
console.log('✓ Migração 076 concluída.');
