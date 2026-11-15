// auditoriaErp.js — leitura do ERP (SOMENTE SELECT) para o menu Auditoria.
// (A) Tempo/situação da conciliação de cartão (por operadora).
// (B) Lançamentos MANUAIS na conta corrente (Lançamento de Entrada/Saída) — o que foi lançado à mão
//     na conciliação, em vez de vir como baixa automática (cartão) ou baixa de contas a pagar.
const { erpQuery } = require('../db/erp');

// Conciliação de cartão por operadora: conciliados × pendentes, % e atraso dos pendentes.
async function conciliacaoTempo({ de, ate } = {}) {
  const params = []; let w = '1=1';
  if (de) { params.push(de); w += ` AND i.datavencimento >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND i.datavencimento < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT COALESCE(op.nome,'—') AS operadora,
      COUNT(*) AS itens, COALESCE(SUM(i.valor),0) AS valor,
      COUNT(*) FILTER (WHERE i.baixadata IS NOT NULL) AS conciliados,
      COUNT(*) FILTER (WHERE i.baixadata IS NULL) AS pendentes,
      COALESCE(SUM(i.valor) FILTER (WHERE i.baixadata IS NULL),0) AS valor_pendente,
      ROUND(AVG(EXTRACT(EPOCH FROM (now() - i.datavencimento))/86400) FILTER (WHERE i.baixadata IS NULL)::numeric,1) AS dias_atraso_medio,
      to_char(MIN(i.datavencimento) FILTER (WHERE i.baixadata IS NULL),'YYYY-MM-DD') AS pendente_mais_antigo
    FROM conciliacaocartaoitem i
    JOIN conciliacaocartao c ON c.id = i.conciliacaocartaoid
    LEFT JOIN conciliacaocartaooperadora op ON op.id = c.conciliacaocartaooperadoraid
    WHERE ${w}
    GROUP BY op.nome ORDER BY itens DESC`, params);
}

// Lançamentos manuais (Lançamento de Entrada/Saída) na conta corrente, por loja/conta/período.
// Monta o WHERE comum dos lançamentos manuais (reutilizado pela lista e pela lista de planos).
// O alias pl.nome (plano de contas) existe via LEFT JOIN LATERAL no FROM abaixo.
const SEM_PLANO = '__SEM__';
function whereManuais(unis, { contas, semCartao, plano } = {}) {
  const params = [unis]; let w = `cc.unidadenegocioid = ANY($1::bigint[])`;
  // "sistema" = baixa automática do próprio ERP, não lançamento manual de uma pessoa → fora da auditoria.
  w += ` AND lower(COALESCE(pu.nome, u.login, '')) <> 'sistema'`;
  // "Baixa de Cartão ..." = reprocessamento do arquivo de cartão re-lançado à mão, não é lançamento manual de verdade.
  if (semCartao) w += ` AND m.descricao NOT ILIKE 'Baixa de Cart_o%'`;
  const listaContas = (Array.isArray(contas) ? contas : String(contas || '').split(',')).map(c => String(c).trim()).filter(Boolean);
  if (listaContas.length) { params.push(listaContas); w += ` AND cc.id = ANY($${params.length}::bigint[])`; }
  if (plano === SEM_PLANO) w += ` AND pl.nome IS NULL`;
  else if (plano) { params.push(plano); w += ` AND pl.nome = $${params.length}`; }
  return { params, w };
}

async function lancamentosManuais(unis, { de, ate, contas, semCartao, plano } = {}) {
  const { params, w: w0 } = whereManuais(unis, { contas, semCartao, plano }); let w = w0;
  if (de) { params.push(de); w += ` AND m.datahora >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND m.datahora < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT to_char(m.datahora,'YYYY-MM-DD HH24:MI') AS datahora, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
      tm.descricao AS tipo, tm.credito, m.valor, m.descricao, m.numerodocumento,
      (m.descricao ILIKE 'Baixa de Cart_o%') AS reprocesso_cartao,
      COALESCE(pu.nome, u.login) AS usuario, pl.nome AS plano_contas
    FROM movimentacaocontacorrente m
    JOIN contacorrente cc ON cc.id = m.contacorrenteid
    JOIN tipomovimentacaocontacorrente tm ON tm.id = m.tipomovimentacaocontacorrenteid AND tm.descricao IN ('Lançamento de Entrada','Lançamento de Saída')
    LEFT JOIN usuario u ON u.id = m.usuarioid LEFT JOIN pessoa pu ON pu.id = u.pessoaid
    LEFT JOIN LATERAL (SELECT p.nome FROM lancamentofinanceiro lf JOIN planocontas p ON p.id=lf.planocontasid WHERE lf.movimentacaocontacorrenteid=m.id LIMIT 1) pl ON TRUE
    WHERE ${w}
    ORDER BY m.datahora DESC LIMIT 2000`, params);
}

