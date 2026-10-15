// cofreErp.js — leitura do ERP A7 (SOMENTE SELECT): contas COFRE por loja.
// No A7, cada loja tem uma conta corrente tipo 'C' chamada "Cofre - <loja>" (e "Orçamento - <loja>").
// O dinheiro do caixa entra no cofre (Depósito de Sangria) e sai por: Saída de Transferência
// (cofre → banco = o depósito) e Pagamento de Conta / Lançamento de Saída (despesas).
// A coluna movimentacaocontacorrente.saldo é o saldo CORRENTE após cada lançamento — por isso o
// "saldo do cofre numa data" = saldo do último lançamento com datahora < limite. Isso dá o
// "Saldo em caixa 30/31" (dinheiro não depositado no fim do mês), menos o fundo fixo da loja.
const { erpQuery } = require('../db/erp');

const COFRE = `cc.tipo='C' AND cc.status='A' AND cc.nome ILIKE 'Cofre%'`;

// Saldo do cofre de cada loja AS OF um limite (exclusivo). ateISO null = agora (exclui lançamentos
// pós-datados, que existem na base). Retorna [{loja_erp, nome, saldo, ultima_mov}].
async function saldo(unis, ateISO) {
  const ate = ateISO || new Date().toISOString();
  return erpQuery(`
    WITH cofres AS (
      SELECT cc.id, cc.unidadenegocioid, cc.nome
      FROM contacorrente cc WHERE ${COFRE} AND cc.unidadenegocioid = ANY($1::bigint[])
    ),
    ult AS (
      SELECT DISTINCT ON (m.contacorrenteid) m.contacorrenteid, m.saldo, m.datahora
      FROM movimentacaocontacorrente m JOIN cofres c ON c.id = m.contacorrenteid
      WHERE m.datahora < $2::timestamp
      ORDER BY m.contacorrenteid, m.datahora DESC, m.id DESC
    )
    SELECT c.unidadenegocioid AS loja_erp, c.nome, COALESCE(u.saldo,0) AS saldo,
      to_char(u.datahora,'YYYY-MM-DD HH24:MI') AS ultima_mov
    FROM cofres c LEFT JOIN ult u ON u.contacorrenteid = c.id
    ORDER BY c.unidadenegocioid`, [unis, ate]);
}

// Extrato do cofre (período): cada movimentação com tipo, valor e saldo corrente.
async function extrato(unis, { de, ate } = {}) {
  const params = [unis];
  let w = `${COFRE} AND cc.unidadenegocioid = ANY($1::bigint[])`;
  if (de) { params.push(de); w += ` AND m.datahora >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND m.datahora < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT cc.unidadenegocioid AS loja_erp, cc.nome AS cofre,
      to_char(m.datahora,'YYYY-MM-DD HH24:MI') AS datahora, tm.descricao AS tipo_mov,
      tm.credito, m.valor, m.saldo, m.descricao, m.numerodocumento
    FROM movimentacaocontacorrente m
    JOIN contacorrente cc ON cc.id = m.contacorrenteid AND ${COFRE}
    LEFT JOIN tipomovimentacaocontacorrente tm ON tm.id = m.tipomovimentacaocontacorrenteid
    WHERE ${w}
    ORDER BY m.datahora DESC, m.id DESC
    LIMIT 3000`, params);
}

// Fechamento diário: por loja/dia, quanto entrou do caixa (sangria), quanto foi depositado no
// banco e quanto virou despesa — para justificar "o que foi feito com o dinheiro". A diferença
// (entrou − depositado − despesas) é o dinheiro que ficou retido no cofre naquele dia.
async function fechamentoDiario(unis, { de, ate } = {}) {
  const params = [unis];
  let w = `${COFRE} AND cc.unidadenegocioid = ANY($1::bigint[])`;
  if (de) { params.push(de); w += ` AND m.datahora >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND m.datahora < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT cc.unidadenegocioid AS loja_erp, to_char(m.datahora,'YYYY-MM-DD') AS dia,
      SUM(CASE WHEN tm.descricao='Depósito de Sangria' THEN m.valor ELSE 0 END) AS entrou_caixa,
      SUM(CASE WHEN tm.descricao='Saída de Transferência' THEN -m.valor ELSE 0 END) AS depositado_banco,
      SUM(CASE WHEN tm.descricao IN ('Pagamento de Conta','Lançamento de Saída') THEN -m.valor ELSE 0 END) AS despesas,
      SUM(CASE WHEN tm.credito THEN m.valor ELSE -m.valor END) AS variacao
    FROM movimentacaocontacorrente m
    JOIN contacorrente cc ON cc.id = m.contacorrenteid AND ${COFRE}
    LEFT JOIN tipomovimentacaocontacorrente tm ON tm.id = m.tipomovimentacaocontacorrenteid
    WHERE ${w}
    GROUP BY cc.unidadenegocioid, dia
    ORDER BY dia DESC, loja_erp
    LIMIT 2000`, params);
}

module.exports = { saldo, extrato, fechamentoDiario };
