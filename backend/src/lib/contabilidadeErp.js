// contabilidadeErp.js — leitura do ERP A7 (SOMENTE SELECT) para o módulo Contabilidade.
// Fatia 1: CRÉDITOS A RECUPERAR — crédito de devolução com fornecedor (creditofornecedor) que
// a empresa abate em boletos do contas a pagar. A contabilidade precisa do nº da NF vinculada
// ao contapagar para baixar e registrar contabilmente.
//
// Mapa do ERP (descoberto na base real):
//   creditofornecedor            — o crédito (codigo, dataemissao, valor, valorutilizado, status,
//                                   fornecedorid, unidadenegocioid=loja, devolucaocompraorigemid)
//   creditofornecedorutilizacao  — cada abatimento (valor, datahora, contapagarorigemid → o boleto;
//                                   unidadenegocioid aqui fica '1' = empresa, NÃO filtrar por loja aqui)
//   notafiscalcontapagar (ncp)   — liga contapagar ↔ notafiscal
//   notafiscal (nf)              — numero, serie, chaveacesso
//   devolucaocompra              — codigo da devolução que gerou o crédito
//
// Status do creditofornecedor (observado): A=em aberto, B=utilizado, C=parcial, D/E/F=outros.
const { erpQuery } = require('../db/erp');

const STATUS = { A: 'Em aberto', B: 'Utilizado', C: 'Parcial', D: 'Cancelado', E: 'Estornado', F: 'Outro' };

// Créditos de fornecedor da(s) loja(s). filtro.saldo='aberto' → só com saldo a recuperar (>0).
async function creditos(unis, filtro = {}) {
  const params = [unis];
  let where = `cf.unidadenegocioid = ANY($1::bigint[])`;
  if (filtro.saldo === 'aberto') where += ` AND (cf.valor - COALESCE(cf.valorutilizado,0)) > 0.009`;
  if (filtro.de) { params.push(filtro.de); where += ` AND cf.dataemissao >= $${params.length}::date`; }
  if (filtro.ate) { params.push(filtro.ate); where += ` AND cf.dataemissao < ($${params.length}::date + interval '1 day')`; }
  if (filtro.busca) { params.push('%' + filtro.busca + '%'); where += ` AND (pf.nome ILIKE $${params.length} OR pf.razaosocial ILIKE $${params.length} OR CAST(cf.codigo AS text) ILIKE $${params.length})`; }
  const rows = await erpQuery(`
    SELECT cf.id, cf.codigo, cf.status, cf.unidadenegocioid AS loja_erp,
      to_char(cf.dataemissao,'YYYY-MM-DD') AS data_emissao,
      cf.valor, COALESCE(cf.valorutilizado,0) AS valor_utilizado,
      (cf.valor - COALESCE(cf.valorutilizado,0)) AS saldo,
      COALESCE(pf.razaosocial, pf.nome) AS fornecedor, pf.cnpj,
      dc.codigo AS devolucao_codigo, to_char(dc.datahorafinal,'YYYY-MM-DD') AS devolucao_data,
      ne.numero AS nf_dev_numero, ne.serie AS nf_dev_serie, ne.chaveacesso AS nf_dev_chave,
      ne.valortotal AS nf_dev_valor, ne.status AS nf_dev_status
    FROM creditofornecedor cf
    LEFT JOIN fornecedor f ON f.id = cf.fornecedorid
    LEFT JOIN pessoa pf ON pf.id = f.pessoaid
    LEFT JOIN devolucaocompra dc ON dc.id = cf.devolucaocompraorigemid
    LEFT JOIN LATERAL (
      SELECT numero, serie, chaveacesso, valortotal, status
      FROM nfe WHERE devolucaocompraid = dc.id
      ORDER BY (status='C') DESC, dataemissao DESC NULLS LAST, numero DESC
      LIMIT 1
    ) ne ON TRUE
    WHERE ${where}
    ORDER BY cf.dataemissao DESC, cf.codigo DESC
    LIMIT 2000`, params);
  return rows.map(r => ({ ...r, status_label: STATUS[r.status] || r.status }));
}