// Lançamentos manuais RETROATIVOS (Joe 2026-11-14): lançados com data (competência) bem anterior ao dia
// em que foram DIGITADOS (datahorainclusao). Sinal de auditoria pra Diretoria cobrar o motivo. Gap = dias
// entre a competência e a inclusão; só acima de `diasMin` (configurável). Filtra pela DATA DE INCLUSÃO
// (o que foi lançado no período). Exclui competências-epoch (data nula vira 1970). Mesmas exclusões de
// sistema/cartão dos lançamentos manuais.
async function lancamentosRetroativos(unis, { de, ate, contas, semCartao, diasMin = 5 } = {}) {
  const { params, w: w0 } = whereManuais(unis, { contas, semCartao }); let w = w0;
  params.push(Number(diasMin) || 0); w += ` AND (m.datahorainclusao::date - m.datahora::date) > $${params.length}`;
  w += ` AND m.datahora >= '2015-01-01'`; // ignora competência nula/epoch
  if (de) { params.push(de); w += ` AND m.datahorainclusao >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND m.datahorainclusao < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT m.id, to_char(m.datahora,'YYYY-MM-DD') AS competencia, to_char(m.datahorainclusao,'YYYY-MM-DD') AS lancado,
      (m.datahorainclusao::date - m.datahora::date) AS gap, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
      tm.descricao AS tipo, m.valor, m.descricao, m.numerodocumento,
      COALESCE(pu.nome, u.login) AS usuario, pl.nome AS plano_contas
    FROM movimentacaocontacorrente m
    JOIN contacorrente cc ON cc.id = m.contacorrenteid
    JOIN tipomovimentacaocontacorrente tm ON tm.id = m.tipomovimentacaocontacorrenteid AND tm.descricao IN ('Lançamento de Entrada','Lançamento de Saída')
    LEFT JOIN usuario u ON u.id = m.usuarioid LEFT JOIN pessoa pu ON pu.id = u.pessoaid
    LEFT JOIN LATERAL (SELECT p.nome FROM lancamentofinanceiro lf JOIN planocontas p ON p.id=lf.planocontasid WHERE lf.movimentacaocontacorrenteid=m.id LIMIT 1) pl ON TRUE
    WHERE ${w}
    ORDER BY gap DESC, m.datahorainclusao DESC LIMIT 1000`, params);
}

