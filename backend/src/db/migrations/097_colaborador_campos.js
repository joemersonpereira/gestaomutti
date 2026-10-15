// 097 — Campos extras do colaborador: apelido (como quer ser chamado), contato de
// emergência (nome + telefone) e foto (usada como avatar na Comunidade).
const db = require('../connection');
console.log('▶ Migração 097 — Campos extras do colaborador');
const addCol = (nome, ddl) => {
  const cols = db.prepare(`PRAGMA table_info(colaboradores)`).all().map(c => c.name);
  if (!cols.includes(nome)) { db.exec(`ALTER TABLE colaboradores ADD COLUMN ${ddl}`); console.log('  + colaboradores.' + nome); }
};
addCol('apelido', 'apelido TEXT');
addCol('contato_emergencia_nome', 'contato_emergencia_nome TEXT');
addCol('contato_emergencia_telefone', 'contato_emergencia_telefone TEXT');
addCol('foto', 'foto TEXT'); // data URL (base64) — avatar na Comunidade
console.log('✓ Migração 097 concluída.');
