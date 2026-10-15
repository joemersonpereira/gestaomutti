// entregaErp.js — módulo Entrega (delivery) a partir do ERP.
// entrega(datahorainicial=enviada, datahorafinal=baixada, status, taxaentrega) → entregaremessa → remessa(entregadorid, unidadenegocioid) → entregador → pessoa.
// Tempo de rota = datahorafinal − datahorainicial (min). status: F=finalizada/entregue, C=cancelada, E/A/D/H=em andamento.
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa, lojasEmpresa } = require('./escopoCompras');

const round = n => Math.round((Number(n) || 0) * 100) / 100;
// base comum: junta entrega ao entregador/loja pela remessa (LEFT — entrega sem remessa ainda conta no total)
const BASE = `FROM entrega e
  LEFT JOIN entregaremessa er ON er.entregaid=e.id
  LEFT JOIN remessa r ON r.id=er.remessaid
  LEFT JOIN entregador ent ON ent.id=r.entregadorid
  LEFT JOIN pessoa p ON p.id=ent.pessoaid`;
const filtroLoja = unis => unis && unis.length ? 'AND r.unidadenegocioid = ANY($3::bigint[])' : '';

async function resumo(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const params = [ini, fim]; const fLoja = lojaId ? filtroLoja(unis) : '';
  if (lojaId) params.push(unis);
  const r = (await erpQuery(`
    SELECT count(DISTINCT e.id) total,
      count(DISTINCT e.id) FILTER (WHERE e.status='F') finalizadas,
      count(DISTINCT e.id) FILTER (WHERE e.status='C') canceladas,
      count(DISTINCT e.id) FILTER (WHERE e.status NOT IN ('F','C')) andamento,
      round(avg(extract(epoch FROM (e.datahorafinal-e.datahorainicial))/60) FILTER (WHERE e.status='F' AND e.datahorafinal IS NOT NULL)::numeric,1) tempo_medio,
      round(sum(e.taxaentrega) FILTER (WHERE e.status='F')::numeric,2) taxa_total,
      round(avg(e.taxaentrega) FILTER (WHERE e.status='F')::numeric,2) taxa_media,
      count(DISTINCT r.entregadorid) entregadores
    ${BASE}
    WHERE e.datahorainicial >= $1::date AND e.datahorainicial < ($2::date + 1) ${fLoja}`, params))[0] || {};
  return {
    ok: true, periodo: { ini, fim },
    total: Number(r.total) || 0, finalizadas: Number(r.finalizadas) || 0, canceladas: Number(r.canceladas) || 0,
    andamento: Number(r.andamento) || 0, tempoMedio: Number(r.tempo_medio) || 0,
    taxaTotal: Number(r.taxa_total) || 0, taxaMedia: Number(r.taxa_media) || 0, entregadores: Number(r.entregadores) || 0,
  };
}

async function porEntregador(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const params = [ini, fim]; const fLoja = lojaId ? filtroLoja(unis) : '';
  if (lojaId) params.push(unis);
  const rows = await erpQuery(`
    SELECT COALESCE(p.nome,'(sem entregador)') entregador, ent.id::text entregador_id,
      count(DISTINCT e.id) entregas,
      count(DISTINCT e.id) FILTER (WHERE e.status='F') finalizadas,
      count(DISTINCT e.id) FILTER (WHERE e.status='C') canceladas,
      round(avg(extract(epoch FROM (e.datahorafinal-e.datahorainicial))/60) FILTER (WHERE e.status='F' AND e.datahorafinal IS NOT NULL)::numeric,0) tempo_medio,
      round(sum(e.taxaentrega) FILTER (WHERE e.status='F')::numeric,2) taxa_total
    ${BASE}
    WHERE e.datahorainicial >= $1::date AND e.datahorainicial < ($2::date + 1) AND r.entregadorid IS NOT NULL ${fLoja}
    GROUP BY p.nome, ent.id ORDER BY entregas DESC`, params);
  return { ok: true, entregadores: rows.map(x => ({
    entregador: x.entregador, entregas: Number(x.entregas) || 0, finalizadas: Number(x.finalizadas) || 0,
    canceladas: Number(x.canceladas) || 0, tempoMedio: Number(x.tempo_medio) || 0, taxaTotal: Number(x.taxa_total) || 0,
  })) };
}

