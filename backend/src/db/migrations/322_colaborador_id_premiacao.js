// 322 — Campo "ID Premiação" no colaborador.
// É o número de identificação do colaborador no cartão de premiação (Pay X Virtual com PIX) que a
// operadora exige na planilha de CARREGAMENTO (coluna "ID", ex. 000092243). Guardado por colaborador
// para o export da carga sair preenchido. Texto (preserva zeros à esquerda). Idempotente.
const db = require('../connection');
console.log('▶ Migração 322 — campo "id_premiacao" no colaborador');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('id_premiacao')) {
  db.exec("ALTER TABLE colaboradores ADD COLUMN id_premiacao TEXT DEFAULT ''");
  console.log('  + colaboradores.id_premiacao (texto)');
} else {
  console.log('  = colaboradores.id_premiacao já existe');
}
console.log('✓ Migração 322 concluída.');