// ESTORNOS & EXCLUSÕES no ERP (Joe 2026-11-14): exclusão de conta a pagar + estorno de depósito/
// transferência de conta corrente. A Diretoria acompanha quem desfez o quê (quem/quando/valor/motivo).
async function estornosExclusoes(unis, { de, ate } = {}) {
  const cond = (col) => { const p = [unis]; let w = ''; if (de) { p.push(de); w += ` AND ${col} >= $${p.length}::date`; } if (ate) { p.push(ate); w += ` AND ${col} < ($${p.length}::date + interval '1 day')`; } return { p, w }; };
  const a = cond('cc.datahora');
  const cap = await erpQuery(`
    SELECT 'Exclusão de conta a pagar' tipo, to_char(cc.datahora,'YYYY-MM-DD HH24:MI') datahora,
      to_char(cp.dataemissao,'YYYY-MM-DD') data_lancamento, cc.motivo,
      COALESCE(up.nome,u.login) usuario, COALESCE(upl.nome, ull.login) usuario_lancou,
      cp.unidadenegocioid uni, COALESCE(cp.valor,cp.valordocumento,0)::float8 valor, cp.descricao ref
    FROM cancelamentocontapagar cc JOIN contapagar cp ON cp.id=cc.contapagarid
      JOIN usuario u ON u.id=cc.usuarioid LEFT JOIN pessoa up ON up.id=u.pessoaid
      LEFT JOIN usuario ull ON ull.id=cp.usuarioid LEFT JOIN pessoa upl ON upl.id=ull.pessoaid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) ${a.w}`, a.p);
  const b = cond('e.datahora');
  const est = await erpQuery(`
    SELECT 'Estorno de depósito/transferência' tipo, to_char(e.datahora,'YYYY-MM-DD HH24:MI') datahora,
      to_char(mo.datahora,'YYYY-MM-DD HH24:MI') data_lancamento, e.motivo,
      COALESCE(up.nome,u.login) usuario, COALESCE(upl.nome, ull.login) usuario_lancou,
      e.unidadenegocioid uni, e.valor::float8 valor, ''::text ref
    FROM estornotransferenciacontacorrente e JOIN usuario u ON u.id=e.usuarioid LEFT JOIN pessoa up ON up.id=u.pessoaid
      LEFT JOIN movimentacaocontacorrente mo ON mo.id = e.movimentacaocontacorrenteorigemid
      LEFT JOIN usuario ull ON ull.id=mo.usuarioid LEFT JOIN pessoa upl ON upl.id=ull.pessoaid
    WHERE e.unidadenegocioid = ANY($1::bigint[]) ${b.w}`, b.p);
  // 3ª fonte: estorno de PAGAMENTO (baixa desfeita) de conta a pagar. usuario = quem estornou, usuario_lancou = quem pagou.
  const c = cond('ei.datahora');
  const pag = await erpQuery(`
    SELECT 'Estorno de pagamento' tipo, to_char(ei.datahora,'YYYY-MM-DD HH24:MI') datahora,
      to_char(cp.dataemissao,'YYYY-MM-DD') data_lancamento, ei.motivo,
      COALESCE(up.nome,u.login) usuario, COALESCE(upl.nome, ull.login) usuario_lancou,
      cp.unidadenegocioid uni, ip.valorpagamento::float8 valor, cp.descricao ref
    FROM estornoitempgtocontapagar ei
      JOIN itempgtocontapagar ip ON ip.id = ei.itempgtocontapagarid
      JOIN contapagar cp ON cp.id = ip.contapagarid
      JOIN usuario u ON u.id=ei.usuarioid LEFT JOIN pessoa up ON up.id=u.pessoaid
      LEFT JOIN usuario ull ON ull.id=cp.usuarioid LEFT JOIN pessoa upl ON upl.id=ull.pessoaid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) ${c.w}`, c.p);
  return [...cap, ...est, ...pag].sort((x, y) => new Date(y.datahora) - new Date(x.datahora));
}

// Planos de contas distintos presentes nos lançamentos manuais (p/ o filtro). Inclui "sem plano".
async function lancamentosManuaisPlanos(unis, { de, ate, contas, semCartao } = {}) {
  const { params, w: w0 } = whereManuais(unis, { contas, semCartao }); let w = w0;
  if (de) { params.push(de); w += ` AND m.datahora >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND m.datahora < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT pl.nome AS plano, COUNT(*) AS n
    FROM movimentacaocontacorrente m
    JOIN contacorrente cc ON cc.id = m.contacorrenteid
    JOIN tipomovimentacaocontacorrente tm ON tm.id = m.tipomovimentacaocontacorrenteid AND tm.descricao IN ('Lançamento de Entrada','Lançamento de Saída')
    LEFT JOIN usuario u ON u.id = m.usuarioid LEFT JOIN pessoa pu ON pu.id = u.pessoaid
    LEFT JOIN LATERAL (SELECT p.nome FROM lancamentofinanceiro lf JOIN planocontas p ON p.id=lf.planocontasid WHERE lf.movimentacaocontacorrenteid=m.id LIMIT 1) pl ON TRUE
    WHERE ${w}
    GROUP BY pl.nome ORDER BY (pl.nome IS NULL), pl.nome`, params);
}

