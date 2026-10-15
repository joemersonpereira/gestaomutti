// 071 — Renomeia o indicador do vendedor "Cadastro completo" → "Pdv+" (label).
// A chave interna continua 'cadastro' (para não quebrar metas/lançamentos já gravados).
const db = require('../connection');
console.log('▶ Migração 071 — indicador "Pdv+" (era "Cadastro completo")');
const r = db.prepare("UPDATE config_indicadores SET label='Pdv+' WHERE indicador='cadastro'").run();
console.log(`✓ ${r.changes} registro(s) de indicador atualizados para "Pdv+".`);
console.log('✓ Migração 071 concluída.');
