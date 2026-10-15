// estoqueEvolucaoErp.js — evolução do ESTOQUE no tempo (cresceu/diminuiu) e a LINHA que impacta.
// Variação a custo = soma(quantidade × custo) das movimentações do mês (entrada + / saída −).
// O nível de estoque é reconstruído do valor atual descontando as variações futuras.
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const { filtroProdutosComprador, clausulaProdutos } = require('./comprasErp');

const MESNOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

async function evolucaoEstoque(empresaId, { lojaId, compradorId, meses } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  meses = Math.min(24, Math.max(3, Number(meses) || 6));

  // Escopo opcional do comprador (produtos dos grupos/classificações dele).
  let prodFiltro = '', prodParam = [];
  if (compradorId) {
    const filtro = await filtroProdutosComprador(empresaId, compradorId);
    if (!filtro) return { erp: true, semComprador: true, erro: 'Comprador sem grupos/classificações vinculados.' };
    const c = clausulaProdutos(filtro, 'pr');
    prodFiltro = ' AND ' + c.expr; prodParam = c.param || c.params || [];
  }
  const precisaProduto = !!prodFiltro;
  const joinProduto = precisaProduto ? 'JOIN embalagem em ON em.id=me.embalagemid JOIN produto pr ON pr.id=em.produtoid' : '';

  // 1) Valor de estoque ATUAL (a custo médio) — base p/ reconstruir o nível.
  const at = (await erpQuery(`
    SELECT COALESCE(sum(es.estoque * cp.customedio),0)::float8 valor
    FROM estoque es JOIN embalagem em ON em.id=es.embalagemid
      JOIN custoproduto cp ON cp.produtoid=em.produtoid AND cp.unidadenegocioid=es.unidadenegocioid
      ${precisaProduto ? 'JOIN produto pr ON pr.id=em.produtoid' : ''}
    WHERE es.unidadenegocioid = ANY($1::bigint[]) AND es.estoque>0${prodFiltro}`, [unis, ...prodParam]))[0] || {};
  const valorAtual = Math.round(Number(at.valor) || 0);

  // 2) Variação mensal (entrada − saída a custo) nos últimos `meses`.
  const serieRaw = await erpQuery(`
    SELECT to_char(date_trunc('month', me.datahora),'YYYY-MM') mes,
      sum(me.quantidade * COALESCE(me.custo, me.customedio, 0))::float8 net,
      sum(CASE WHEN me.quantidade>0 THEN me.quantidade*COALESCE(me.custo,me.customedio,0) ELSE 0 END)::float8 entrada,
      sum(CASE WHEN me.quantidade<0 THEN -me.quantidade*COALESCE(me.custo,me.customedio,0) ELSE 0 END)::float8 saida
    FROM movimentacaoestoque me ${joinProduto}
    WHERE me.unidadenegocioid = ANY($1::bigint[])
      AND me.datahora >= date_trunc('month', now()) - ($2 || ' months')::interval${prodFiltro}
    GROUP BY 1 ORDER BY 1`, [unis, meses - 1, ...prodParam]);

  // Reconstrói o NÍVEL de estoque ao fim de cada mês: nível(atual)=valorAtual; anteriores = subtrai as variações posteriores.
  const serie = serieRaw.map(r => ({
    mes: r.mes, mesLabel: MESNOMES[Number(r.mes.slice(5, 7)) - 1] + '/' + r.mes.slice(2, 4),
    net: Math.round(Number(r.net) || 0), entrada: Math.round(Number(r.entrada) || 0), saida: Math.round(Number(r.saida) || 0),
  }));
  let acc = valorAtual;
  for (let i = serie.length - 1; i >= 0; i--) { serie[i].nivelFim = Math.round(acc); acc -= serie[i].net; }

  // 3) Quais LINHAS (classificação principal) puxaram no período.
  const linhasRaw = await erpQuery(`
    SELECT COALESCE(cl.nome,'(sem classificação)') linha,
      sum(me.quantidade * COALESCE(me.custo, me.customedio, 0))::float8 net,
      sum(CASE WHEN me.quantidade>0 THEN me.quantidade*COALESCE(me.custo,me.customedio,0) ELSE 0 END)::float8 entrada,
      sum(CASE WHEN me.quantidade<0 THEN -me.quantidade*COALESCE(me.custo,me.customedio,0) ELSE 0 END)::float8 saida
    FROM movimentacaoestoque me
    JOIN embalagem em ON em.id=me.embalagemid
    JOIN produto pr ON pr.id=em.produtoid
    LEFT JOIN LATERAL (SELECT cl.nome FROM classificacaoproduto cp JOIN classificacao cl ON cl.id=cp.classificacaoid
       WHERE cp.produtoid=pr.id AND cl.principal=true ORDER BY cl.profundidade ASC LIMIT 1) cl ON true
    WHERE me.unidadenegocioid = ANY($1::bigint[])
      AND me.datahora >= date_trunc('month', now()) - ($2 || ' months')::interval${prodFiltro}
    GROUP BY 1 HAVING abs(sum(me.quantidade * COALESCE(me.custo, me.customedio, 0))) > 100
    ORDER BY net DESC`, [unis, meses - 1, ...prodParam]);
  const porLinha = linhasRaw.map(r => ({
    linha: (r.linha || '').trim(), net: Math.round(Number(r.net) || 0),
    entrada: Math.round(Number(r.entrada) || 0), saida: Math.round(Number(r.saida) || 0),
  }));

  const netPeriodo = serie.reduce((s, x) => s + x.net, 0);
  const nivelIni = serie.length ? serie[0].nivelFim - serie[0].net : valorAtual;
  return {
    erp: true, meses, valorAtual, netPeriodo,
    variacaoPct: nivelIni > 0 ? Math.round((netPeriodo / nivelIni) * 1000) / 10 : null,
    cresceu: netPeriodo > 0,
    serie,
    subindo: porLinha.filter(l => l.net > 0).slice(0, 8),
    caindo: porLinha.filter(l => l.net < 0).slice(-8).reverse(),
  };
}

module.exports = { evolucaoEstoque };