// Abatimentos (utilizações) com a NF vinculada ao contas a pagar — o que a contabilidade baixa.
// Filtra pela loja do CRÉDITO (a utilização em si fica na unidade '1' = empresa).
async function utilizacoes(unis, filtro = {}) {
  const params = [unis];
  let where = `cf.unidadenegocioid = ANY($1::bigint[])`;
  if (filtro.de) { params.push(filtro.de); where += ` AND u.datahora >= $${params.length}::date`; }
  if (filtro.ate) { params.push(filtro.ate); where += ` AND u.datahora < ($${params.length}::date + interval '1 day')`; }
  if (filtro.busca) { params.push('%' + filtro.busca + '%'); where += ` AND (pf.nome ILIKE $${params.length} OR pf.razaosocial ILIKE $${params.length} OR CAST(nf.numero AS text) ILIKE $${params.length} OR cp.numerodocumento ILIKE $${params.length})`; }
  return erpQuery(`
    SELECT u.id, to_char(u.datahora,'YYYY-MM-DD') AS data_abatimento, u.valor AS valor_abatido,
      cf.codigo AS codigo_credito, cf.unidadenegocioid AS loja_erp,
      COALESCE(pf.razaosocial, pf.nome) AS fornecedor, pf.cnpj,
      cp.numerodocumento, to_char(cp.datavencimento,'YYYY-MM-DD') AS vencimento, cp.status AS status_contapagar,
      cp.valordocumento AS valor_titulo, (COALESCE(cp.valordocumento,0) - u.valor) AS valor_final,
      nf.numero AS nf_numero, nf.serie AS nf_serie, nf.chaveacesso AS nf_chave,
      to_char(nf.datahoraemissao,'YYYY-MM-DD') AS nf_emissao,
      dc.codigo AS devolucao_codigo,
      ndev.numero AS nf_dev_numero, ndev.serie AS nf_dev_serie, ndev.chaveacesso AS nf_dev_chave, ndev.valortotal AS nf_dev_valor
    FROM creditofornecedorutilizacao u
    JOIN creditofornecedor cf ON cf.id = u.creditofornecedorid
    LEFT JOIN fornecedor f ON f.id = cf.fornecedorid
    LEFT JOIN pessoa pf ON pf.id = f.pessoaid
    LEFT JOIN contapagar cp ON cp.id = u.contapagarorigemid
    LEFT JOIN notafiscalcontapagar ncp ON ncp.contapagarid = cp.id
    LEFT JOIN notafiscal nf ON nf.id = ncp.notafiscalid
    LEFT JOIN devolucaocompra dc ON dc.id = cf.devolucaocompraorigemid
    LEFT JOIN LATERAL (
      SELECT numero, serie, chaveacesso, valortotal FROM nfe WHERE devolucaocompraid = dc.id
      ORDER BY (status='C') DESC, dataemissao DESC NULLS LAST, numero DESC LIMIT 1
    ) ndev ON TRUE
    WHERE ${where}
    ORDER BY u.datahora DESC, u.id DESC
    LIMIT 2000`, params);
}

// Resumo (cartões do topo): a recuperar (saldo em aberto) × já utilizado, por loja e total.
async function resumo(unis) {
  const rows = await erpQuery(`
    SELECT cf.unidadenegocioid AS loja_erp,
      SUM(CASE WHEN (cf.valor - COALESCE(cf.valorutilizado,0)) > 0.009 THEN (cf.valor - COALESCE(cf.valorutilizado,0)) ELSE 0 END) AS saldo_aberto,
      SUM(COALESCE(cf.valorutilizado,0)) AS utilizado,
      COUNT(*) FILTER (WHERE (cf.valor - COALESCE(cf.valorutilizado,0)) > 0.009) AS n_aberto,
      COUNT(*) AS n_total
    FROM creditofornecedor cf
    WHERE cf.unidadenegocioid = ANY($1::bigint[])
    GROUP BY cf.unidadenegocioid`, [unis]);
  return rows;
}

