// financeiroErp.js — Financeiro (DFC/DRE base). Fatia 1: despesas por plano de contas (contapagar),
// geral e por loja, com drill-down nos lançamentos e análise de reajuste por fornecedor entre períodos.
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa, planoCmvIds } = require('./escopoCompras');
const db = require('../db/connection');
const dfcImport = require('./dfcImport');
const dlpDfc = require('./dlpDfc');
const tituloGrupo = k => String(k || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); // "DESPESAS COM PESSOAL" → "Despesas Com Pessoal"

function lojaDe(uni) {
  const r = db.prepare('SELECT nome FROM lojas WHERE erp_unidadenegocio_id=?').get(uni);
  return r ? r.nome : String(uni);
}
// Faixa padrão = mês corrente.
function faixaMesAtual() {
  const h = new Date(); const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fimD = new Date(h.getFullYear(), h.getMonth() + 1, 1);
  const fim = `${fimD.getFullYear()}-${String(fimD.getMonth() + 1).padStart(2, '0')}-01`;
  return [ini, fim];
}

// DFC de despesas: contapagar (por vencimento) agrupado por plano de contas. Receita = vendas (à parte).
async function dfcDespesas(empresaId, { ini, fim, lojaId, incluirCmv = true } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  if (!ini || !fim) [ini, fim] = faixaMesAtual();
  const cmvIds = incluirCmv ? [] : await planoCmvIds();
  const filtroCmv = cmvIds.length ? 'AND cp.planocontasid <> ALL($4::bigint[])' : '';
  const params = [unis, ini, fim]; if (filtroCmv) params.push(cmvIds);

  // Despesas por plano
  const linhas = await erpQuery(`
    SELECT pl.id plano_id, pl.nome, pl.caminho, split_part(pl.caminho,' > ',2) grupo,
      sum(cp.valor) valor, count(*) contas
    FROM contapagar cp JOIN planocontas pl ON pl.id = cp.planocontasid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C'
      AND cp.datavencimento >= $2::date AND cp.datavencimento < $3::date ${filtroCmv}
    GROUP BY pl.id, pl.nome, pl.caminho
    ORDER BY valor DESC`, params);

  // Receita (venda) do período p/ base de % (regime competência simplificado)
  const rec = (await erpQuery(`
    SELECT COALESCE(sum(valortotal),0) v FROM venda
    WHERE status='F' AND unidadenegocioid = ANY($1::bigint[]) AND datahorafechamento >= $2::date AND datahorafechamento < $3::date`,
    [unis, ini, fim]))[0] || {};
  const receita = Number(rec.v) || 0;

  const despesas = linhas.map(r => ({
    planoId: Number(r.plano_id), nome: r.nome, grupo: r.grupo || r.nome,
    valor: Number(r.valor) || 0, contas: Number(r.contas) || 0,
    pctReceita: receita ? Math.round((Number(r.valor) / receita) * 1000) / 10 : null,
    cmv: /CMV/i.test(r.nome),
  }));
  const totalDespesa = despesas.reduce((a, d) => a + d.valor, 0);
  return {
    erp: true, ini, fim, receita,
    despesas, totalDespesa,
    resultado: receita - totalDespesa,
  };
}

// Drill-down: lançamentos de um plano de contas no período.
async function lancamentosPlano(empresaId, { planoId, ini, fim, lojaId } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !planoId) return { erp: true, lancamentos: [] };
  if (!ini || !fim) [ini, fim] = faixaMesAtual();
  const rows = await erpQuery(`
    SELECT cp.id, cp.descricao, cp.numerodocumento, cp.datavencimento, cp.valor, cp.status,
      cp.unidadenegocioid uni, COALESCE(p.nome,'—') fornecedor
    FROM contapagar cp LEFT JOIN pessoa p ON p.id = cp.pessoaid
    WHERE cp.planocontasid = $1 AND cp.unidadenegocioid = ANY($2::bigint[]) AND cp.status<>'C'
      AND cp.datavencimento >= $3::date AND cp.datavencimento < $4::date
    ORDER BY cp.datavencimento, cp.valor DESC LIMIT 500`, [planoId, unis, ini, fim]);
  return {
    erp: true, lancamentos: rows.map(r => ({
      id: Number(r.id), descricao: r.descricao, documento: r.numerodocumento,
      vencimento: r.datavencimento, valor: Number(r.valor) || 0,
      status: r.status === 'B' ? 'Pago' : r.status === 'A' ? 'Em aberto' : r.status,
      fornecedor: r.fornecedor, loja: lojaDe(Number(r.uni)),
    })),
  };
}

// Análise de reajuste: por fornecedor (+plano), compara média mensal de dois períodos. Exclui CMV.
async function reajusteDespesas(empresaId, { iniA, fimA, iniB, fimB, lojaId, minVar = 5 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, itens: [] };
  const cmvIds = await planoCmvIds();
  const filtroCmv = cmvIds.length ? 'AND cp.planocontasid <> ALL($6::bigint[])' : '';
  const params = [unis, iniA, fimA, iniB, fimB]; if (filtroCmv) params.push(cmvIds);
  // meses de cada período (p/ média mensal)
  const meses = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / (30 * 864e5)));
  const mA = meses(iniA, fimA), mB = meses(iniB, fimB);

  const rows = await erpQuery(`
    SELECT cp.pessoaid, COALESCE(p.nome,'—') fornecedor, cp.planocontasid, pl.nome plano,
      sum(cp.valor) FILTER (WHERE cp.datavencimento >= $2::date AND cp.datavencimento < $3::date) valorA,
      sum(cp.valor) FILTER (WHERE cp.datavencimento >= $4::date AND cp.datavencimento < $5::date) valorB
    FROM contapagar cp
    LEFT JOIN pessoa p ON p.id = cp.pessoaid
    JOIN planocontas pl ON pl.id = cp.planocontasid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C' ${filtroCmv}
      AND cp.datavencimento >= $2::date AND cp.datavencimento < $5::date
    GROUP BY cp.pessoaid, p.nome, cp.planocontasid, pl.nome`, params);

  const itens = rows.map(r => {
    const mediaA = (Number(r.valora) || 0) / mA, mediaB = (Number(r.valorb) || 0) / mB;
    const variacao = mediaA > 0 ? Math.round(((mediaB - mediaA) / mediaA) * 1000) / 10 : (mediaB > 0 ? null : 0);
    return { fornecedor: r.fornecedor, plano: r.plano, mediaA: Math.round(mediaA), mediaB: Math.round(mediaB), variacao, novo: mediaA === 0 && mediaB > 0 };
  }).filter(x => x.mediaA > 0 && x.mediaB > 0 && x.variacao != null && Math.abs(x.variacao) >= minVar)
    .sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));
  return { erp: true, periodoA: [iniA, fimA], periodoB: [iniB, fimB], itens };
}

