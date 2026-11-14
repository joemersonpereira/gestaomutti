// precificacaoMeuSetor.js — Meu Setor da PRECIFICAÇÃO (Joe 2026-11-14): área própria, por COMPRADOR.
// Indicadores "menor melhor" = nº de itens fora do preço ainda NÃO corrigidos (acabar a correção não pode
// parecer ruim). Pilares, metas por comprador, premiação (teto/bônus + pessoas por fator) — igual às demais.
const db = require('../db/connection');
const prec = require('./precificacaoErp');
const cadernos = require('./precificacaoCadernos');

const CATALOGO = [
  { chave: 'abaixo_custo', nome: 'Vendendo abaixo do custo (itens)', pilar: 'Preço de venda', peso: 10, meta: 0, tol: 5, direcao: 'menor', unidade: 'qtd',
    desc: 'Produtos vendidos abaixo do custo por ERRO de preço (já tira perda legítima de PBM/convênio/caderno). Meta: zerar.', calc: 'Conta os produtos (do comprador) vendendo abaixo do custo que NÃO são perda legítima (PBM/caderno) e que ainda não foram marcados como corrigidos.', acesso: 'Precificação → Abaixo do custo (marque "corrigido" ao ajustar).', mercado: 'Nenhum item deveria vender abaixo do custo por erro; ideal zero.' },
  { chave: 'abaixo_margem', nome: 'Vendendo abaixo da margem (itens)', pilar: 'Preço de venda', peso: 10, meta: 0, tol: 10, direcao: 'menor', unidade: 'qtd',
    desc: 'Produtos vendidos abaixo da margem mínima. Meta: o menor número possível.', calc: 'Conta os produtos (do comprador) com margem abaixo do mínimo que ainda não foram marcados como corrigidos.', acesso: 'Precificação → Abaixo da margem.', mercado: 'Quanto menos itens fora da margem, melhor.' },
  { chave: 'comprado_caro', nome: 'Comprado mais caro (itens)', pilar: 'Compra', peso: 10, meta: 0, tol: 10, direcao: 'menor', unidade: 'qtd',
    desc: 'Produtos comprados mais caro que a última entrada. Meta: o menor número possível.', calc: 'Conta os produtos (do comprador) cuja última compra saiu mais cara que a anterior e que ainda não foram marcados como corrigidos.', acesso: 'Precificação → Comprado mais caro.', mercado: 'Negociar para não subir o custo de entrada; ideal próximo de zero.' },
  { chave: 'cadernos_em_dia', nome: 'Cadernos de oferta em dia (%)', pilar: 'Execução', peso: 10, meta: 100, tol: 20, direcao: 'maior', unidade: '%',
    desc: 'Dos cadernos de oferta sob responsabilidade deste comprador, % que está dentro da frequência de conferência. Meta: 100%.', calc: '% = cadernos do comprador não atrasados ÷ total de cadernos dele (aba Cadernos de Oferta).', acesso: 'Precificação → Cadernos de Oferta.', mercado: 'Conferir os cadernos na frequência evita preço errado na oferta.' },
];
const PILARES = ['Preço de venda', 'Compra', 'Execução'];
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

function compradores(emp) {
  try {
    return db.prepare(`SELECT c.id, c.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
      WHERE c.empresa_id=? AND c.ativo=1 AND f.nome LIKE 'Comprador%' ORDER BY c.nome`).all(emp);
  } catch (e) { return []; }
}

function config(emp, compradorId) {
  const ov = {};
  if (compradorId) db.prepare('SELECT chave, meta, tol, peso, ativo FROM precificacao_ms_meta WHERE empresa_id=? AND comprador_id=?').all(emp, compradorId).forEach(r => { ov[r.chave] = r; });
  return CATALOGO.map(c => { const o = ov[c.chave] || {};
    return { chave: c.chave, nome: c.nome, pilar: c.pilar, unidade: c.unidade, desc: c.desc, calc: c.calc, acesso: c.acesso, mercado: c.mercado,
      meta: o.meta != null ? Number(o.meta) : c.meta, peso: o.peso != null ? Number(o.peso) : (c.peso || 10),
      tol: o.tol != null ? Number(o.tol) : (c.tol != null ? c.tol : 0),
      direcao: c.direcao, ativo: o.ativo != null ? o.ativo !== 0 : (c.ativoPadrao !== false) };
  });
}
function setConfig(emp, compradorId, { chave, meta, peso, tol, ativo } = {}) {
  if (!compradorId) throw new Error('Comprador não informado.');
  if (!CATALOGO.find(c => c.chave === chave)) throw new Error('Indicador desconhecido.');
  const cur = config(emp, compradorId).find(c => c.chave === chave);
  db.prepare(`INSERT INTO precificacao_ms_meta (empresa_id, comprador_id, chave, meta, tol, peso, ativo, atualizado_em)
    VALUES (?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, comprador_id, chave) DO UPDATE SET meta=excluded.meta, tol=excluded.tol, peso=excluded.peso, ativo=excluded.ativo, atualizado_em=excluded.atualizado_em`)
    .run(emp, compradorId, chave, meta === '' || meta == null ? null : Number(meta),
      tol === '' || tol == null ? (cur.tol || 0) : Number(tol), peso != null && peso !== '' ? Number(peso) : cur.peso, ativo === false ? 0 : 1);
  return { ok: true };
}

