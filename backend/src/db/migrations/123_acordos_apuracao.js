// 123_acordos_apuracao.js — condições do acordo: alvo (buscado no ERP), apuração/metas e exceções por EAN.
const db = require('../connection');
const add = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };

add('acordo_condicoes', 'alvo_id', 'TEXT');      // id do fornecedor/fabricante/classificação escolhido no ERP
add('acordo_condicoes', 'alvo_nome', 'TEXT');    // nome do alvo (exibição)
add('acordo_condicoes', 'periodo', 'TEXT');      // apuração: global | mensal
add('acordo_condicoes', 'meta_global', 'REAL');  // meta total de compras no período (ex.: 500.000)
add('acordo_condicoes', 'meta_mensal', 'REAL');  // meta de compra por mês (ex.: 30.000)
add('acordo_condicoes', 'periodo_ini', 'TEXT');  // início da apuração
add('acordo_condicoes', 'periodo_fim', 'TEXT');  // fim da apuração
add('acordo_condicoes', 'excecoes', 'TEXT');     // JSON: lista de EANs excluídos ("exceto")

console.log('✅ migration 123: acordo_condicoes com alvo ERP, apuração/metas e exceções');