// ── Fluxo de caixa (receitas × despesas por categoria e por período) ──────────
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Gera os "baldes" de período. granularidade: semana|mes|trimestre|semestre.
// Retorna nHist períodos realizados (terminando no atual) + nProj projetados.
function gerarBuckets(granularidade, nHist, nProj) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const buckets = [];
  const add = (ini, fim, label) => buckets.push({ ini, fim, label, iniISO: iso(ini), fimISO: iso(fim) });
  const total = nHist + nProj;
  if (granularidade === 'semana') {
    // Semana do Joe: sábado → sexta (a receita de sábado cai na segunda seguinte, então ficam na mesma semana).
    const base = new Date(hoje); const dow = (base.getDay() + 1) % 7; base.setDate(base.getDate() - dow); // sábado desta semana
    for (let k = -(nHist - 1); k <= nProj; k++) {
      const ini = new Date(base); ini.setDate(base.getDate() + k * 7);
      const fim = new Date(ini); fim.setDate(ini.getDate() + 7);
      const fimIncl = new Date(ini); fimIncl.setDate(ini.getDate() + 6);
      add(ini, fim, `${pad(ini.getDate())}/${pad(ini.getMonth() + 1)}–${pad(fimIncl.getDate())}/${pad(fimIncl.getMonth() + 1)}`);
    }
  } else if (granularidade === 'trimestre') {
    const q = Math.floor(hoje.getMonth() / 3);
    for (let k = -(nHist - 1); k <= nProj; k++) {
      const ini = new Date(hoje.getFullYear(), (q + k) * 3, 1); const fim = new Date(ini.getFullYear(), ini.getMonth() + 3, 1);
      add(ini, fim, `T${Math.floor(ini.getMonth() / 3) + 1}/${String(ini.getFullYear()).slice(2)}`);
    }
  } else if (granularidade === 'semestre') {
    const semAtual = hoje.getMonth() < 6 ? 0 : 1;
    for (let k = -(nHist - 1); k <= nProj; k++) {
      const ini = new Date(hoje.getFullYear(), (semAtual + k) * 6, 1); const fim = new Date(ini.getFullYear(), ini.getMonth() + 6, 1);
      add(ini, fim, `${ini.getMonth() < 6 ? '1º' : '2º'}sem/${String(ini.getFullYear()).slice(2)}`);
    }
  } else { // mes
    for (let k = -(nHist - 1); k <= nProj; k++) {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1); const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
      add(ini, fim, `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][ini.getMonth()]}/${String(ini.getFullYear()).slice(2)}`);
    }
  }
  const agora = new Date();
  buckets.forEach(b => { b.projetado = b.ini > agora; });
  return buckets;
}
const idxBucket = (buckets, d) => buckets.findIndex(b => d >= b.ini && d < b.fim);

