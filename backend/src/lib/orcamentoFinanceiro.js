// orcamentoFinanceiro.js — orçamento projetado × realizado do Financeiro (por loja/geral, por mês).
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa, planoCmvIds, lojasEmpresa } = require('./escopoCompras');

const CHAVE_RECEITA = 'RECEITA';

// Realizado do ano (do ERP): receita por mês + despesas hierárquicas (grupo → subplano/folha) por mês.
async function realizadoAno(empresaId, ano, lojaId) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { receita: Array(12).fill(0), despesas: new Map() };
  const [rec, cmvRows, desp] = await Promise.all([
    erpQuery(`SELECT extract(month from datahorafechamento)::int m, sum(valortotal) v
      FROM venda WHERE status='F' AND unidadenegocioid = ANY($1::bigint[])
        AND datahorafechamento >= make_date($2,1,1) AND datahorafechamento < make_date($2+1,1,1) GROUP BY 1`, [unis, ano]),
    // CMV REAL = custo médio do item vendido × quantidade (custo da mercadoria vendida, NÃO compras) — mesmo cálculo da DRE.
    erpQuery(`SELECT extract(month from v.datahorafechamento)::int m, sum(me.customedio * iv.quantidade) v
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND iv.status<>'C'
        AND v.datahorafechamento >= make_date($2,1,1) AND v.datahorafechamento < make_date($2+1,1,1) GROUP BY 1`, [unis, ano]),
    // Despesas (contas a pagar por vencimento) — EXCLUI o plano CMV/compras (o CMV vem do custo real acima).
    erpQuery(`SELECT extract(month from cp.datavencimento)::int m,
        split_part(pl.caminho,' > ',2) grupo, pl.nome plano, sum(cp.valor) v
      FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
      WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C' AND pl.caminho LIKE '2 -%' AND pl.caminho NOT ILIKE '%CMV%'
        AND cp.datavencimento >= make_date($2,1,1) AND cp.datavencimento < make_date($2+1,1,1) GROUP BY 1,2,3`,
      [unis, ano]),
  ]);
  const receita = Array(12).fill(0);
  for (const r of rec) receita[Number(r.m) - 1] = Number(r.v) || 0;
  const despesas = new Map(); // grupo -> { valores[12], filhos: Map(plano -> [12]) }
  // CMV real primeiro (aparece no topo, como na DRE)
  const cmvArr = Array(12).fill(0);
  for (const r of cmvRows) cmvArr[Number(r.m) - 1] = Number(r.v) || 0;
  if (cmvArr.some(v => v)) despesas.set('CMV / Compras', { valores: cmvArr.slice(), filhos: new Map([['CMV (custo real)', cmvArr.slice()]]) });
  for (const r of desp) {
    const grupo = r.grupo || 'Outras';
    const plano = r.plano || '—';
    if (!despesas.has(grupo)) despesas.set(grupo, { valores: Array(12).fill(0), filhos: new Map() });
    const g = despesas.get(grupo);
    if (!g.filhos.has(plano)) g.filhos.set(plano, Array(12).fill(0));
    const mi = Number(r.m) - 1, val = Number(r.v) || 0;
    g.filhos.get(plano)[mi] += val; g.valores[mi] += val;
  }
  return { receita, despesas };
}

// Projetado (sqlite). Se lojaId, dessa loja; senão soma de todas (geral).
function projetado(empresaId, ano, lojaId) {
  const rows = lojaId
    ? db.prepare('SELECT chave, tipo, mes, valor FROM orcamento_financeiro WHERE empresa_id=? AND ano=? AND loja_id=?').all(empresaId, ano, lojaId)
    : db.prepare('SELECT chave, tipo, mes, sum(valor) valor FROM orcamento_financeiro WHERE empresa_id=? AND ano=? GROUP BY chave, tipo, mes').all(empresaId, ano);
  const map = new Map(); // chave -> {tipo, valores[12]}
  for (const r of rows) {
    if (!map.has(r.chave)) map.set(r.chave, { tipo: r.tipo, valores: Array(12).fill(0) });
    map.get(r.chave).valores[Number(r.mes) - 1] = Number(r.valor) || 0;
  }
  return map;
}