// ── Premiação (teto R$ por pilar + bônus % na superação) — global ──
function premioPilar(emp) { try { const r = db.prepare("SELECT valor FROM precificacao_ms_config WHERE empresa_id=? AND chave='premio_pilar_valor'").get(emp); const v = Number(r && r.valor); return isFinite(v) && v > 0 ? v : 100; } catch (e) { return 100; } }
function premioBonusPct(emp) { try { const r = db.prepare("SELECT valor FROM precificacao_ms_config WHERE empresa_id=? AND chave='premio_bonus_pct'").get(emp); const v = Number(r && r.valor); return isFinite(v) && v >= 0 ? v : 0.5; } catch (e) { return 0.5; } }
function setPremio(emp, { valor, bonusPct } = {}) {
  const up = (chave, v) => db.prepare(`INSERT INTO precificacao_ms_config (empresa_id, chave, valor, atualizado_em) VALUES (?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`).run(emp, chave, v);
  if (valor != null && isFinite(Number(valor)) && Number(valor) > 0) up('premio_pilar_valor', Number(valor));
  if (bonusPct != null && isFinite(Number(bonusPct)) && Number(bonusPct) >= 0) up('premio_bonus_pct', Number(bonusPct));
  return { ok: true, premioValor: premioPilar(emp), bonusPct: premioBonusPct(emp) };
}
function listPessoas(emp, compradorId) {
  try { return db.prepare(`SELECT pp.colaborador_id, pp.fator, c.nome FROM precificacao_premio_pessoa pp
    LEFT JOIN colaboradores c ON c.id = pp.colaborador_id
    WHERE pp.empresa_id=? AND pp.comprador_id=? AND pp.ativo=1 ORDER BY pp.fator DESC, c.nome`).all(emp, compradorId); } catch (e) { return []; }
}
function addPessoa(emp, compradorId, { colaborador_id, fator } = {}) {
  if (!compradorId) throw new Error('Comprador não informado.');
  db.prepare(`INSERT INTO precificacao_premio_pessoa (empresa_id, comprador_id, colaborador_id, fator, ativo, criado_em) VALUES (?,?,?,?,1, datetime('now'))
    ON CONFLICT(empresa_id, comprador_id, colaborador_id) DO UPDATE SET fator=excluded.fator, ativo=1`).run(emp, compradorId, String(colaborador_id), Number(fator) || 0);
  return { ok: true };
}
function rmPessoa(emp, compradorId, colaborador_id) {
  db.prepare('UPDATE precificacao_premio_pessoa SET ativo=0 WHERE empresa_id=? AND comprador_id=? AND colaborador_id=?').run(emp, compradorId, String(colaborador_id));
  return { ok: true };
}

function farol(meta, realizado, direcao, tol) {
  if (realizado == null || meta == null) return 'sem_dados';
  const t = Number(tol) || 0;
  if (direcao === 'maior') return realizado >= meta ? 'verde' : (realizado >= meta - t ? 'amarelo' : 'vermelho');
  return realizado <= meta ? 'verde' : (realizado <= meta + t ? 'amarelo' : 'vermelho');
}
const notaFarol = f => f === 'verde' ? 100 : f === 'amarelo' ? 50 : f === 'vermelho' ? 0 : null;