async function fluxoCaixa(empresaId, { lojaId, granularidade = 'mes', nHist = 6, nProj = 3 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const buckets = gerarBuckets(granularidade, nHist, nProj);
  const ini = buckets[0].iniISO, fim = buckets[buckets.length - 1].fimISO;
  // Semana começa no SÁBADO (desloca +2d, trunca na semana ISO/segunda, volta -2d); senão, mês.
  const trunc = col => granularidade === 'semana'
    ? `(date_trunc('week', ${col} + interval '2 days') - interval '2 days')`
    : `date_trunc('month', ${col})`;
  const cmvIds = await planoCmvIds();

  // RECEITAS por forma de pagamento (regime de caixa: data do pagamento). Exclui CREDIÁRIO (a venda a
  // prazo não é caixa; o crediário entra por linha própria = recebido, abaixo).
  const rec = await erpQuery(`
    SELECT ${trunc('pv.datahora')} p, fp.nome cat, sum(pv.valor) v
    FROM pagamentovenda pv JOIN venda v ON v.id=pv.vendaid JOIN formapagamento fp ON fp.id=pv.formapagamentoid
    WHERE v.status='F' AND pv.unidadenegocioid = ANY($1::bigint[]) AND pv.datahora >= $2::date AND pv.datahora < $3::date
      AND fp.nome NOT ILIKE '%credi%'
    GROUP BY 1,2`, [unis, ini, fim]);
  // CREDIÁRIO — PREVISÃO = a receber (não cancelado, por VENCIMENTO); REALIZADO = recebido (status B, por DATA DE FECHAMENTO).
  const crediPrev = await erpQuery(`
    SELECT ${trunc('cr.datavencimento')} p, sum(cr.valor) v FROM crediarioreceber cr
    WHERE cr.unidadenegocioid = ANY($1::bigint[]) AND cr.status<>'C'
      AND cr.datavencimento >= $2::date AND cr.datavencimento < $3::date GROUP BY 1`, [unis, ini, fim]);
  const crediReal = await erpQuery(`
    SELECT ${trunc('cr.datafechamento')} p, sum(cr.valor) v FROM crediarioreceber cr
    WHERE cr.unidadenegocioid = ANY($1::bigint[]) AND cr.status='B' AND cr.datafechamento IS NOT NULL
      AND cr.datafechamento >= $2::date AND cr.datafechamento < $3::date GROUP BY 1`, [unis, ini, fim]);
  // CARTÃO — PREVISÃO = a receber da semana (cartaoreceber não cancelado, por VENCIMENTO). O próprio sistema já tem.
  const cartaoPrev = await erpQuery(`
    SELECT ${trunc('cr.datavencimento')} p, sum(cr.valor) v FROM cartaoreceber cr
    WHERE cr.unidadenegocioid = ANY($1::bigint[]) AND cr.status<>'C'
      AND cr.datavencimento >= $2::date AND cr.datavencimento < $3::date GROUP BY 1`, [unis, ini, fim]);
  // DESPESAS por grupo (nível 2) + plano de contas (folha), separando CMV.
  // DESPESAS — PREVISÃO = lançado a pagar (por VENCIMENTO, status A+B); REALIZADO = pago (por DATA DO PAGAMENTO, status B).
  const despPrev = await erpQuery(`
    SELECT ${trunc('cp.datavencimento')} p, split_part(pl.caminho,' > ',2) grupo, pl.nome plano,
      (cp.planocontasid = ANY($4::bigint[])) is_cmv, sum(cp.valor) v
    FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C'
      AND cp.datavencimento >= $2::date AND cp.datavencimento < $3::date AND pl.caminho LIKE '2 -%'
    GROUP BY 1,2,3,4`, [unis, ini, fim, cmvIds.length ? cmvIds : [0]]);
  const despReal = await erpQuery(`
    SELECT ${trunc('pg.datahora')} p, split_part(pl.caminho,' > ',2) grupo, pl.nome plano,
      (cp.planocontasid = ANY($4::bigint[])) is_cmv, sum(cp.valor) v
    FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
      JOIN pgtocontapagar pg ON pg.id=cp.pgtocontapagarid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status='B'
      AND pg.datahora >= $2::date AND pg.datahora < $3::date AND pl.caminho LIKE '2 -%'
    GROUP BY 1,2,3,4`, [unis, ini, fim, cmvIds.length ? cmvIds : [0]]);
  // LANÇAMENTOS FINANCEIROS (tela "Lançamento Financeiro" + EXTRATO BANCÁRIO do A7): origem 'A' (manual) e
  // 'F' (extrato), SEM vínculo com contapagar (senão duplica pagamento). EXCLUI a receita operacional 1.01
  // (baixa de cartão/venda — já contada em pagamentovenda) e "saldo inicial" (não é movimento). Entram no REALIZADO.
  const lancFin = await erpQuery(`
    SELECT ${trunc('lf.datahora')} p, split_part(pl.caminho,' > ',1) n1, split_part(pl.caminho,' > ',2) grupo, sum(lf.valor) v
    FROM lancamentofinanceiro lf JOIN planocontas pl ON pl.id=lf.planocontasid
    WHERE lf.unidadenegocioid = ANY($1::bigint[]) AND lf.origem IN ('A','F') AND lf.origemcontapagarid IS NULL
      AND split_part(pl.caminho,' > ',2) NOT ILIKE '1.01%' AND pl.nome NOT ILIKE '%saldo inicial%'
      AND lf.datahora >= $2::date AND lf.datahora < $3::date
    GROUP BY 1,2,3`, [unis, ini, fim]);

  const nb = buckets.length;
  const idxReal = buckets.map((b, i) => (!b.projetado ? i : -1)).filter(i => i >= 0);
  // Média dos períodos REALIZADOS (base da projeção/previsão).
  const mediaReal = (arr) => { const base = idxReal.map(i => arr[i]).filter(v => v > 0); return base.length ? base.reduce((a, v) => a + v, 0) / base.length : 0; };
  const projetarArr = (arr) => {
    const media = mediaReal(arr);
    buckets.forEach((b, i) => { if (b.projetado) arr[i] = Math.round(media); });
    return arr;
  };
  // Previsão por período = a média (projeção) aplicada a TODOS os períodos, p/ comparar com o realizado.
  const previstoArr = (arr) => { const m = Math.round(mediaReal(arr)); return buckets.map(() => m); };

  const fillArr = (rows) => { const a = Array(nb).fill(0); for (const r of rows) { const bi = idxBucket(buckets, new Date(r.p)); if (bi >= 0) a[bi] += Number(r.v) || 0; } return a; };

  // Receitas de caixa (cartão/dinheiro/pix/...): PREVISÃO = projeção (média); REALIZADO = recebido.
  const receitas = new Map();
  for (const r of rec) { const c = r.cat || 'Outros'; if (!receitas.has(c)) receitas.set(c, Array(nb).fill(0)); const bi = idxBucket(buckets, new Date(r.p)); if (bi >= 0) receitas.get(c)[bi] += Number(r.v) || 0; }
  // Receitas dos lançamentos manuais (caminho '1 -') → linha própria "Receitas manuais (caixa)".
  for (const r of lancFin) { if (!/^1\s*-/.test(r.n1)) continue; const c = 'Receitas manuais (caixa)'; if (!receitas.has(c)) receitas.set(c, Array(nb).fill(0)); const bi = idxBucket(buckets, new Date(r.p)); if (bi >= 0) receitas.get(c)[bi] += Number(r.v) || 0; }
  const receitasL = [...receitas.entries()].map(([categoria, arr]) => { const previsto = previstoArr(arr); return { categoria, previsto, valores: projetarArr(arr).map(Math.round), total: Math.round(arr.reduce((a, v) => a + v, 0)) }; });
  // Crediário como linha própria: PREVISÃO = a receber (vencimento); REALIZADO = recebido (fechamento).
  const crediP = fillArr(crediPrev).map(Math.round), crediR = fillArr(crediReal).map(Math.round);
  if (crediP.some(v => v) || crediR.some(v => v)) receitasL.push({ categoria: 'Crediário (recebido)', previsto: crediP, valores: crediR, total: crediR.reduce((a, v) => a + v, 0) });

  // CARTÃO: previsão = a receber da semana (sistema). Sobrescreve a média e fica FORA do rateio do arquivo.
  const cartaoPArr = fillArr(cartaoPrev).map(Math.round);
  const lCartao = receitasL.find(l => /cart/i.test(l.categoria));
  if (lCartao && cartaoPArr.some(v => v)) lCartao.previsto = cartaoPArr;

  // PREVISÃO de vendas do ANO ANTERIOR (arquivo "Previsão vendas big"): substitui a projeção (média)
  // das linhas de caixa (cartão/dinheiro/pix/...). Deslocada 1 ano (~364 dias) e rateada pela fatia
  // histórica de cada forma. É da REDE — só aplica quando NÃO há filtro de loja.
  try {
    if (!lojaId) {
      const shift = (iso, dias) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10); };
      const semanaContem = db.prepare('SELECT valor FROM previsao_vendas WHERE empresa_id=? AND semana_ini<=? AND semana_fim>=? ORDER BY semana_ini LIMIT 1');
      const somaMes = db.prepare('SELECT COALESCE(sum(valor),0) v FROM previsao_vendas WHERE empresa_id=? AND semana_ini>=? AND semana_ini<?');
      const fileTot = buckets.map(b => {
        if (granularidade === 'semana') { const r = semanaContem.get(empresaId, shift(b.iniISO, 364), shift(b.iniISO, 364)); return r ? Number(r.valor) : 0; }
        return Number(somaMes.get(empresaId, shift(b.iniISO, 364), shift(b.fimISO, 364)).v) || 0;
      });
      if (fileTot.some(v => v > 0)) {
        const cash = receitasL.filter(l => !/credi/i.test(l.categoria) && !/cart/i.test(l.categoria));
        const somaMedias = cash.reduce((a, l) => a + (l.previsto[0] || 0), 0) || 1;
        cash.forEach(l => { const share = (l.previsto[0] || 0) / somaMedias; l.previsto = fileTot.map(t => t > 0 ? Math.round(t * share) : (l.previsto[0] || 0)); });
      }
    }
  } catch { /* sem arquivo de previsão → mantém a projeção por média */ }

  receitasL.sort((a, b) => b.total - a.total);

  // Despesas hierárquicas: grupo → planos. PREVISÃO = lançado a pagar (vencimento); REALIZADO = pago (pagamento).
  const grupos = new Map(); // grupo -> Map(plano -> { prev, real })
  const accDesp = (rows, campo) => { for (const r of rows) {
    const g = r.is_cmv ? 'CMV / Compras' : (r.grupo || 'Outras');
    const plano = r.is_cmv ? 'CMV (compras)' : (r.plano || '—');
    if (!grupos.has(g)) grupos.set(g, new Map());
    const fmap = grupos.get(g);
    if (!fmap.has(plano)) fmap.set(plano, { prev: Array(nb).fill(0), real: Array(nb).fill(0) });
    const bi = idxBucket(buckets, new Date(r.p)); if (bi >= 0) fmap.get(plano)[campo][bi] += Number(r.v) || 0;
  } };
  accDesp(despPrev, 'prev'); accDesp(despReal, 'real');
  // Despesas dos lançamentos manuais (caminho '2 -') → REALIZADO, no grupo correspondente (plano "Lançamentos manuais").
  for (const r of lancFin) {
    if (!/^2\s*-/.test(r.n1)) continue;
    const g = r.grupo || 'Outras', plano = 'Lançamentos manuais (caixa)';
    if (!grupos.has(g)) grupos.set(g, new Map());
    const fmap = grupos.get(g);
    if (!fmap.has(plano)) fmap.set(plano, { prev: Array(nb).fill(0), real: Array(nb).fill(0) });
    const bi = idxBucket(buckets, new Date(r.p)); if (bi >= 0) fmap.get(plano).real[bi] += -(Number(r.v) || 0); // saída vem negativa
  }
  const despesasL = [...grupos.entries()].map(([categoria, fmap]) => {
    const filhos = [...fmap.entries()].map(([plano, o]) => ({ plano, previsto: o.prev.map(Math.round), valores: o.real.map(Math.round), total: Math.round(o.real.reduce((a, v) => a + v, 0)) })).sort((a, b) => b.total - a.total);
    const valores = buckets.map((_, i) => filhos.reduce((a, f) => a + f.valores[i], 0));
    const previsto = buckets.map((_, i) => filhos.reduce((a, f) => a + f.previsto[i], 0));
    return { categoria, previsto, valores, total: valores.reduce((a, v) => a + v, 0), filhos };
  }).sort((a, b) => b.total - a.total);

  // PREVISÃO 2026 pelo arquivo DRE 2025 (migration 188) — deslocado mês a mês, rateado por dia. SÓ na REDE
  // (arquivo é do grupo, sem Farma Rocha → ela fica 0). Substitui a média/arquivo-de-vendas nas linhas que casam.
  if (!lojaId) {
    try {
      const dreRows = db.prepare('SELECT tipo,chave,mes,valor FROM previsao_dre WHERE empresa_id=?').all(empresaId);
      if (dreRows.length) {
        const dre = { receita: {}, despesa: {} };
        for (const r of dreRows) { (dre[r.tipo] || (dre[r.tipo] = {})); (dre[r.tipo][r.chave] || (dre[r.tipo][r.chave] = {})); dre[r.tipo][r.chave][r.mes] = Number(r.valor) || 0; }
        const dim = (y, m) => new Date(y, m, 0).getDate();
        const previstoDre = (tipo, chave) => {
          const mm = dre[tipo] && dre[tipo][chave]; if (!mm) return null;
          return buckets.map(b => { let v = 0; for (let x = new Date(b.iniISO + 'T00:00:00'), fim = new Date(b.fimISO + 'T00:00:00'); x < fim; x.setDate(x.getDate() + 1)) v += (mm[x.getMonth() + 1] || 0) / dim(x.getFullYear(), x.getMonth() + 1); return Math.round(v); });
        };
        const nrm = s => String(s || '').replace(/^\s*[\d.]+\s*-\s*/, '').replace(/\(\s*[-+]\s*\)\s*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
        const recKey = c => { const u = nrm(c); if (/CART/.test(u)) return 'CARTAO'; if (/PIX/.test(u)) return 'PIX'; if (/DINH/.test(u)) return 'DINHEIRO'; if (/PBM|POPULAR/.test(u)) return 'PBM'; if (/CONV|CREDI/.test(u)) return 'CONVENIO'; return null; };
        for (const l of receitasL) { const k = recKey(l.categoria); if (k === 'CARTAO') continue; /* Cartão fica com "a receber do sistema" */ const a = k && previstoDre('receita', k); if (a) l.previsto = a; }
        for (const l of despesasL) { let k = nrm(l.categoria); if (/CMV|COMPRAS|FORNECEDOR/.test(k)) k = 'FORNECEDORES PAGOS'; const a = previstoDre('despesa', k); if (a) l.previsto = a; }
      }
    } catch { /* sem tabela previsao_dre → mantém a previsão anterior */ }
  }

  const periodos = buckets.map(b => ({ label: b.label, ini: b.iniISO, fim: b.fimISO, projetado: b.projetado }));

  // Injeta JANEIRO/2026 (regime caixa, da planilha) como 1ª coluna — o ERP não tem janeiro (venda só desde 29/01).
  // Só injeta janeiro quando a janela pedida realmente retrocede até janeiro (evita jan/26 aparecer no mês atual).
  if (granularidade === 'mes' && buckets[0].iniISO <= '2026-01-31') {
    const jan = dfcImport.resumoMes(empresaId, 2026, 1);
    if (jan.has && !periodos.some(p => p.ini <= '2026-01-31' && p.fim > '2026-01-01')) {
      periodos.unshift({ label: 'jan/26', ini: '2026-01-01', fim: '2026-02-01', projetado: false, planilha: true });
      const R = jan.receitas, D = new Map(jan.despesas);
      const recUsadas = new Set();
      receitasL.forEach(row => { const k = dfcImport.chaveReceita(row.categoria); const v = k ? (R.get(k) || 0) : 0; if (k && R.has(k)) recUsadas.add(k); row.valores.unshift(Math.round(v)); });
      for (const [k, v] of R) if (!recUsadas.has(k) && v > 0) { const arr = Array(periodos.length).fill(0); arr[0] = Math.round(v); receitasL.push({ categoria: dfcImport.LABEL_REC[k] || tituloGrupo(k), valores: arr, total: Math.round(v) }); }
      const despUsadas = new Set();
      despesasL.forEach(row => {
        const key = dfcImport.normGrupo(row.categoria);
        const v = D.get(key) || 0; if (D.has(key)) despUsadas.add(key);
        row.valores.unshift(Math.round(v));
        row.filhos.forEach(f => f.valores.unshift(0));
        if (v) row.filhos.unshift({ plano: 'Janeiro (planilha)', valores: [Math.round(v), ...Array(periodos.length - 1).fill(0)], total: Math.round(v) });
      });
      for (const [k, v] of D) if (!despUsadas.has(k) && v > 0) {
        // Compras de janeiro (FORNECEDORES PAGOS) entram na linha "CMV / Compras" dos outros meses, se ninguém a reivindicou.
        if (k === 'FORNECEDORES PAGOS') {
          const cmv = despesasL.find(g => /CMV|COMPRAS/.test(dfcImport.normGrupo(g.categoria)));
          if (cmv) { cmv.valores[0] = (cmv.valores[0] || 0) + Math.round(v); cmv.filhos.unshift({ plano: 'Compras jan (planilha)', valores: [Math.round(v), ...Array(periodos.length - 1).fill(0)], total: Math.round(v) }); continue; }
        }
        const arr = Array(periodos.length).fill(0); arr[0] = Math.round(v);
        despesasL.push({ categoria: tituloGrupo(k), valores: arr, total: Math.round(v), filhos: [{ plano: 'Janeiro (planilha)', valores: arr.slice(), total: Math.round(v) }] });
      }
      const somaArr = a => a.reduce((x, v) => x + v, 0);
      receitasL.forEach(r => { r.total = somaArr(r.valores); });
      despesasL.forEach(g => { g.filhos.forEach(f => { f.total = somaArr(f.valores); }); g.total = somaArr(g.valores); });
      receitasL.sort((a, b) => b.total - a.total); despesasL.sort((a, b) => b.total - a.total);
    }
  }

  // Normaliza o `previsto` p/ ter o MESMO tamanho de `valores` (a injeção de janeiro dá unshift só em valores).
  // Onde faltar (frente = janeiro), usa o próprio realizado (previsão = realizado naquele mês da planilha).
  const fixPrev = (line) => {
    if (!Array.isArray(line.previsto)) line.previsto = line.valores.slice();
    const faltam = line.valores.length - line.previsto.length;
    if (faltam > 0) line.previsto = [...line.valores.slice(0, faltam), ...line.previsto];
    else if (faltam < 0) line.previsto = line.previsto.slice(-line.valores.length);
  };
  receitasL.forEach(fixPrev);
  despesasL.forEach(g => { fixPrev(g); (g.filhos || []).forEach(fixPrev); });

  const totalReceita = periodos.map((_, i) => receitasL.reduce((a, l) => a + (l.valores[i] || 0), 0));
  const totalDespesa = periodos.map((_, i) => despesasL.reduce((a, l) => a + (l.valores[i] || 0), 0));
  const saldo = periodos.map((_, i) => totalReceita[i] - totalDespesa[i]);
  const totalReceitaPrev = periodos.map((_, i) => receitasL.reduce((a, l) => a + (l.previsto[i] || 0), 0));
  const totalDespesaPrev = periodos.map((_, i) => despesasL.reduce((a, l) => a + (l.previsto[i] || 0), 0));
  const saldoPrev = periodos.map((_, i) => totalReceitaPrev[i] - totalDespesaPrev[i]);

  return { erp: true, granularidade, periodos, receitas: receitasL, despesas: despesasL, totalReceita, totalDespesa, saldo, totalReceitaPrev, totalDespesaPrev, saldoPrev };
}

