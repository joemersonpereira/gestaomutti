// 005_premiacao_campanha.js — campos de Campanha/Premiação na tabela metas
const db = require('../connection');

console.log('▶ Migração 005 — Premiação/Campanha');

const cols = db.prepare(`PRAGMA table_info(metas)`).all().map(c => c.name);
const add = (nome, ddl) => { if (!cols.includes(nome)) { db.exec(`ALTER TABLE metas ADD COLUMN ${ddl}`); console.log('  + ' + nome); } };
add('nome_campanha', 'nome_campanha TEXT');
add('responsavel_id', 'responsavel_id TEXT');
add('status_aceite', "status_aceite TEXT DEFAULT 'pendente'");
add('reanalisado', 'reanalisado INTEGER DEFAULT 0');

console.log('✓ Migração 005 concluída');
