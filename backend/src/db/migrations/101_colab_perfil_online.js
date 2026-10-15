// 101 — Perfil social do colaborador (auto-descrição p/ a Comunidade) + presença online.
const db = require('../connection');
console.log('▶ Migração 101 — Perfil social + presença online');
const addCol = (nome, ddl) => {
  const cols = db.prepare(`PRAGMA table_info(colaboradores)`).all().map(c => c.name);
  if (!cols.includes(nome)) { db.exec(`ALTER TABLE colaboradores ADD COLUMN ${ddl}`); console.log('  + colaboradores.' + nome); }
};
addCol('bio', 'bio TEXT');                          // "sobre mim" livre
addCol('presente_favorito', 'presente_favorito TEXT');
addCol('cores_favoritas', 'cores_favoritas TEXT');
addCol('estilo_musical', 'estilo_musical TEXT');
addCol('hobbies', 'hobbies TEXT');
addCol('time_coracao', 'time_coracao TEXT');
addCol('last_seen', 'last_seen TEXT');              // presença online (última atividade)
console.log('✓ Migração 101 concluída.');