// Drill-down por grupo de plano (nível 2) num intervalo — lançamentos.
async function lancamentosGrupo(empresaId, { grupo, ini, fim, lojaId, base } = {}) {
  if (!habilitado() || !grupo) return { erp: true, lancamentos: [] };
  const unis = unisEmpresa(empresaId, lojaId);
  // "CMV / Compras" é um grupo sintético (planos marcados como CMV) — filtra pelos IDs, não pelo nome do grupo.
  const ehCmv = /CMV/i.test(grupo);
  const cmvIds = ehCmv ? await planoCmvIds() : [];
  const filtroGrupo = ehCmv ? `cp.planocontasid = ANY($4::bigint[])` : `split_part(pl.caminho,' > ',2) = $4`;
  const p4 = ehCmv ? (cmvIds.length ? cmvIds : [0]) : grupo;
  // base da data: 'emissao' (competência, p/ Eficiência/DRE) ou 'vencimento' (caixa, p/ Fluxo — padrão).
  const dataCol = base === 'emissao' ? 'cp.dataemissao' : 'cp.datavencimento';
  const rows = await erpQuery(`
    SELECT cp.id, cp.descricao, cp.datavencimento, cp.valor, cp.status, cp.unidadenegocioid uni,
      pl.nome plano, COALESCE(p.nome,'—') fornecedor
    FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid LEFT JOIN pessoa p ON p.id=cp.pessoaid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C'
      AND ${dataCol} >= $2::date AND ${dataCol} < $3::date
      AND ${filtroGrupo}
    ORDER BY cp.valor DESC LIMIT 400`, [unis, ini, fim, p4]);
  return { erp: true, lancamentos: rows.map(r => ({
    id: Number(r.id), descricao: r.descricao, plano: r.plano, vencimento: r.datavencimento,
    valor: Number(r.valor) || 0, status: r.status === 'B' ? 'Pago' : r.status === 'A' ? 'Em aberto' : r.status,
    fornecedor: r.fornecedor, loja: lojaDe(Number(r.uni)),
  })) };
}