// (C) Conciliação BANCÁRIA: linhas do extrato do banco (extratobancario) × se já estão conciliadas
//     (têm link em extratobancarioconciliacao com o movimento da conta corrente). Por conta/banco.
async function conciliacaoBancaria(unis, { de, ate } = {}) {
  const params = [unis]; let w = `cc.unidadenegocioid = ANY($1::bigint[])`;
  if (de) { params.push(de); w += ` AND eb.datahora >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND eb.datahora < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT cc.id AS conta_id, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
      COUNT(*) AS linhas,
      COUNT(*) FILTER (WHERE ec.id IS NOT NULL) AS conciliadas,
      COUNT(*) FILTER (WHERE ec.id IS NULL) AS pendentes,
      COALESCE(ABS(SUM(eb.valor) FILTER (WHERE ec.id IS NULL)),0) AS valor_pendente,
      ROUND(AVG(EXTRACT(EPOCH FROM (now()-eb.datahora))/86400) FILTER (WHERE ec.id IS NULL)::numeric,1) AS dias_atraso_medio,
      to_char(MIN(eb.datahora) FILTER (WHERE ec.id IS NULL),'YYYY-MM-DD') AS pendente_mais_antigo
    FROM extratobancario eb
    JOIN contabancaria cb ON cb.id = eb.contabancariaid
    JOIN contacorrente cc ON cc.id = cb.contacorrenteid
    LEFT JOIN extratobancarioconciliacao ec ON ec.extratobancarioid = eb.id
    WHERE ${w}
    GROUP BY cc.id, cc.nome, cc.unidadenegocioid
    ORDER BY linhas DESC`, params);
}

// Linhas pendentes do extrato bancário (não conciliadas) — drill-down por conta.
async function conciliacaoBancariaPendentes(unis, { de, ate, conta } = {}) {
  const params = [unis]; let w = `cc.unidadenegocioid = ANY($1::bigint[]) AND ec.id IS NULL`;
  if (conta) { params.push(conta); w += ` AND cc.id = $${params.length}`; }
  if (de) { params.push(de); w += ` AND eb.datahora >= $${params.length}::date`; }
  if (ate) { params.push(ate); w += ` AND eb.datahora < ($${params.length}::date + interval '1 day')`; }
  return erpQuery(`
    SELECT to_char(eb.datahora,'YYYY-MM-DD') AS data, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
      eb.valor, eb.descricao, eb.numerodocumento, tb.descricao AS tipo
    FROM extratobancario eb
    JOIN contabancaria cb ON cb.id = eb.contabancariaid
    JOIN contacorrente cc ON cc.id = cb.contacorrenteid
    LEFT JOIN extratobancarioconciliacao ec ON ec.extratobancarioid = eb.id
    LEFT JOIN tipomovimentacaoextratobancario tb ON tb.id = eb.tipomovimentacaoextratobancarioid
    WHERE ${w}
    ORDER BY eb.datahora DESC LIMIT 2000`, params);
}

// Índice de conciliação bancária: TODAS as contas de banco (base contabancaria), com a data até a
// qual já foi conciliado (MAX datahora conciliada) e a última linha do extrato — p/ medir atraso.
async function conciliacaoBancariaIndice(unis) {
  return erpQuery(`
    SELECT cc.id AS conta_id, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
      COUNT(eb.id) AS linhas,
      COUNT(eb.id) FILTER (WHERE ec.id IS NULL) AS pendentes,
      to_char(MAX(eb.datahora) FILTER (WHERE ec.id IS NOT NULL),'YYYY-MM-DD') AS conciliado_ate,
      to_char(MAX(eb.datahora),'YYYY-MM-DD') AS ultima_linha
    FROM contabancaria cb
    JOIN contacorrente cc ON cc.id = cb.contacorrenteid AND cc.status='A'
    LEFT JOIN extratobancario eb ON eb.contabancariaid = cb.id
    LEFT JOIN extratobancarioconciliacao ec ON ec.extratobancarioid = eb.id
    WHERE cc.unidadenegocioid = ANY($1::bigint[])
    GROUP BY cc.id, cc.nome, cc.unidadenegocioid
    ORDER BY cc.nome`, [unis]);
}

module.exports = { conciliacaoTempo, lancamentosManuais, lancamentosManuaisPlanos, lancamentosRetroativos, estornosExclusoes, conciliacaoBancaria, conciliacaoBancariaPendentes, conciliacaoBancariaIndice };
