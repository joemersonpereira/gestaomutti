// 103 — Data de início na loja (o 1º dia efetivo do colaborador na loja, informado pelo
// RH; pode diferir da admissão). No dia, o Mural gera um post de boas-vindas.
const db = require('../connection');
console.log('▶ Migração 103 — Data de início na loja');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('inicio_loja')) { db.exec('ALTER TABLE colaboradores ADD COLUMN inicio_loja TEXT'); console.log('  + colaboradores.inicio_loja'); }
console.log('✓ Migração 103 concluída.');