// Drill de uma LINHA do DRE×DFC (soma de vários grupos por classe). lado 'dre' = competência (emissão, A+B);
// lado 'dfc' = caixa (pago, por vencimento). linha: variavel|fixa|nao_op|ircsll|impostos|fornecedores.
async function lancamentosLinha(empresaId, { ano, mes, linha, lado, lojaId } = {}) {
  if (!habilitado()) return { ok: true, lancamentos: [] };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { ok: true, lancamentos: [] };
  const y = Number(ano) || new Date().getFullYear();
  const m = (mes === '' || mes == null) ? null : Number(mes); // 0-11
  const ini = m == null ? `${y}-01-01` : `${y}-${pad(m + 1)}-01`;
  const fim = m == null ? `${y + 1}-01-01` : (m === 11 ? `${y + 1}-01-01` : `${y}-${pad(m + 2)}-01`);
  const dre = lado !== 'dfc';
  const dataCol = dre ? 'cp.dataemissao' : 'cp.datavencimento';
  const statusCond = dre ? "cp.status<>'C'" : "cp.status='B'";
  const params = [unis, ini, fim];
  let cond;
  const ircsll = `(pl.caminho ILIKE '%IRPJ%' OR pl.caminho ILIKE '%CSLL%')`;
  if (linha === 'ircsll') cond = ircsll;
  else if (linha === 'impostos') cond = `split_part(pl.caminho,' > ',2) ILIKE '%IMPOSTO%' AND NOT ${ircsll}`;
  else if (linha === 'fornecedores' || linha === 'cmv') cond = `split_part(pl.caminho,' > ',2) ILIKE '%FORNECEDOR%'`;
  else {
    const g = await dlpDfc.grupos(empresaId, { ano: y, lojaId });
    const cfg = {}; (g.grupos || []).forEach(x => cfg[x.grupo] = x.classe);
    const alvo = linha === 'nao_op' ? 'despesa_nao_op' : linha; // variavel|fixa
    const lista = Object.keys(cfg).filter(k => cfg[k] === alvo);
    params.push(lista.length ? lista : ['__none__']);
    cond = `split_part(pl.caminho,' > ',2) = ANY($${params.length}::text[]) AND NOT ${ircsll}`;
  }
  const rows = await erpQuery(`
    SELECT cp.id, cp.datavencimento, cp.dataemissao, cp.valor, cp.status, cp.unidadenegocioid uni,
      pl.nome plano, split_part(pl.caminho,' > ',2) grupo, COALESCE(p.nome,'—') fornecedor
    FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid LEFT JOIN pessoa p ON p.id=cp.pessoaid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND ${statusCond} AND pl.caminho LIKE '2 -%'
      AND ${dataCol} >= $2::date AND ${dataCol} < $3::date AND (${cond})
    ORDER BY cp.valor DESC LIMIT 500`, params);
  return {
    ok: true, lado: dre ? 'dre' : 'dfc',
    total: rows.reduce((a, r) => a + (Number(r.valor) || 0), 0),
    lancamentos: rows.map(r => ({
      id: Number(r.id), vencimento: r.datavencimento, emissao: r.dataemissao, grupo: tituloGrupo(r.grupo),
      valor: Number(r.valor) || 0, status: r.status === 'B' ? 'Pago' : r.status === 'A' ? 'Em aberto' : r.status,
      plano: r.plano, fornecedor: r.fornecedor, loja: lojaDe(Number(r.uni)),
    })),
  };
}

