// 095 — Benefícios: vínculo com brinde do estoque (Meu Mercado) e com a folga gerada
// (day off de aniversário vira folga em "Minhas Folgas").
const db = require('../connection');
console.log('▶ Migração 095 — Benefícios: brinde do estoque + folga');
const addCol = (tabela, nome, ddl) => {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
  if (!cols.includes(nome)) { db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`); console.log(`  + ${tabela}.${nome}`); }
};
addCol('beneficios', 'produto_id', 'produto_id TEXT');        // brinde escolhido do estoque
addCol('beneficios', 'variacao_id', 'variacao_id TEXT');
addCol('beneficios', 'produto_nome', 'produto_nome TEXT');
addCol('beneficios', 'folga_id', 'folga_id TEXT');            // folga gerada p/ day off
console.log('✓ Migração 095 concluída.');
