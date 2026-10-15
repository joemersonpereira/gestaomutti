// 127_afastamento_status.js — status (aprovação) e anexo em afastamentos (p/ atestado do colaborador).
const db = require('../connection');
const add = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
add('afastamentos', 'status', "TEXT DEFAULT 'aprovado'"); // aprovado (RH) | pendente (atestado do colaborador) | rejeitado
add('afastamentos', 'anexo_url', 'TEXT');
add('afastamentos', 'tangerino_ok', 'INTEGER DEFAULT 0');
console.log('✅ migration 127: afastamentos.status/anexo_url/tangerino_ok');