async function getOrcamento(empresaId, ano, lojaId) {
  const real = await realizadoAno(empresaId, ano, lojaId);
  const proj = projetado(empresaId, ano, lojaId);
  const zeros = () => Array(12).fill(0);

  const receitaProj = proj.get(CHAVE_RECEITA)?.valores || zeros();
  const linhaReceita = { chave: CHAVE_RECEITA, tipo: 'receita', label: 'Receita de vendas', projetado: receitaProj, realizado: real.receita.map(Math.round) };

  const grupos = [];
  for (const [grupo, g] of real.despesas) {
    const filhos = [...g.filhos.entries()].map(([plano, arr]) => ({
      chave: plano, label: plano, tipo: 'despesa', realizado: arr.map(Math.round), projetado: proj.get(plano)?.valores || zeros(),
    })).sort((a, b) => b.realizado.reduce((x, y) => x + y, 0) - a.realizado.reduce((x, y) => x + y, 0));
    // Projetado do grupo = soma dos subplanos + eventual projetado gravado direto no grupo (rateio ou orçado no grupo principal).
    const projGrupo = zeros(); const direto = proj.get(grupo)?.valores || zeros();
    filhos.forEach(f => f.projetado.forEach((v, i) => { projGrupo[i] += v; }));
    for (let i = 0; i < 12; i++) projGrupo[i] += direto[i];
    grupos.push({ chave: grupo, label: grupo, tipo: 'despesa', realizado: g.valores.map(Math.round), projetado: projGrupo, direto, filhos });
  }
  grupos.sort((a, b) => b.realizado.reduce((x, y) => x + y, 0) - a.realizado.reduce((x, y) => x + y, 0));

  const editavel = !!lojaId;
  return { erp: true, ano, lojaId: lojaId || null, editavel, receita: linhaReceita, despesas: grupos };
}

// Distribui um valor orçado do GRUPO principal entre seus subplanos (proporcional ao realizado ou igual).
async function distribuirGrupo(empresaId, lojaId, ano, { grupo, valores, criterio = 'realizado' } = {}) {
  if (!lojaId) return { ok: false, erro: 'Selecione uma loja para editar.' };
  const real = await realizadoAno(empresaId, ano, lojaId);
  const g = real.despesas.get(grupo);
  if (!g) return { ok: false, erro: 'Grupo não encontrado no realizado.' };
  const filhos = [...g.filhos.entries()]; // [plano, arr]
  const meses = Array.isArray(valores) && valores.length === 12 ? valores.map(v => Number(v) || 0) : Array(12).fill(Number(valores) || 0);
  const pesos = {};
  if (criterio === 'igual') { filhos.forEach(([p]) => pesos[p] = 1 / filhos.length); }
  else { let soma = 0; filhos.forEach(([p, arr]) => { const t = arr.reduce((a, v) => a + v, 0); pesos[p] = t; soma += t; }); if (soma > 0) filhos.forEach(([p]) => pesos[p] /= soma); else filhos.forEach(([p]) => pesos[p] = 1 / filhos.length); }
  const cells = [];
  for (const [plano] of filhos) for (let m = 0; m < 12; m++) cells.push({ chave: plano, tipo: 'despesa', mes: m + 1, valor: Math.round(meses[m] * pesos[plano]) });
  salvar(empresaId, lojaId, ano, cells);
  return { ok: true, subplanos: filhos.length, criterio, pesos };
}

// Salva células projetadas (bulk) para uma loja.
function salvar(empresaId, lojaId, ano, cells) {
  if (!lojaId) return { ok: false, erro: 'Selecione uma loja para editar (o geral é a soma).' };
  const up = db.prepare(`INSERT INTO orcamento_financeiro (empresa_id,loja_id,ano,mes,chave,tipo,valor,atualizado_em)
    VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,loja_id,ano,mes,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`);
  const tx = db.transaction(() => {
    for (const c of cells || []) {
      if (!c.chave || !c.mes || !c.tipo) continue;
      up.run(empresaId, lojaId, ano, Number(c.mes), c.chave, c.tipo, Number(c.valor) || 0);
    }
  });
  tx();
  return { ok: true, salvas: (cells || []).length };
}