// Contas (conta corrente: banco/cofre/orçamento) das lojas, para o seletor do extrato.
async function contasLista(unis) {
  return erpQuery(`
    SELECT cc.id, cc.nome, cc.tipo, cc.unidadenegocioid AS loja_erp
    FROM contacorrente cc
    WHERE cc.status='A' AND cc.unidadenegocioid = ANY($1::bigint[])
    ORDER BY cc.tipo, cc.nome`, [unis]);
}

// Extrato de contas a pagar com plano de contas, NF, desconto, crédito abatido, valor final,
// conta que pagou e datas (sistema=emissão, banco=movimentação, baixa=pagamento).
// filtro: { de, ate, conta (id conta corrente que pagou), busca, somentePagos }
async function extratoContas(unis, filtro = {}) {
  const params = [unis];
  let where = `cp.unidadenegocioid = ANY($1::bigint[])`;
  if (filtro.de) { params.push(filtro.de); where += ` AND cp.dataemissao >= $${params.length}::date`; }
  if (filtro.ate) { params.push(filtro.ate); where += ` AND cp.dataemissao < ($${params.length}::date + interval '1 day')`; }
  if (filtro.busca) { params.push('%' + filtro.busca + '%'); const i = params.length; where += ` AND (pf.nome ILIKE $${i} OR pf.razaosocial ILIKE $${i} OR cp.numerodocumento ILIKE $${i} OR CAST(nf.numero AS text) ILIKE $${i})`; }
  let contaFiltro = '';
  if (filtro.conta) { params.push(filtro.conta); contaFiltro = ` AND pg.conta_id = $${params.length}`; }
  // Monta via LATERAL do pagamento; o filtro por conta aplica sobre a conta do pagamento.
  const sql = `
    SELECT cp.id,
      to_char(cp.dataemissao,'YYYY-MM-DD') AS data_sistema,
      to_char(cp.datavencimento,'YYYY-MM-DD') AS vencimento,
      pg.data_banco, pg.data_baixa, pg.conta,
      pl.nome AS plano_contas, cp.numerodocumento, cp.pessoaid AS pessoa_id,
      COALESCE(pf.razaosocial, pf.nome) AS fornecedor,
      nf.numero AS nf_numero, nf.serie AS nf_serie,
      cp.valordocumento AS valor, COALESCE(cp.desconto,0) AS desconto,
      COALESCE(cr.credito,0) AS credito_recuperar,
      (COALESCE(cp.valordocumento,0) - COALESCE(cp.desconto,0) - COALESCE(cr.credito,0)) AS valor_final,
      cp.status AS status
    FROM contapagar cp
    LEFT JOIN planocontas pl ON pl.id = cp.planocontasid
    LEFT JOIN pessoa pf ON pf.id = cp.pessoaid
    LEFT JOIN LATERAL (SELECT SUM(u.valor) credito FROM creditofornecedorutilizacao u WHERE u.contapagarorigemid = cp.id) cr ON TRUE
    LEFT JOIN LATERAL (
      SELECT to_char(p.datahora,'YYYY-MM-DD') AS data_baixa, to_char(mc.datahora,'YYYY-MM-DD') AS data_banco,
        cc.nome AS conta, cc.id AS conta_id
      FROM itempgtocontapagar i
      JOIN pgtocontapagar p ON p.id = i.pgtocontapagarid
      LEFT JOIN retiradapgtocontapagar r ON r.pgtocontapagarid = p.id
      LEFT JOIN contacorrente cc ON cc.id = r.contacorrenteid
      LEFT JOIN movimentacaocontacorrente mc ON mc.id = r.movimentacaocontacorrenteid
      WHERE i.contapagarid = cp.id
      ORDER BY p.datahora DESC LIMIT 1
    ) pg ON TRUE
    LEFT JOIN LATERAL (SELECT nf.numero, nf.serie FROM notafiscalcontapagar ncp JOIN notafiscal nf ON nf.id = ncp.notafiscalid WHERE ncp.contapagarid = cp.id ORDER BY nf.numero DESC LIMIT 1) nf ON TRUE
    WHERE ${where}${contaFiltro}${filtro.somentePagos ? ' AND pg.conta_id IS NOT NULL' : ''}
    ORDER BY cp.dataemissao DESC, cp.id DESC
    LIMIT 3000`;
  return erpQuery(sql, params);
}

