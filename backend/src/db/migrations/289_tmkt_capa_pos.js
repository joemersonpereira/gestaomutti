// 289_tmkt_capa_pos.js — enquadramento da capa do plano: guarda o ponto focal (background-position
// tipo "50% 20%") escolhido no ajustador, pra capa aparecer certa no card do portal. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_plano ADD COLUMN capa_pos TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 289: tmkt_plano.capa_pos');