// Geração assistida: base = média do realizado dos mesesBase (deste ano) × (1+fator%), aplicada aos mesesAlvo.
async function gerar(empresaId, lojaId, ano, { mesesBase, mesesAlvo, fatorPct = 0 } = {}) {
  if (!lojaId) return { ok: false, erro: 'Selecione uma loja para gerar.' };
  const real = await realizadoAno(empresaId, ano, lojaId);
  const base = (mesesBase && mesesBase.length) ? mesesBase : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => real.receita[m - 1] > 0);
  const alvo = (mesesAlvo && mesesAlvo.length) ? mesesAlvo : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const fator = 1 + (Number(fatorPct) || 0) / 100;
  const media = arr => { const b = base.map(m => arr[m - 1]).filter(v => v > 0); return b.length ? b.reduce((a, v) => a + v, 0) / b.length : 0; };

  const cells = [];
  const mediaRec = media(real.receita) * fator;
  for (const m of alvo) cells.push({ chave: CHAVE_RECEITA, tipo: 'receita', mes: m, valor: Math.round(mediaRec) });
  for (const [, g] of real.despesas) {
    for (const [plano, arr] of g.filhos) {
      const mv = media(arr) * fator;
      for (const m of alvo) cells.push({ chave: plano, tipo: 'despesa', mes: m, valor: Math.round(mv) });
    }
  }
  salvar(empresaId, lojaId, ano, cells);
  return { ok: true, geradas: cells.length, base, alvo, fatorPct };
}

// ── Rateio de planos de contas entre lojas ───────────────────────────────
function getRateio(empresaId) {
  const rows = db.prepare('SELECT chave, criterio, lojas FROM orcamento_rateio WHERE empresa_id=?').all(empresaId);
  const map = {};
  for (const r of rows) map[r.chave] = { criterio: r.criterio, lojas: JSON.parse(r.lojas || '[]') };
  return map;
}

function setRateio(empresaId, chave, { criterio, lojas }) {
  if (!chave) return { ok: false };
  if (!lojas || !lojas.length) { db.prepare('DELETE FROM orcamento_rateio WHERE empresa_id=? AND chave=?').run(empresaId, chave); return { ok: true, removido: true }; }
  db.prepare(`INSERT INTO orcamento_rateio (empresa_id,chave,criterio,lojas,atualizado_em) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,chave) DO UPDATE SET criterio=excluded.criterio, lojas=excluded.lojas, atualizado_em=excluded.atualizado_em`)
    .run(empresaId, chave, criterio || 'igual', JSON.stringify(lojas));
  return { ok: true };
}

// Distribui um plano (valores por mês) entre as lojas do rateio e grava no orçamento de cada uma.
async function ratear(empresaId, ano, { chave, tipo = 'despesa', valores, criterio, lojas } = {}) {
  if (!chave || !lojas || !lojas.length) return { ok: false, erro: 'Informe o plano e ao menos uma loja.' };
  const meses = Array.isArray(valores) && valores.length === 12 ? valores.map(v => Number(v) || 0) : Array(12).fill(Number(valores) || 0);
  // pesos por loja
  let pesos = {};
  if (criterio === 'faturamento') {
    let soma = 0;
    for (const lj of lojas) { const r = await realizadoAno(empresaId, ano, lj); const fat = r.receita.reduce((a, v) => a + v, 0); pesos[lj] = fat; soma += fat; }
    if (soma > 0) for (const lj of lojas) pesos[lj] = pesos[lj] / soma; else for (const lj of lojas) pesos[lj] = 1 / lojas.length;
  } else {
    for (const lj of lojas) pesos[lj] = 1 / lojas.length;
  }
  const tx = db.transaction(() => {
    const up = db.prepare(`INSERT INTO orcamento_financeiro (empresa_id,loja_id,ano,mes,chave,tipo,valor,atualizado_em)
      VALUES (?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(empresa_id,loja_id,ano,mes,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`);
    for (const lj of lojas) for (let m = 0; m < 12; m++) up.run(empresaId, lj, ano, m + 1, chave, tipo, Math.round(meses[m] * pesos[lj]));
  });
  tx();
  setRateio(empresaId, chave, { criterio: criterio || 'igual', lojas });
  return { ok: true, lojas: lojas.length, criterio: criterio || 'igual', pesos };
}

module.exports = { getOrcamento, salvar, gerar, distribuirGrupo, lojasEmpresa, getRateio, setRateio, ratear };