// Conta os itens fora do preço AINDA NÃO corrigidos (por comprador). Para "abaixo do custo" só conta ERRO
// (tira perda legítima de PBM/convênio/caderno).
// limite alto: por comprador o nº de itens é limitado (prodIds filtra), então contamos o TOTAL real
// de pendentes, não o teto de 300 dos relatórios.
const LIM = 20000;
// "corrigido" só esconde o item se a correção foi feita DEPOIS da última ocorrência (venda/entrada).
// Se houver ocorrência nova após a correção, o item VOLTA a contar como pendente.
const efetivo = (corr, i) => { const c = corr[i.produtoId]; return !!c && (!i.dataISO || String(c.corrigido_em || '').slice(0, 10) >= i.dataISO); };
async function realizadoAuto(emp, compradorId, { dias = 30 } = {}) {
  const out = { abaixo_custo: null, abaixo_margem: null, comprado_caro: null, cadernos_em_dia: null };
  try { const c = db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(compradorId); if (c) { const rc = cadernos.resumoPorResponsavel(emp, c.nome); if (rc.total) out.cadernos_em_dia = rc.pctEmDia; } } catch (e) { }
  try {
    const r = await prec.vendidoAbaixoCusto(emp, { compradorId, dias, limite: LIM });
    if (r && r.erp !== false && !r.semComprador) { const corr = prec.listarCorrigidos(emp, 'abaixo_custo'); out.abaixo_custo = (r.itens || []).filter(i => !i.legitima && !efetivo(corr, i)).length; }
  } catch (e) { }
  try {
    const r = await prec.vendidoAbaixoMargem(emp, { compradorId, dias, limite: LIM });
    if (r && r.erp !== false && !r.semComprador) { const corr = prec.listarCorrigidos(emp, 'abaixo_margem'); out.abaixo_margem = (r.itens || []).filter(i => !efetivo(corr, i)).length; }
  } catch (e) { }
  try {
    const r = await prec.compradoVariacao(emp, { compradorId, dias: Math.max(dias, 120), dir: 'caro', limite: LIM });
    if (r && r.erp !== false && !r.semComprador) { const corr = prec.listarCorrigidos(emp, 'comprado_caro'); out.comprado_caro = (r.itens || []).filter(i => !efetivo(corr, i)).length; }
  } catch (e) { }
  return out;
}

async function apurar(emp, compradorId, { dias = 30, ini = '', fim = '' } = {}) {
  if (!compradorId) return { erro: 'Selecione um comprador.' };
  const dd = (ini && fim) ? Math.max(1, Math.round((new Date(fim) - new Date(ini)) / 86400000) + 1) : dias;
  const cfg = config(emp, compradorId).filter(c => c.ativo);
  const real = await realizadoAuto(emp, compradorId, { dias: dd });
  const premioValor = premioPilar(emp); const bonusPct = premioBonusPct(emp);
  const inds = cfg.map(c => { const v = real[c.chave]; const fr = farol(c.meta, v, c.direcao, c.tol);
    return { ...c, realizado: v != null ? v : null, farol: fr, hit: fr === 'sem_dados' ? null : fr === 'verde', semMeta: c.meta == null, semDados: v == null }; });
  const pilares = PILARES.map(p => {
    const ms = inds.filter(i => i.pilar === p);
    const comp = ms.filter(i => i.farol !== 'sem_dados');
    const pesoTot = comp.reduce((a, i) => a + (i.peso || 0), 0);
    const notaPond = pesoTot ? comp.reduce((a, i) => a + notaFarol(i.farol) * (i.peso || 0), 0) / pesoTot : null;
    const nota = notaPond == null ? null : Math.round(notaPond);
    const pf = nota == null ? 'sem_dados' : nota >= 80 ? 'verde' : nota >= 50 ? 'amarelo' : 'vermelho';
    const bonus = nota === 100;
    const premio = nota == null ? 0 : r2(nota / 100 * premioValor + (bonus ? premioValor * bonusPct : 0));
    return { pilar: p, nota, farol: pf, premio, premioMax: premioValor, bonus, verde: ms.filter(i => i.farol === 'verde').length, de: comp.length, indicadores: ms };
  });
  const notas = pilares.map(p => p.nota).filter(x => x != null);
  const notaGeral = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
  const premioTotalChefe = r2(pilares.reduce((a, p) => a + (p.premio || 0), 0));
  const premioMaxTotal = r2(premioValor * (1 + bonusPct) * PILARES.length);
  const pessoas = listPessoas(emp, compradorId).map(x => ({ ...x, premioTotal: r2(premioTotalChefe * (Number(x.fator) || 0)) }));
  const metas = inds.map(i => ({ chave: i.chave, label: i.nome, pilar: i.pilar, unidade: i.unidade, meta: i.meta, realizado: i.realizado, farol: i.farol }));
  const resumo = { verde: inds.filter(i => i.farol === 'verde').length, amarelo: inds.filter(i => i.farol === 'amarelo').length,
    vermelho: inds.filter(i => i.farol === 'vermelho').length, sem: inds.filter(i => i.farol === 'sem_dados').length };
  return { ok: true, compradorId, dias: dd, notaGeral, pilares, premioValor, bonusPct, premioTotalChefe, premioMaxTotal, pessoas, resumo, metas };
}

module.exports = { CATALOGO, PILARES, compradores, config, setConfig, apurar,
  premioPilar, premioBonusPct, setPremio, listPessoas, addPessoa, rmPessoa };
