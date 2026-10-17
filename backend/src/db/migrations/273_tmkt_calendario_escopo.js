// 273_tmkt_calendario_escopo.js — escopo de produtos + sell-out no evento do calendário (Joe 2026-10-16):
// a ação pode vincular um ESCOPO do Alpha (fornecedor/laboratório/pessoa/caderno/grupo de preço/
// classificação/grupo de remarcação/produto) p/ acompanhar o SELL-OUT no período da ação.
// escopo_tipo + escopo_ref (JSON das refs escolhidas). Idempotente.
const db = require('../connection');
for (const c of ['escopo_tipo', 'escopo_ref']) {
  try { db.exec(`ALTER TABLE tmkt_calendario ADD COLUMN ${c} TEXT`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
console.log('✅ migration 273: tmkt_calendario.escopo_tipo + escopo_ref (escopo Alpha p/ sell-out da ação)');