// Movimento COMPLETO de uma conta (extrato bancário real): todas as entradas e saídas com saldo.
// Diferente do extratoContas (que é só contas a pagar), aqui vem tudo que passou na conta.
async function movimentoConta(contaId, { de, ate } = {}) {
  const params = [contaId];
  let w = `m.contacorrenteid = $1`;
  if (de) { params.push(de); w += ` AND m.datahora >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND m.datahora < ($${params.length}::date + interval '1 day')`; }
  // Para "Pagamento de Conta", liga ao contas a pagar pago (via retirada) e traz plano de contas + nº do documento.
  return erpQuery(`
    SELECT m.id AS mov_id, to_char(m.datahora,'YYYY-MM-DD HH24:MI') AS datahora, tm.descricao AS tipo_mov, tm.credito,
      m.valor, m.saldo, m.descricao, m.numerodocumento,
      COALESCE(pcp.plano_contas, lfp.plano) AS plano_contas, COALESCE(pcp.documentos, m.numerodocumento) AS documento_baixado, COALESCE(pcp.n_titulos,0) AS n_titulos,
      tr.transf_obs
    FROM movimentacaocontacorrente m
    LEFT JOIN tipomovimentacaocontacorrente tm ON tm.id = m.tipomovimentacaocontacorrenteid
    LEFT JOIN LATERAL (
      SELECT pl.nome AS plano FROM lancamentofinanceiro lf JOIN planocontas pl ON pl.id = lf.planocontasid
      WHERE lf.movimentacaocontacorrenteid = m.id LIMIT 1
    ) lfp ON TRUE
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT pl.nome, ' | ') AS plano_contas,
             string_agg(DISTINCT cp.numerodocumento, ', ') AS documentos,
             COUNT(DISTINCT cp.id) AS n_titulos
      FROM retiradapgtocontapagar r
      JOIN itempgtocontapagar i ON i.pgtocontapagarid = r.pgtocontapagarid
      JOIN contapagar cp ON cp.id = i.contapagarid
      LEFT JOIN planocontas pl ON pl.id = cp.planocontasid
      WHERE r.movimentacaocontacorrenteid = m.id
    ) pcp ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE WHEN t.movimentacaocontacorrenteorigemid = m.id THEN 'Para: ' || ccd.nome
                  WHEN t.movimentacaocontacorrentedestinoid = m.id THEN 'De: ' || cco.nome END AS transf_obs
      FROM transferenciacontacorrente t
      LEFT JOIN contacorrente ccd ON ccd.id = t.contacorrentedestinoid
      LEFT JOIN movimentacaocontacorrente mo ON mo.id = t.movimentacaocontacorrenteorigemid
      LEFT JOIN contacorrente cco ON cco.id = mo.contacorrenteid
      WHERE t.movimentacaocontacorrenteorigemid = m.id OR t.movimentacaocontacorrentedestinoid = m.id
      LIMIT 1
    ) tr ON TRUE
    WHERE ${w}
    ORDER BY m.datahora DESC, m.id DESC
    LIMIT 3000`, params);
}

