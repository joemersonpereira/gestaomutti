// 131 — espaço vendido guarda a loja (negociação pode vender espaços de várias lojas).
const db = require('../connection');
const add = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
add('tmkt_venda_espacos', 'loja_id', 'TEXT');
add('tmkt_venda_espacos', 'loja_nome', 'TEXT');
console.log('✅ migration 131: tmkt_venda_espacos.loja_id/loja_nome');
