// 274_tmkt_calendario_slogan.js — foto do slogan/arte da ação no calendário (Joe 2026-10-16):
// cada ação pode ter a arte/slogan (imagem) que aparece no topo quando o fornecedor abre o mês.
const db = require('../connection');
for (const c of [['slogan_foto', 'TEXT'], ['slogan_mime', 'TEXT']]) {
  try { db.exec(`ALTER TABLE tmkt_calendario ADD COLUMN ${c[0]} ${c[1]}`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
console.log('✅ migration 274: tmkt_calendario.slogan_foto (+mime)');