// ── DRE (regime de COMPETÊNCIA) — por mês, geral ou por loja ───────────────
// Receita = venda (data da venda). Despesas = contapagar por dataemissao, classificadas.
async function dre(empresaId, { ano, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  const zeros = () => Array(12).fill(0);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'ERP indisponível ou loja sem vínculo.' };
  const y = Number(ano) || new Date().getFullYear();
  const [rec, cmvRows, desp] = await Promise.all([
    erpQuery(`SELECT extract(month from datahorafechamento)::int m, sum(valortotal) v FROM venda
      WHERE status='F' AND unidadenegocioid = ANY($1::bigint[]) AND datahorafechamento >= make_date($2,1,1) AND datahorafechamento < make_date($2+1,1,1) GROUP BY 1`, [unis, y]),
    // CMV REAL = custo médio do item vendido × quantidade (custo da mercadoria vendida, não compras)
    erpQuery(`SELECT extract(month from v.datahorafechamento)::int m, sum(me.customedio * iv.quantidade) v
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND iv.status<>'C'
        AND v.datahorafechamento >= make_date($2,1,1) AND v.datahorafechamento < make_date($2+1,1,1) GROUP BY 1`, [unis, y]),
    // Despesas (competência) — EXCLUI o plano CMV/compras (compras viram estoque, não despesa da DRE)
    erpQuery(`SELECT extract(month from cp.dataemissao)::int m, split_part(pl.caminho,' > ',2) grupo,
        CASE WHEN pl.caminho ILIKE '%IRPJ%' OR pl.caminho ILIKE '%CSLL%' THEN 'ircsll'
             WHEN pl.caminho ILIKE '%ICMS%' OR pl.caminho ILIKE '%PIS%' OR pl.caminho ILIKE '%COFINS%' OR pl.caminho ILIKE '%ISS%' OR pl.caminho ILIKE '%SIMPLES%' OR pl.caminho ILIKE '%DEVOLU%' THEN 'deducao'
             WHEN pl.caminho ILIKE '%FINANCEIR%' OR pl.caminho ILIKE '%JUROS%' OR pl.caminho ILIKE '%TARIFA%BANC%' THEN 'financeira'
             ELSE 'operacional' END classe, sum(cp.valor) v
      FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
      WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C' AND pl.caminho LIKE '2 -%' AND pl.caminho NOT ILIKE '%CMV%'
        AND cp.dataemissao >= make_date($2,1,1) AND cp.dataemissao < make_date($2+1,1,1) GROUP BY 1,2,3`, [unis, y]),
  ]);
  const receitaBruta = zeros(); rec.forEach(r => receitaBruta[r.m - 1] = Math.round(Number(r.v) || 0));
  const cmv = zeros(); cmvRows.forEach(r => cmv[r.m - 1] = Math.round(Number(r.v) || 0));
  const deducoes = zeros(), financeiras = zeros(), irCsll = zeros();
  const oper = new Map(); // grupo -> [12]
  for (const r of desp) {
    const mi = r.m - 1, v = Math.round(Number(r.v) || 0);
    if (r.classe === 'deducao') deducoes[mi] += v;
    else if (r.classe === 'financeira') financeiras[mi] += v;
    else if (r.classe === 'ircsll') irCsll[mi] += v;
    else { if (!oper.has(r.grupo || 'Outras')) oper.set(r.grupo || 'Outras', zeros()); oper.get(r.grupo || 'Outras')[mi] += v; }
  }
  const soma = arr => arr.reduce((a, v) => a + v, 0);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const receitaLiquida = sub(receitaBruta, deducoes);
  const lucroBruto = sub(receitaLiquida, cmv);
  const despOperGrupos = [...oper.entries()].map(([grupo, valores]) => ({ grupo, valores, total: soma(valores) })).sort((a, b) => b.total - a.total);
  const despOperTotal = zeros(); despOperGrupos.forEach(g => g.valores.forEach((v, i) => despOperTotal[i] += v));
  const resultadoOper = sub(lucroBruto, despOperTotal);
  const resultadoAntesIR = sub(resultadoOper, financeiras);
  const resultado = sub(resultadoAntesIR, irCsll);
  const margem = resultado.map((v, i) => receitaBruta[i] ? Math.round(v / receitaBruta[i] * 1000) / 10 : 0);
  return {
    ok: true, ano: y, lojaId: lojaId || null,
    receitaBruta, deducoes, receitaLiquida, cmv, lucroBruto,
    despOperGrupos, despOperTotal, resultadoOper, financeiras, resultadoAntesIR, irCsll, resultado, margem,
  };
}

