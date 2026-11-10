// 317 — Marcação "é perfumista" no cadastro do colaborador.
// Igual ao flag "conferente": é uma MARCAÇÃO do colaborador, não a função. Só o perfumista
// recebe a premiação sobre a venda de PERFUMARIA (os demais vendedores não entram nessa base).
// Idempotente (checa a coluna antes do ALTER).
const db = require('../connection');
console.log('▶ Migração 317 — flag "perfumista" no colaborador');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('perfumista')) {
  db.exec('ALTER TABLE colaboradores ADD COLUMN perfumista INTEGER DEFAULT 0');
  console.log('  + colaboradores.perfumista (0/1)');
} else {
  console.log('  = colaboradores.perfumista já existe');
}
console.log('✓ Migração 317 concluída.');
