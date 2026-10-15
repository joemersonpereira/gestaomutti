// Regra de premiação por função em 4 faixas por %, com % aceitável configurável.
// 100% do prêmio só com 100 no indicador; depois 3 faixas atreladas ao aceitável.
const db = require('../db/connection');

function getRegra(empresaId, area) {
  const r = db.prepare('SELECT * FROM regras_premiacao WHERE empresa_id=? AND area=?').get(empresaId, area);
  return r || { faixa1_valor: 0, faixa2_valor: 0, faixa3_valor: 0, faixa4_valor: 0, aceitavel: 90, area };
}

// pct = 100 → faixa1 (100%); pct >= aceitável → faixa2; >= aceitável-10 → faixa3; >= aceitável-20 → faixa4; senão 0
function premiacaoPorPct(pct, regra) {
  if (pct == null || !regra) return 0;
  const ac = regra.aceitavel || 90;
  if (pct >= 100) return regra.faixa1_valor;
  if (pct >= ac) return regra.faixa2_valor;
  if (pct >= ac - 10) return regra.faixa3_valor;
  if (pct >= ac - 20) return regra.faixa4_valor;
  return 0;
}

module.exports = { getRegra, premiacaoPorPct };