// Distribuição do tempo de rota (enviada→baixada) em faixas de minutos.
async function tempoDistribuicao(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const params = [ini, fim]; const fLoja = lojaId ? filtroLoja(unis) : '';
  if (lojaId) params.push(unis);
  const rows = await erpQuery(`
    SELECT width_bucket(extract(epoch FROM (e.datahorafinal-e.datahorainicial))/60, 0, 150, 5) b, count(*) n
    ${BASE}
    WHERE e.status='F' AND e.datahorafinal IS NOT NULL AND e.datahorainicial >= $1::date AND e.datahorainicial < ($2::date + 1) ${fLoja}
    GROUP BY 1 ORDER BY 1`, params);
  const labels = ['0–30 min', '30–60 min', '60–90 min', '90–120 min', '120–150 min', '+150 min'];
  const faixas = labels.map((l, i) => ({ faixa: l, n: 0 }));
  rows.forEach(r => { const b = Math.min(6, Math.max(1, Number(r.b) || 6)); faixas[b - 1].n += Number(r.n) || 0; });
  return { ok: true, faixas };
}

// Orçamentos de entrega CANCELADOS / DESCARTADOS (entregas que não se concretizaram), por motivo.
// entregacancelamento.motivo: "Descarte de Orçamento" (descartado), "Cancelamento de Orçamento" (cancelado), ou manual.
async function cancelados(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const params = [ini, fim]; const fLoja = lojaId && unis.length ? 'AND o.unidadenegocioid = ANY($3::bigint[])' : '';
  if (lojaId) params.push(unis);
  const rows = await erpQuery(`
    SELECT ec.motivo, count(*) n
    FROM entregacancelamento ec
    JOIN entrega e ON e.id=ec.entregaid
    LEFT JOIN orcamento o ON o.id=e.orcamentoid
    WHERE ec.datahora >= $1::date AND ec.datahora < ($2::date + 1) ${fLoja}
    GROUP BY 1 ORDER BY n DESC`, params);
  const cat = m => /descart/i.test(m) ? 'descartado' : /cancel/i.test(m) ? 'cancelado' : 'manual';
  let descartados = 0, cancelados = 0, manuais = 0;
  const motivos = rows.map(r => {
    const c = cat(r.motivo || ''); const n = Number(r.n) || 0;
    if (c === 'descartado') descartados += n; else if (c === 'cancelado') cancelados += n; else manuais += n;
    return { motivo: (r.motivo || '(sem motivo)').replace(/\s+/g, ' ').trim(), n, categoria: c };
  });
  // agrupa os motivos manuais (muitas variações digitadas)
  const sistema = motivos.filter(m => m.categoria !== 'manual');
  const manualTop = motivos.filter(m => m.categoria === 'manual').slice(0, 12);
  // quem mais descarta/cancela (por usuário)
  const urows = await erpQuery(`
    SELECT COALESCE(p.nome,'(sem usuário)') colaborador, count(*) n
    FROM entregacancelamento ec
    JOIN entrega e ON e.id=ec.entregaid
    LEFT JOIN orcamento o ON o.id=e.orcamentoid
    LEFT JOIN usuario u ON u.id=ec.usuarioid LEFT JOIN pessoa p ON p.id=u.pessoaid
    WHERE ec.datahora >= $1::date AND ec.datahora < ($2::date + 1) ${fLoja}
    GROUP BY 1 ORDER BY n DESC LIMIT 15`, params);
  const porColaborador = urows.map(r => ({ colaborador: r.colaborador, n: Number(r.n) || 0 }));
  return { ok: true, total: descartados + cancelados + manuais, descartados, cancelados, manuais, motivos: [...sistema, ...manualTop], porColaborador };
}

// Vendas por colaborador (vendedor = venda.usuarioid) no período/loja.
async function vendasPorColaborador(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const params = [ini, fim]; const fLoja = lojaId && unis.length ? 'AND v.unidadenegocioid = ANY($3::bigint[])' : '';
  if (lojaId) params.push(unis);
  const rows = await erpQuery(`
    SELECT COALESCE(p.nome,'(sem vendedor)') vendedor, count(*) vendas, sum(v.valortotal)::float8 valor
    FROM venda v LEFT JOIN usuario u ON u.id=v.usuarioid LEFT JOIN pessoa p ON p.id=u.pessoaid
    WHERE v.status='F' AND v.datahorafechamento >= $1::date AND v.datahorafechamento < ($2::date + 1) ${fLoja}
    GROUP BY 1 ORDER BY valor DESC`, params);
  const lista = rows.map(r => { const vendas = Number(r.vendas) || 0, valor = round(r.valor); return { vendedor: r.vendedor, vendas, valor, ticket: vendas ? round(valor / vendas) : 0 }; });
  const totalValor = round(lista.reduce((a, x) => a + x.valor, 0)); const totalVendas = lista.reduce((a, x) => a + x.vendas, 0);
  return { ok: true, colaboradores: lista, totalValor, totalVendas };
}

