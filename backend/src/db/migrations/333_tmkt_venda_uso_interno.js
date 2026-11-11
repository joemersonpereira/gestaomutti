// 333 — "Uso interno" do espaço de trade (Joe 2026-11-10).
// Às vezes um espaço é usado pela PRÓPRIA farmácia (campanha interna). Ele fica OCUPADO (indisponível
// p/ vender), mas NÃO gera receita — o valor vira "deixado de ganhar" (oportunidade perdida de venda a
// fornecedor). Flag uso_interno=1 na negociação. Diferente de nao_ocupa (esse nem ocupa). Idempotente.
const db = require('../connection');
console.log('▶ Migração 333 — flag "uso interno" (deixado de ganhar)');
const cols = db.prepare('PRAGMA table_info(tmkt_vendas)').all().map(c => c.name);
if (!cols.includes('uso_interno')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN uso_interno INTEGER DEFAULT 0"); console.log('  + tmkt_vendas.uso_interno'); }
else console.log('  = uso_interno já existe');
console.log('✓ Migração 333 concluída');
