// lib/calculosVendas.js — regras de negócio do módulo de Vendas e Metas
// Fonte única de verdade para metas, indicadores e premiações.

// Escala universal: Bom = 100% do peso | Regular = 50% | Ruim = 0%
const ESCALA = { bom: 1.0, regular: 0.5, ruim: 0.0 };

// Premiação (% sobre vendas) conforme % da meta individual atingido
const FAIXAS_PREMIACAO = [
  { min: 100, pct: 5, label: 'Super meta (≥100%)' },
  { min: 90,  pct: 4, label: 'Meta (90–99%)' },
  { min: 80,  pct: 3, label: 'Parcial (80–89%)' },
  { min: 0,   pct: 0, label: 'Abaixo de 80%' },
];

// Premiação de vitaminas (R$ por unidade) por faixa de unidades vendidas
const FAIXAS_VITAMINAS = [
  { min: 30, valor: 10, label: '≥30 un' },
  { min: 20, valor: 7,  label: '20–29 un' },
  { min: 10, valor: 5,  label: '10–19 un' },
  { min: 0,  valor: 0,  label: '<10 un' },
];

function diasNoMes(mes, ano) {
  return new Date(ano, mes, 0).getDate();
}

// Dia "corrente" do período: hoje se for o mês atual, senão o mês inteiro (fechado)
function diaCorrente(mes, ano) {
  const hoje = new Date();
  if (hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes) return hoje.getDate();
  return diasNoMes(mes, ano);
}

// Nota dos indicadores (0–100). Pesos somam 100. Bom=peso, Regular=peso/2, Ruim=0.
function calcNotaIndicadores(avaliacoes, pesos, overrides = {}) {
  let nota = 0;
  for (const cfg of pesos) {
    let ratio;
    if (Object.prototype.hasOwnProperty.call(overrides, cfg.indicador)) {
      ratio = overrides[cfg.indicador]; // 0 a 1 (valor automático: atendimento, conduta…)
    } else {
      const av = avaliacoes[cfg.indicador];
      if (!av || av === 'np') continue; // sem avaliação ou N/P (não se aplica) → fora do cálculo
      ratio = ESCALA[av] ?? 0;
    }
    nota += (cfg.peso || 0) * ratio;
  }
  return Math.round(nota);
}

// Indicadores em que QUANTO MENOS, MELHOR (a meta é um teto). Ex.: encomendas pendentes.
const INDICADORES_INVERTIDOS = new Set(['encomendas']);
const TETO_PADRAO_INVERTIDO = 5; // "< 5" — usado quando não há meta cadastrada

// Ratio 0..1 de um indicador (realizado × meta), tratando os invertidos (meta = teto).
// Retorna null quando não há como pontuar (indicador normal sem meta definida).
function ratioIndicador(indicador, real, metaColab) {
  const inv = INDICADORES_INVERTIDOS.has(indicador);
  let meta = metaColab;
  if ((meta == null || meta === 0) && inv) meta = TETO_PADRAO_INVERTIDO;
  if (!meta) return null;
  real = Number(real) || 0;
  if (inv) return real < meta ? 1 : Math.max(0, 1 - (real - meta + 1) * 0.15); // <meta→100; teto→85; +1→70…
  return Math.max(0, Math.min(1, real / meta));
}

// Nota 0..100 de um indicador (ou null se não pontua).
function notaIndicador(indicador, real, metaColab) {
  const r = ratioIndicador(indicador, real, metaColab);
  return r == null ? null : Math.round(r * 100);
}

// Meta individual = fatia da meta da loja proporcional ao peso do vendedor
function metaIndividual(metaLoja, pesoVendedor, somaPesos) {
  if (!somaPesos) return 0;
  return Math.round(metaLoja * (pesoVendedor / somaPesos));
}

function pct(vendido, meta) {
  if (!meta) return 0;
  return Math.round((vendido / meta) * 100);
}

// Ritmo necessário por dia para bater meta / super meta no restante do período
function ritmoNecessario(meta, vendido, mes, ano) {
  const restante = Math.max(1, diasNoMes(mes, ano) - diaCorrente(mes, ano) + 1);
  return Math.max(0, Math.round((meta - vendido) / restante));
}

function premiacaoPct(pctMeta) {
  const f = FAIXAS_PREMIACAO.find(x => pctMeta >= x.min);
  return f ? f.pct : 0;
}

// Peso do dia na divisão da meta: Seg–Sáb = 1,0 | Domingo = 0,7 | feriado/fechado = 0
function pesoDia(date) {
  return date.getDay() === 0 ? 0.7 : 1.0; // 0 = domingo
}
function pad2(n) { return String(n).padStart(2, '0'); }