// Detalhe de um LOTE de pagamento: os títulos (contas a pagar) quitados naquele movimento.
async function loteDetalhe(movId) {
  return erpQuery(`
    SELECT cp.numerodocumento, COALESCE(pf.razaosocial, pf.nome) AS fornecedor,
      pl.nome AS plano_contas, cp.valordocumento AS valor_titulo, i.valorpagamento AS valor_pago,
      to_char(cp.datavencimento,'YYYY-MM-DD') AS vencimento,
      nf.numero AS nf_numero, nf.serie AS nf_serie
    FROM retiradapgtocontapagar r
    JOIN itempgtocontapagar i ON i.pgtocontapagarid = r.pgtocontapagarid
    JOIN contapagar cp ON cp.id = i.contapagarid
    LEFT JOIN pessoa pf ON pf.id = cp.pessoaid
    LEFT JOIN planocontas pl ON pl.id = cp.planocontasid
    LEFT JOIN LATERAL (SELECT nf.numero, nf.serie FROM notafiscalcontapagar ncp JOIN notafiscal nf ON nf.id=ncp.notafiscalid WHERE ncp.contapagarid=cp.id ORDER BY nf.numero DESC LIMIT 1) nf ON TRUE
    WHERE r.movimentacaocontacorrenteid = $1
    ORDER BY cp.numerodocumento`, [movId]);
}

// Candidatos do contas a pagar para casar com uma NF lida (por CNPJ do fornecedor + valor).
async function candidatosContaPagar(unis, { de, ate } = {}) {
  const params = [unis];
  let w = `cp.unidadenegocioid = ANY($1::bigint[])`;
  if (de) { params.push(de); w += ` AND cp.dataemissao >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND cp.dataemissao < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT cp.id, cp.valordocumento AS valor, cp.numerodocumento, to_char(cp.dataemissao,'YYYY-MM-DD') AS data,
      COALESCE(pf.razaosocial, pf.nome) AS fornecedor, regexp_replace(COALESCE(pf.cnpj,''), '\\D', '', 'g') AS cnpj
    FROM contapagar cp LEFT JOIN pessoa pf ON pf.id = cp.pessoaid
    WHERE ${w}
    ORDER BY cp.dataemissao DESC LIMIT 5000`, params);
}

// Títulos COM NF de entrada (ERP), agrupados por fornecedor + plano — p/ o drill-down do BI.
async function comNfPorFornecedor(unis, { de, ate } = {}) {
  const params = [unis];
  let w = `cp.unidadenegocioid = ANY($1::bigint[]) AND EXISTS (SELECT 1 FROM notafiscalcontapagar ncp WHERE ncp.contapagarid = cp.id)`;
  if (de) { params.push(de); w += ` AND cp.dataemissao >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND cp.dataemissao < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT cp.unidadenegocioid AS loja_erp, CAST(cp.pessoaid AS text) AS pessoa_id,
      COALESCE(pf.razaosocial, pf.nome) AS fornecedor, pl.nome AS plano, COUNT(*) AS n, COALESCE(SUM(cp.valordocumento),0) AS valor
    FROM contapagar cp LEFT JOIN pessoa pf ON pf.id = cp.pessoaid
    LEFT JOIN planocontas pl ON pl.id = cp.planocontasid
    WHERE ${w}
    GROUP BY cp.unidadenegocioid, cp.pessoaid, pf.razaosocial, pf.nome, pl.nome`, params);
}

