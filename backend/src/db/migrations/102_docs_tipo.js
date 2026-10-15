// 102 — Tipo do documento anexado (CPF, RG, certidão de casamento, certidão dos filhos…)
// em colaborador_docs e autocadastro_docs, para a ficha completa do colaborador.
const db = require('../connection');
console.log('▶ Migração 102 — Tipo de documento');
const addCol = (tabela, nome, ddl) => {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
  if (!cols.includes(nome)) { db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`); console.log(`  + ${tabela}.${nome}`); }
};
addCol('colaborador_docs', 'tipo', 'tipo TEXT');
addCol('autocadastro_docs', 'tipo', 'tipo TEXT');
console.log('✓ Migração 102 concluída.');
