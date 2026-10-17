// 288_tmkt_cobranca.js — unidade de cobrança (como é comercializado) na Área e no Espaço do Trade:
// mensal | insercao | diario | unidade | hora. Importante já ficar "amarrado" no cadastro. Idempotente.
const db = require('../connection');
const addCol = (tabela, coluna, ddl) => {
  try { db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
};
addCol('tmkt_areas', 'cobranca', 'cobranca TEXT');        // mensal|insercao|diario|unidade|hora
addCol('tmkt_espacos', 'cobranca', 'cobranca TEXT');
addCol('tmkt_espaco_loja', 'cobranca', 'cobranca TEXT');  // mesma parametrização no espaço por loja
console.log('✅ migration 288: cobranca em tmkt_areas + tmkt_espacos + tmkt_espaco_loja');
