// 329 — Flag "não ocupa" na negociação de trade (Joe 2026-11-10).
// Alguns trades são só pra COMPROVAÇÃO/foto ("fizemos a ação") e NÃO devem ocupar o espaço —
// a vaga continua disponível pra venda real. Marca a negociação como nao_ocupa=1: os espaços dela
// deixam de contar como "utilizados" na ocupação/capacidade. Idempotente (ADD COLUMN protegido).
const db = require('../connection');
console.log('▶ Migração 329 — flag "não ocupa" (trade só comprovação/foto)');
const cols = db.prepare('PRAGMA table_info(tmkt_vendas)').all().map(c => c.name);
if (!cols.includes('nao_ocupa')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN nao_ocupa INTEGER DEFAULT 0"); console.log('  + tmkt_vendas.nao_ocupa'); }
else console.log('  = nao_ocupa já existe');
console.log('✓ Migração 329 concluída');
