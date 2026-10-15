// lib/pilares.js — framework dos 4 pilares / indicadores do Gerente
// Os pilares/indicadores agora vivem no banco (tabelas pilares + indicadores_def).
// A constante abaixo é a SEMENTE (carregada no setup) e o fallback se o banco estiver vazio.
const db = require('../db/connection');

const { DEFAULT_PILARES } = require('./pilaresSeed');
const PILARES = DEFAULT_PILARES;

// Premiação do gerente (% do salário) conforme nota geral
const FAIXAS_PREMIO_GERENTE = [
  { min: 95, pct: 10 }, { min: 90, pct: 8 }, { min: 80, pct: 5 }, { min: 70, pct: 3 }, { min: 0, pct: 0 },
];

// faixas (opcional) = [{min,pct}] de premiacaoConfig.getGerente(empresa). Sem isso, usa a semente.
function premioGerente(notaGeral, faixas) {
  const lista = Array.isArray(faixas) && faixas.length ? faixas : FAIXAS_PREMIO_GERENTE;
  return (lista.find(f => notaGeral >= f.min) || { pct: 0 }).pct;
}

function notaPilar(indicadores) {
  if (!indicadores.length) return 0;
  return Math.round(indicadores.reduce((a, i) => a + (i.nota || 0), 0) / indicadores.length);
}

function notaGeral(pilares) {
  return Math.round(pilares.reduce((a, p) => a + notaPilar(p.indicadores) * (p.peso / 100), 0));
}

// Lê os pilares + indicadores do banco (com fallback para a semente)
function getPilares(empresaId) {
  let ps = [];
  try {
    ps = db.prepare(`SELECT * FROM pilares WHERE empresa_id=? AND ativo=1 ORDER BY ordem, nome`).all(empresaId);
  } catch (e) { ps = []; }
  if (!ps.length) return PILARES;
  return ps.map(p => ({
    id: p.id, nome: p.nome, cor: p.cor, peso: p.peso,
    indicadores: db.prepare(`SELECT * FROM indicadores_def WHERE empresa_id=? AND pilar_id=? AND ativo=1 ORDER BY ordem, nome`).all(empresaId, p.id)
      .map(i => ({ id: i.id, nome: i.nome, min: i.min, fonte: i.fonte, acao: i.acao })),
  }));
}

module.exports = { PILARES, getPilares, FAIXAS_PREMIO_GERENTE, premioGerente, notaPilar, notaGeral };