// ── Confronto DRE (competência) × DFC (caixa) por mês ──────────────────────
async function confrontoDreDfc(empresaId, { ano, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  const zeros = () => Array(12).fill(0);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const y = Number(ano) || new Date().getFullYear();
  const d = await dre(empresaId, { ano: y, lojaId });
  const [entradas, saidas] = await Promise.all([
    // Caixa entrou: recebimentos no PDV (pagamentovenda) pela data
    erpQuery(`SELECT extract(month from pv.datahora)::int m, sum(pv.valor) v
      FROM pagamentovenda pv JOIN venda v ON v.id=pv.vendaid
      WHERE v.unidadenegocioid = ANY($1::bigint[]) AND v.status='F'
        AND pv.datahora >= make_date($2,1,1) AND pv.datahora < make_date($2+1,1,1) GROUP BY 1`, [unis, y]),
    // Caixa saiu: contas pagas (status B) pela data de vencimento
    erpQuery(`SELECT extract(month from cp.datavencimento)::int m, sum(cp.valor) v
      FROM contapagar cp WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status='B'
        AND cp.datavencimento >= make_date($2,1,1) AND cp.datavencimento < make_date($2+1,1,1) GROUP BY 1`, [unis, y]),
  ]);
  const caixaIn = zeros(); entradas.forEach(r => caixaIn[r.m - 1] = Math.round(Number(r.v) || 0));
  const caixaOut = zeros(); saidas.forEach(r => caixaOut[r.m - 1] = Math.round(Number(r.v) || 0));
  const dfcResultado = caixaIn.map((v, i) => v - caixaOut[i]);
  const dreResultado = d.ok ? d.resultado : zeros();
  const diferenca = dreResultado.map((v, i) => v - dfcResultado[i]);
  return {
    ok: true, ano: y, lojaId: lojaId || null,
    dre: { receita: d.receitaBruta, resultado: dreResultado },
    dfc: { entradas: caixaIn, saidas: caixaOut, resultado: dfcResultado },
    diferenca,
  };
}

// ── Representatividade (análise vertical) × benchmark do mercado farma ──────
// Cada linha do resultado como % do FATURAMENTO BRUTO, comparada com um benchmark
// editável (padrões típicos de drogaria — ABRAFARMA/Sebrae, ajustáveis pelo Joe).
const MESNOME = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Padrões editáveis (% sobre faturamento bruto). melhor = 'menor' (custo/despesa) ou 'maior' (margem/lucro).
const BENCH_DEFAULT = {
  deducoes:        { label: 'Impostos sobre vendas', pct: 8,  melhor: 'menor' },
  cmv:             { label: 'CMV (custo da mercadoria)', pct: 70, melhor: 'menor' },
  lucro_bruto:     { label: 'Lucro bruto', pct: 30, melhor: 'maior' },
  desp_operacional:{ label: 'Despesas operacionais', pct: 22, melhor: 'menor' },
  desp_financeira: { label: 'Despesas financeiras', pct: 1.5, melhor: 'menor' },
  ircsll:          { label: 'IR / CSLL', pct: 1, melhor: 'menor' },
  resultado:       { label: 'Resultado líquido', pct: 4, melhor: 'maior' },
};
function getBenchmark(empresaId) {
  const ov = {};
  try { for (const r of db.prepare('SELECT chave, valor FROM financeiro_benchmark WHERE empresa_id=?').all(empresaId)) ov[r.chave] = r.valor; } catch { /* tabela pode não existir */ }
  return ov;
}
function setBenchmark(empresaId, chave, valor) {
  const v = valor === '' || valor == null ? null : Number(valor);
  if (v == null) db.prepare('DELETE FROM financeiro_benchmark WHERE empresa_id=? AND chave=?').run(empresaId, chave);
  else db.prepare(`INSERT INTO financeiro_benchmark (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`).run(empresaId, chave, v);
  return true;
}

async function representatividade(empresaId, { ano, mes, lojaId, nivel } = {}) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { ok: false, erro: 'Nenhuma loja vinculada ao ERP.' };
  const y = Number(ano) || new Date().getFullYear();
  const mesNum = mes ? Number(mes) : null;
  const ini = mesNum ? `${y}-${pad(mesNum)}-01` : `${y}-01-01`;
  const fim = mesNum ? (mesNum === 12 ? `${y + 1}-01-01` : `${y}-${pad(mesNum + 1)}-01`) : `${y + 1}-01-01`;
  // nível 2 = plano de contas PRINCIPAL (default); nível 3 = SUBPLANO (folha, com fallback p/ o nome do plano).
  const sub = Number(nivel) === 3;
  const grupoExpr = sub
    ? `COALESCE(NULLIF(split_part(pl.caminho,' > ',3),''), pl.nome)`
    : `split_part(pl.caminho,' > ',2)`;
  const prefixo = sub ? 'sub:' : 'op:';

  // Faturamento (venda bruta), CMV real (custo do estoque vendido) e despesas por plano de contas (nível escolhido).
  const [fatRow, cmvRow, grupos] = await Promise.all([
    erpQuery(`SELECT COALESCE(sum(valortotal),0) v FROM venda
      WHERE status='F' AND unidadenegocioid = ANY($1::bigint[]) AND datahorafechamento >= $2::date AND datahorafechamento < $3::date`, [unis, ini, fim]),
    erpQuery(`SELECT COALESCE(sum(me.customedio * iv.quantidade),0) v
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND iv.status<>'C'
        AND v.datahorafechamento >= $2::date AND v.datahorafechamento < $3::date`, [unis, ini, fim]),
    erpQuery(`SELECT ${grupoExpr} grupo, sum(cp.valor) v, count(*) n
      FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
      WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C'
        AND pl.caminho LIKE '2 -%' AND pl.caminho NOT ILIKE '%CMV%'
        AND cp.dataemissao >= $2::date AND cp.dataemissao < $3::date
      GROUP BY 1 ORDER BY v DESC`, [unis, ini, fim]),
  ]);
  const faturamento = Number(fatRow[0]?.v) || 0;
  const cmv = Number(cmvRow[0]?.v) || 0;
  const ov = getBenchmark(empresaId);
  const bench = k => ov[k] != null ? ov[k] : (BENCH_DEFAULT[k] ? BENCH_DEFAULT[k].pct : null);
  const pctDe = v => faturamento ? Math.round(v / faturamento * 1000) / 10 : null;
  // Linha comparável. Benchmark = override do usuário OU padrão (se houver); grupos de plano têm padrão só se o Joe editar.
  const linha = (chave, label, valor, tipo, melhor) => {
    const pct = pctDe(valor);
    const bm = bench(chave);
    const dif = pct != null && bm != null ? Math.round((pct - bm) * 10) / 10 : null;
    let sem = 'cinza';
    if (dif != null) {
      const bom = melhor === 'maior' ? dif >= 0 : dif <= 0;
      const perto = Math.abs(dif) <= (bm ? bm * 0.1 : 1);
      sem = perto ? 'amarelo' : bom ? 'verde' : 'vermelho';
    }
    return { chave, label, valor: Math.round(valor), pct, benchmark: bm, benchmarkPadrao: BENCH_DEFAULT[chave] ? BENCH_DEFAULT[chave].pct : null, diferenca: dif, melhor, semaforo: sem, tipo };
  };

  const totalDespesas = grupos.reduce((a, g) => a + (Number(g.v) || 0), 0);
  const resultado = faturamento - cmv - totalDespesas;
  const linhasGrupos = grupos
    .map(g => linha(prefixo + (g.grupo || 'Outras'), tituloGrupo(g.grupo || 'Outras'), Number(g.v) || 0, 'menos', 'menor'))
    .filter(l => l.valor > 0);

  const linhas = [
    { chave: 'faturamento', label: 'Faturamento bruto', valor: Math.round(faturamento), pct: 100, tipo: 'base' },
    linha('cmv', 'CMV (custo da mercadoria vendida)', cmv, 'menos', 'menor'),
    ...linhasGrupos,
    linha('resultado', 'Resultado líquido', resultado, 'resultado', 'maior'),
  ];
  return {
    ok: true, ano: y, mes: mesNum,
    periodoLabel: mesNum ? `${MESNOME[mesNum - 1]}/${y}` : `${y} (acumulado)`,
    nivel: sub ? 3 : 2,
    faturamento: Math.round(faturamento), totalDespesas: Math.round(totalDespesas), linhas,
  };
}