// BI: agregado de despesas (contas a pagar) com/sem NF de ENTRADA do ERP, por loja (sem limite de linhas).
// "com NF" aqui = tem notafiscalcontapagar. O overlay local (notas de serviço anexadas) é somado na rota.
async function biNfContaPagar(unis, { de, ate } = {}) {
  const params = [unis];
  let w = `cp.unidadenegocioid = ANY($1::bigint[])`;
  if (de) { params.push(de); w += ` AND cp.dataemissao >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND cp.dataemissao < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT cp.unidadenegocioid AS loja_erp,
      COUNT(*) AS n, COALESCE(SUM(cp.valordocumento),0) AS valor,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM notafiscalcontapagar ncp WHERE ncp.contapagarid = cp.id)) AS com_n,
      COALESCE(SUM(cp.valordocumento) FILTER (WHERE EXISTS (SELECT 1 FROM notafiscalcontapagar ncp WHERE ncp.contapagarid = cp.id)),0) AS com_valor
    FROM contapagar cp
    WHERE ${w}
    GROUP BY cp.unidadenegocioid`, params);
}

// Para o overlay: dados (valor/loja/tem-nf-erp) de uma lista de contapagar ids específicos.
async function contaPagarPorIds(ids) {
  if (!ids || !ids.length) return [];
  return erpQuery(`
    SELECT cp.id, cp.unidadenegocioid AS loja_erp, CAST(cp.pessoaid AS text) AS pessoa_id, cp.valordocumento AS valor,
      EXISTS (SELECT 1 FROM notafiscalcontapagar ncp WHERE ncp.contapagarid = cp.id) AS tem_nf_erp
    FROM contapagar cp WHERE cp.id = ANY($1::bigint[])`, [ids.map(Number).filter(Boolean)]);
}

// Fornecedores que aparecem no contas a pagar (para o cadastro "emite NF?"): por pessoa.
async function fornecedoresContaPagar(unis, { de, ate } = {}) {
  const params = [unis];
  let w = `cp.unidadenegocioid = ANY($1::bigint[]) AND cp.pessoaid IS NOT NULL`;
  if (de) { params.push(de); w += ` AND cp.dataemissao >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND cp.dataemissao < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT CAST(cp.pessoaid AS text) AS pessoa_id, COALESCE(pf.razaosocial, pf.nome) AS nome, pf.cnpj,
      COUNT(*) AS n, COALESCE(SUM(cp.valordocumento),0) AS valor,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM notafiscalcontapagar ncp WHERE ncp.contapagarid = cp.id)) AS com_n
    FROM contapagar cp LEFT JOIN pessoa pf ON pf.id = cp.pessoaid
    WHERE ${w}
    GROUP BY cp.pessoaid, pf.razaosocial, pf.nome, pf.cnpj
    ORDER BY valor DESC LIMIT 3000`, params);
}

// Despesas SEM NF de entrada, agrupadas por loja + fornecedor (para classificar no BI por motivo).
async function semNfPorFornecedor(unis, { de, ate } = {}) {
  const params = [unis];
  let w = `cp.unidadenegocioid = ANY($1::bigint[]) AND NOT EXISTS (SELECT 1 FROM notafiscalcontapagar ncp WHERE ncp.contapagarid = cp.id)`;
  if (de) { params.push(de); w += ` AND cp.dataemissao >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND cp.dataemissao < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT cp.unidadenegocioid AS loja_erp, CAST(cp.pessoaid AS text) AS pessoa_id,
      COALESCE(pf.razaosocial, pf.nome) AS fornecedor, pl.nome AS plano, COUNT(*) AS n, COALESCE(SUM(cp.valordocumento),0) AS valor
    FROM contapagar cp LEFT JOIN pessoa pf ON pf.id = cp.pessoaid
    LEFT JOIN planocontas pl ON pl.id = cp.planocontasid
    WHERE ${w}
    GROUP BY cp.unidadenegocioid, cp.pessoaid, pf.razaosocial, pf.nome, pl.nome`, params);
}

module.exports = { creditos, utilizacoes, resumo, contasLista, extratoContas, movimentoConta, loteDetalhe, candidatosContaPagar, biNfContaPagar, contaPagarPorIds, fornecedoresContaPagar, semNfPorFornecedor, comNfPorFornecedor, STATUS };