// Soma dos pesos dos dias restantes do mês (de hoje até o fim; mês passado conta o mês todo)
function somaPesosRestantes(mes, ano, feriados = []) {
  const total = diasNoMes(mes, ano);
  const hoje = new Date();
  const ehAtual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  const inicio = ehAtual ? hoje.getDate() : 1;
  let soma = 0;
  for (let d = inicio; d <= total; d++) {
    const iso = `${ano}-${pad2(mes)}-${pad2(d)}`;
    if (feriados.includes(iso)) continue; // peso 0
    soma += pesoDia(new Date(ano, mes - 1, d));
  }
  return soma;
}

// Quanto precisa vender HOJE (ponderado pelo calendário) para fechar a meta
function ritmoPonderado(meta, vendido, mes, ano, feriados = []) {
  const restante = meta - vendido;
  if (restante <= 0) return 0;
  const soma = somaPesosRestantes(mes, ano, feriados);
  if (soma <= 0) return Math.max(0, Math.round(restante));
  const hoje = new Date();
  const ehAtual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  const pHoje = ehAtual ? pesoDia(hoje) : 1.0;
  return Math.max(0, Math.round((restante / soma) * pHoje));
}

// Nota mínima dos indicadores do vendedor (0–100) para ter direito ao teto de 5%.
// Abaixo disso, mesmo batendo a super meta, o vendedor fica em 4% — porque os
// indicadores (identificação, cadastro, PBM, vitaminas, campanhas) importam, não só a venda.
const LIMIAR_INDICADORES = 95;

// Premiação sobre vendas (regra do Grupo Mutti):
//   • Não bateu a meta (pctMeta < 100%) ................... 3%
//   • Bateu a super meta (pctSuper ≥ 100%) E nota dos
//     indicadores ≥ 95% ................................... 5%
//   • Bateu a meta (mas não a super, OU bateu a super
//     com indicadores < 95%) .............................. 4%
// cfg (opcional) = { parcial, meta, sup, limiar } vindo de premiacaoConfig.getVendedor(empresa).
// Sem cfg, usa os valores históricos (3/4/5, limiar 95) — comportamento inalterado.
function premiacaoVendas(pctMeta, pctSuper, notaIndicadores, cfg) {
  const parcial = cfg?.parcial ?? 3, meta = cfg?.meta ?? 4, sup = cfg?.sup ?? 5;
  const limiar = cfg?.limiar ?? LIMIAR_INDICADORES;
  if ((pctMeta || 0) < 100) return parcial;               // não bateu a meta → piso
  const indOk = (notaIndicadores ?? 0) >= limiar;
  if ((pctSuper || 0) >= 100 && indOk) return sup;        // super meta + indicadores ok
  return meta;                                            // meta batida (ou super sem indicadores)
}

// (legado) Indicadores "ok" quando nenhum está avaliado como 'ruim'. Mantido para
// telas que ainda mostram esse selo; a premiação agora usa a NOTA (≥95%).
function indicadoresOk(avaliacoes) {
  return Object.values(avaliacoes || {}).every(v => v !== 'ruim');
}

// R$/unidade de vitaminas conforme a faixa. `faixas` (opcional) = [{min,valor}]
// vindo do cadastro (premiacao_vitaminas); se não vier, usa o padrão fixo.
function premiacaoVitaminas(unidades, faixas) {
  const lista = (faixas && faixas.length ? faixas : FAIXAS_VITAMINAS)
    .slice().sort((a, b) => b.min - a.min);
  const f = lista.find(x => unidades >= x.min);
  return f ? f.valor : 0;
}

// Comissão do CONFERENTE sobre as vendas dele (quando vai atender), escalonada pela
// nota do checklist — estimula o conferente a atender e crescer na carreira.
// Bateu 100% do checklist → 5%; ≥90 → 4%; ≥80 → 3%; abaixo de 80 → 0%.
function premiacaoConferenteItensPct(notaChecklist) {
  if (notaChecklist == null) return 0;
  if (notaChecklist >= 100) return 5;
  if (notaChecklist >= 90) return 4;
  if (notaChecklist >= 80) return 3;
  return 0;
}

module.exports = {
  ESCALA, FAIXAS_PREMIACAO, FAIXAS_VITAMINAS, LIMIAR_INDICADORES,
  INDICADORES_INVERTIDOS, ratioIndicador, notaIndicador,
  diasNoMes, diaCorrente, calcNotaIndicadores, metaIndividual,
  pct, ritmoNecessario, premiacaoPct, premiacaoVitaminas,
  pesoDia, somaPesosRestantes, ritmoPonderado, indicadoresOk, premiacaoVendas,
  premiacaoConferenteItensPct,
};