// ── Eficiência: faturamento da loja ÷ colaborador (vendedor) → média e quem está abaixo ──
// Média = faturamento da loja ÷ nº de vendedores que venderam no período. Vendedor = quem ATENDEU
// (orcamento.usuarioid, fallback caixa), consolidado por pessoa. Lista quem vende abaixo da média.
async function vendaPorColaborador(empresaId, { ano, mes, lojaId } = {}) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { ok: false, erro: 'Nenhuma loja vinculada ao ERP.' };
  const y = Number(ano) || new Date().getFullYear();
  const mesNum = mes ? Number(mes) : null;
  const ini = mesNum ? `${y}-${pad(mesNum)}-01` : `${y}-01-01`;
  const fim = mesNum ? (mesNum === 12 ? `${y + 1}-01-01` : `${y}-${pad(mesNum + 1)}-01`) : `${y + 1}-01-01`;

  const rows = await erpQuery(`
    SELECT v.unidadenegocioid uni, u.pessoaid, pu.nome vendedor,
      sum(v.valortotal)::float8 total, count(*) n
    FROM venda v
    LEFT JOIN orcamento o ON o.id = v.orcamentoid
    JOIN usuario u ON u.id = COALESCE(o.usuarioid, v.usuarioid)
    JOIN pessoa pu ON pu.id = u.pessoaid
    WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[])
      AND v.datahorafechamento >= $2::date AND v.datahorafechamento < $3::date
    GROUP BY v.unidadenegocioid, u.pessoaid, pu.nome`, [unis, ini, fim]);

  // Agrupa por loja.
  const porLoja = new Map();
  for (const r of rows) {
    const uni = Number(r.uni);
    if (!porLoja.has(uni)) porLoja.set(uni, []);
    porLoja.get(uni).push({ nome: (r.vendedor || '').trim(), venda: Math.round(Number(r.total) || 0), cupons: Number(r.n) || 0 });
  }
  const lojas = [...porLoja.entries()].map(([uni, vends]) => {
    const faturamento = vends.reduce((a, v) => a + v.venda, 0);
    const nVend = vends.length;
    const media = nVend ? Math.round(faturamento / nVend) : 0;
    const vendedores = vends.map(v => ({
      ...v, pctMedia: media ? Math.round(v.venda / media * 100) : null, abaixo: media ? v.venda < media : false,
    })).sort((a, b) => b.venda - a.venda);
    return {
      lojaId: uni, loja: lojaDe(uni), faturamento, nVendedores: nVend, media,
      abaixoCount: vendedores.filter(v => v.abaixo).length, vendedores,
    };
  }).sort((a, b) => b.faturamento - a.faturamento);

  return { ok: true, ano: y, mes: mesNum, periodoLabel: mesNum ? `${MESNOME[mesNum - 1]}/${y}` : `${y} (acumulado)`, lojas };
}

// Lista de LANÇAMENTOS MANUAIS (tela "Lançamento Financeiro" do A7) — auditoria. origem 'A' (manual);
// opcional incluir 'F' (extrato). Sem vínculo com contapagar. Filtros: período, loja, tipo (E/S), busca.
async function lancamentosManuais(empresaId, { ini, fim, lojaId, tipo, busca, extrato } = {}) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { ok: false, erro: 'Nenhuma loja vinculada ao ERP.' };
  const origens = extrato ? ['A', 'F'] : ['A'];
  const params = [unis, ini, fim, origens];
  let cond = '';
  if (tipo === 'E' || tipo === 'S') { params.push(tipo); cond += ` AND lf.tipo = $${params.length}`; }
  if (busca) { params.push('%' + busca + '%'); cond += ` AND (lf.descricao ILIKE $${params.length} OR pl.caminho ILIKE $${params.length})`; }
  const rows = await erpQuery(`
    SELECT lf.id, lf.datahora, lf.unidadenegocioid uni, lf.tipo, lf.valor, lf.origem,
      split_part(pl.caminho,' > ',2) grupo, pl.nome plano, lf.descricao, COALESCE(pu.nome,'—') usuario
    FROM lancamentofinanceiro lf JOIN planocontas pl ON pl.id=lf.planocontasid
      LEFT JOIN usuario u ON u.id=lf.usuarioid LEFT JOIN pessoa pu ON pu.id=u.pessoaid
    WHERE lf.unidadenegocioid = ANY($1::bigint[]) AND lf.origem = ANY($4::text[]) AND lf.origemcontapagarid IS NULL
      AND lf.datahora >= $2::date AND lf.datahora < $3::date ${cond}
    ORDER BY lf.datahora DESC, lf.id DESC LIMIT 2000`, params);
  const lancamentos = rows.map(r => ({
    id: Number(r.id), data: r.datahora, loja: lojaDe(Number(r.uni)),
    tipo: r.tipo === 'E' ? 'Entrada' : 'Saída', valor: Number(r.valor) || 0,
    origem: r.origem === 'A' ? 'Manual' : r.origem === 'F' ? 'Extrato' : r.origem,
    grupo: tituloGrupo(r.grupo), plano: r.plano, descricao: r.descricao, usuario: r.usuario,
  }));
  const entradas = lancamentos.filter(l => l.valor > 0).reduce((a, l) => a + l.valor, 0);
  const saidas = lancamentos.filter(l => l.valor < 0).reduce((a, l) => a + l.valor, 0);
  return { ok: true, lancamentos, entradas: Math.round(entradas), saidas: Math.round(saidas), saldo: Math.round(entradas + saidas), n: lancamentos.length };
}

module.exports = { dfcDespesas, lancamentosPlano, reajusteDespesas, fluxoCaixa, lancamentosGrupo, lancamentosLinha, lancamentosManuais, dre, confrontoDreDfc, representatividade, getBenchmark, setBenchmark, vendaPorColaborador };