// Vendas por entrega: valor acumulado vendido via delivery + vendedores + baixadas por operador de caixa + canceladas no caixa.
// Liga entrega→venda por orcamentoid. "Baixou" = entrega.usuariofinalid (operador de caixa que finalizou).
async function vendasEntrega(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const fLojaV = lojaId && unis.length ? 'AND v.unidadenegocioid = ANY($3::bigint[])' : '';
  const pV = lojaId ? [ini, fim, unis] : [ini, fim];
  const [tot, vend, caixaFech, caixa, canc] = await Promise.all([
    // total vendido via entrega (venda fechada ligada a uma entrega)
    erpQuery(`SELECT count(DISTINCT v.id) entregas, sum(v.valortotal)::float8 valor
      FROM venda v JOIN entrega e ON e.orcamentoid=v.orcamentoid
      WHERE v.status='F' AND v.datahorafechamento >= $1::date AND v.datahorafechamento < ($2::date + 1) ${fLojaV}`, pV),
    // por VENDEDOR de verdade = quem criou o orçamento (orcamento.usuarioid) — o drill-down principal
    erpQuery(`SELECT COALESCE(p.nome,'—') vendedor, count(DISTINCT v.id) entregas, sum(v.valortotal)::float8 valor
      FROM venda v JOIN entrega e ON e.orcamentoid=v.orcamentoid
      JOIN orcamento o ON o.id=v.orcamentoid
      LEFT JOIN usuario u ON u.id=o.usuarioid LEFT JOIN pessoa p ON p.id=u.pessoaid
      WHERE v.status='F' AND v.datahorafechamento >= $1::date AND v.datahorafechamento < ($2::date + 1) ${fLojaV}
      GROUP BY 1 ORDER BY valor DESC`, pV),
    // por OPERADOR DE CAIXA que fechou a venda (venda.usuarioid) — mantém o dado do caixa
    erpQuery(`SELECT COALESCE(p.nome,'—') operador, count(DISTINCT v.id) entregas, sum(v.valortotal)::float8 valor
      FROM venda v JOIN entrega e ON e.orcamentoid=v.orcamentoid
      LEFT JOIN usuario u ON u.id=v.usuarioid LEFT JOIN pessoa p ON p.id=u.pessoaid
      WHERE v.status='F' AND v.datahorafechamento >= $1::date AND v.datahorafechamento < ($2::date + 1) ${fLojaV}
      GROUP BY 1 ORDER BY valor DESC`, pV),
    // BAIXADAS por operador de caixa (entrega.usuariofinalid) + valor da venda ligada
    erpQuery(`SELECT COALESCE(p.nome,'—') operador, count(DISTINCT e.id) baixadas, sum(v.valortotal)::float8 valor,
        round(avg(extract(epoch FROM (e.datahorafinal-e.datahorainicial))/60)::numeric,0) tempo_medio
      FROM entrega e
      LEFT JOIN usuario u ON u.id=e.usuariofinalid LEFT JOIN pessoa p ON p.id=u.pessoaid
      LEFT JOIN venda v ON v.orcamentoid=e.orcamentoid AND v.status='F'
      WHERE e.status='F' AND e.datahorafinal >= $1::date AND e.datahorafinal < ($2::date + 1)
        ${lojaId && unis.length ? 'AND EXISTS (SELECT 1 FROM orcamento o WHERE o.id=e.orcamentoid AND o.unidadenegocioid = ANY($3::bigint[]))' : ''}
      GROUP BY 1 ORDER BY baixadas DESC`, pV),
    // CANCELADAS no caixa (cupom fechado cancelado, autorizado por gerente) que eram entrega
    erpQuery(`SELECT count(DISTINCT v.id) qtd, sum(v.valortotal)::float8 valor
      FROM venda v JOIN entrega e ON e.orcamentoid=v.orcamentoid
      WHERE v.status='C' AND v.datahoraabertura >= $1::date AND v.datahoraabertura < ($2::date + 1) ${fLojaV}`, pV),
  ]);
  return {
    ok: true,
    totalVendido: round((tot[0]?.valor) || 0), entregas: Number(tot[0]?.entregas) || 0,
    vendedores: vend.map(r => ({ vendedor: r.vendedor, entregas: Number(r.entregas) || 0, valor: round(r.valor) })),
    operadoresFechamento: caixaFech.map(r => ({ operador: r.operador, entregas: Number(r.entregas) || 0, valor: round(r.valor) })),
    porCaixa: caixa.map(r => ({ operador: r.operador, baixadas: Number(r.baixadas) || 0, valor: round(r.valor), tempoMedio: Number(r.tempo_medio) || 0 })),
    canceladasCaixa: { qtd: Number(canc[0]?.qtd) || 0, valor: round(canc[0]?.valor) },
  };
}

function lojas(empresaId) { return lojasEmpresa(empresaId); }

module.exports = { resumo, porEntregador, tempoDistribuicao, cancelados, vendasPorColaborador, vendasEntrega, lojas };
