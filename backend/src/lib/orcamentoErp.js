// orcamentoErp.js — leitura do ERP A7 (SOMENTE SELECT) para o módulo Orçamento.
// A verba de cada loja é a conta corrente "Orçamento - <loja>" (tipo C). O ESCRITÓRIO credita
// (Entrada de Transferência) e o GERENTE gasta (Lançamento de Saída / Pagamento de Conta).
// Por loja: verba (créditos) × gasto (débitos) × saldo. ERP SOMENTE LEITURA.
const { erpQuery } = require('../db/erp');

const BASE_FROM = `
  FROM movimentacaocontacorrente m
  JOIN contacorrente cc ON cc.id = m.contacorrenteid AND cc.status='A' AND cc.nome ILIKE 'Or_amento%'
  JOIN tipomovimentacaocontacorrente tm ON tm.id = m.tipomovimentacaocontacorrenteid`;

function periodo(params, de, ate, alias = 'm.datahora') {
  let w = '';
  if (de) { params.push(de); w += ` AND ${alias} >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND ${alias} < ($${params.length}::date + interval '1 day')`; }
  return w;
}

// Resumo por conta orçamentária (loja): verba, gasto, saldo, nº de gastos.
async function orcamentoResumo(unis, { de, ate } = {}) {
  const params = [unis]; let w = `cc.unidadenegocioid = ANY($1::bigint[])` + periodo(params, de, ate);
  return erpQuery(`
    SELECT cc.id AS conta_id, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
      COALESCE(SUM(m.valor) FILTER (WHERE tm.credito),0) AS verba,
      COALESCE(ABS(SUM(m.valor) FILTER (WHERE NOT tm.credito)),0) AS gasto,
      COALESCE(SUM(m.valor),0) AS saldo,
      COUNT(*) FILTER (WHERE NOT tm.credito) AS n_gastos
    ${BASE_FROM}
    WHERE ${w}
    GROUP BY cc.id, cc.nome, cc.unidadenegocioid
    HAVING COUNT(*) > 0
    ORDER BY cc.nome`, params);
}

// Movimento detalhado de uma ou mais contas orçamentárias.
async function orcamentoMovimento(unis, { de, ate, contas } = {}) {
  const params = [unis]; let w = `cc.unidadenegocioid = ANY($1::bigint[])`;
  const lista = (Array.isArray(contas) ? contas : String(contas || '').split(',')).map(c => String(c).trim()).filter(Boolean);
  if (lista.length) { params.push(lista); w += ` AND cc.id = ANY($${params.length}::bigint[])`; }
  w += periodo(params, de, ate);
  return erpQuery(`
    SELECT to_char(m.datahora,'YYYY-MM-DD') AS data, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
      tm.descricao AS tipo, tm.credito, m.valor, m.descricao, m.numerodocumento,
      COALESCE(pu.nome, u.login) AS usuario, pl.nome AS plano_contas
    ${BASE_FROM}
    LEFT JOIN usuario u ON u.id = m.usuarioid LEFT JOIN pessoa pu ON pu.id = u.pessoaid
    LEFT JOIN LATERAL (SELECT p.nome FROM lancamentofinanceiro lf JOIN planocontas p ON p.id=lf.planocontasid WHERE lf.movimentacaocontacorrenteid=m.id LIMIT 1) pl ON TRUE
    WHERE ${w}
    ORDER BY m.datahora DESC LIMIT 2000`, params);
}

// Gastos agrupados por plano de contas (categoria) — para o BI.
async function orcamentoPorPlano(unis, { de, ate } = {}) {
  const params = [unis]; let w = `cc.unidadenegocioid = ANY($1::bigint[])` + periodo(params, de, ate);
  return erpQuery(`
    SELECT COALESCE(pl.nome,'— sem plano —') AS plano,
      ABS(SUM(m.valor)) AS total, COUNT(*) AS n
    ${BASE_FROM}
    LEFT JOIN LATERAL (SELECT p.nome FROM lancamentofinanceiro lf JOIN planocontas p ON p.id=lf.planocontasid WHERE lf.movimentacaocontacorrenteid=m.id LIMIT 1) pl ON TRUE
    WHERE ${w} AND NOT tm.credito
    GROUP BY pl.nome ORDER BY total DESC LIMIT 40`, params);
}

module.exports = { orcamentoResumo, orcamentoMovimento, orcamentoPorPlano };
