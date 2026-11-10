// premiacaoFechamento.js — Fechamento mensal de Premiação a partir dos relatórios do ERP
// ("Análise de Plano de Remuneração": Premiação, Perfumaria, Kits, Unidades vendidas, Vitaminas).
// Lê cada relatório (xls/csv), guarda a BASE por colaborador, cruza com os marcadores do cadastro
// (perfumista/premiacao_gestao/premiacao_caixa) e calcula o prêmio bruto, os descontos e o líquido.
// O sistema NÃO escreve no ERP — os relatórios são a fonte da base (o Joe os baixa todo mês).
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

// nome normalizado p/ casar o relatório (que TRUNCA nomes longos ~30 chars) com o cadastro
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// números do relatório vêm em formato US: "16,311.12" (vírgula milhar, ponto decimal), "16.00"
function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '').trim();
  if (!s || s === '-') return 0;
  s = s.replace(/,/g, ''); // tira o separador de milhar
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
const parsePct = v => { const n = Number(String(v == null ? '' : v).replace('%', '').replace(',', '.').trim()); return Number.isFinite(n) ? n : null; };
const round = n => Math.round((Number(n) || 0) * 100) / 100;

// ── config (valores cadastráveis) ──────────────────────────────────────────
const CFG_PADRAO = { uv_valor_un: 0, kit_min: 100, kit_alto: 250, kit_baixo: 120 };
function getCfg(empresaId) {
  const rows = db.prepare('SELECT chave, valor FROM premiacao_cfg WHERE empresa_id=?').all(empresaId);
  const cfg = { ...CFG_PADRAO };
  rows.forEach(r => { cfg[r.chave] = Number(r.valor); });
  return cfg;
}
function salvarCfg(empresaId, patch) {
  const up = db.prepare(`INSERT INTO premiacao_cfg (empresa_id, chave, valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET valor=excluded.valor`);
  const tx = db.transaction(() => {
    for (const k of Object.keys(CFG_PADRAO)) if (patch[k] != null && patch[k] !== '') up.run(empresaId, k, Number(patch[k]) || 0);
  });
  tx();
  return getCfg(empresaId);
}

// faixas de vitaminas (R$/unidade) — mesma tabela da aba de vitaminas
function faixasVitaminas(empresaId) {
  try {
    return db.prepare('SELECT min_un, valor FROM premiacao_vitaminas WHERE empresa_id=? ORDER BY min_un').all(empresaId);
  } catch { return []; }
}
function valorUnVitamina(qtd, faixas) {
  let v = 0;
  for (const f of faixas) if (qtd >= Number(f.min_un)) v = Number(f.valor); // última faixa cujo mínimo <= qtd
  return v;
}

// ── importação de um relatório ──────────────────────────────────────────────
const TIPOS = { PERFUMARIA: 'perfumaria', UNIDADES: 'unidades', VITAMINA: 'vitaminas', KIT: 'kits', PREMIA: 'premiacao' };
function detectarTipo(a1) {
  const k = norm(a1);
  if (/PERFUMARIA/.test(k)) return 'perfumaria';
  if (/UNIDADES/.test(k)) return 'unidades';
  if (/VITAMINA/.test(k)) return 'vitaminas';
  if (/KIT/.test(k)) return 'kits';
  if (/PREMIA/.test(k)) return 'premiacao';
  return null;
}
function lerRelatorio(buffer) {
  let wb;
  try { wb = XLSX.read(buffer, { raw: false }); }
  catch (e) { throw new Error('Não consegui abrir o arquivo (' + e.message + ').'); }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  if (!rows.length) throw new Error('Relatório vazio.');
  const a1 = String((rows[0] && rows[0][0]) || '');
  const tipo = detectarTipo(a1);
  if (!tipo) throw new Error('Não reconheci o relatório. Esperado PREMIAÇÃO, PERFUMARIA, KITS, UNIDADES VENDIDAS ou VITAMINAS no título (célula A1).');
  const mper = norm(a1).match(/(\d{2})(\d{4})\s*$/); // "... 102026" = MMAAAA
  if (!mper) throw new Error('Não achei o período (MMAAAA) no título "' + a1.trim() + '".');
  const mes = Number(mper[1]), ano = Number(mper[2]);
  const itens = [];
  for (let i = 1; i < rows.length; i++) {
    const nomeOrig = String((rows[i] && rows[i][0]) || '').trim();
    if (!nomeOrig || /^total/i.test(nomeOrig)) continue;
    itens.push({ nome_norm: norm(nomeOrig), nome_original: nomeOrig, valor: parseNum(rows[i][1]), pct: tipo === 'perfumaria' ? parsePct(rows[i][2]) : null });
  }
  if (!itens.length) throw new Error('Nenhuma linha de colaborador no relatório.');
  return { tipo, mes, ano, itens };
}
function importar(empresaId, { conteudoBase64, nomeArquivo }) {
  const buf = Buffer.from(String(conteudoBase64 || '').replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length) throw new Error('Arquivo vazio.');
  const r = lerRelatorio(buf);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM premiacao_base WHERE empresa_id=? AND mes=? AND ano=? AND tipo=?').run(empresaId, r.mes, r.ano, r.tipo);
    const ins = db.prepare(`INSERT INTO premiacao_base (id, empresa_id, mes, ano, tipo, nome_norm, nome_original, valor, pct)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for (const it of r.itens) ins.run(uuidv4(), empresaId, r.mes, r.ano, r.tipo, it.nome_norm, it.nome_original, it.valor, it.pct);
  });
  tx();
  return { ok: true, tipo: r.tipo, mes: r.mes, ano: r.ano, linhas: r.itens.length, arquivo: nomeArquivo || '' };
}

// ── casamento relatório × cadastro ──────────────────────────────────────────
function colaboradoresNorm(empresaId) {
  const cols = db.prepare(`SELECT id, nome, loja_id, ativo, perfumista, premiacao_gestao, premiacao_caixa,
    (SELECT nome FROM lojas WHERE id=colaboradores.loja_id) AS loja_nome
    FROM colaboradores WHERE empresa_id=?`).all(empresaId);
  return cols.map(c => ({ ...c, nome_norm: norm(c.nome) }));
}
// o relatório trunca nomes longos → casa por igualdade OU prefixo; prefere ativo e match único
function casar(nomeNorm, cols) {
  const exato = cols.filter(c => c.nome_norm === nomeNorm);
  if (exato.length === 1) return exato[0];
  if (exato.length > 1) return exato.find(c => c.ativo) || exato[0];
  const pref = cols.filter(c => c.nome_norm.startsWith(nomeNorm) || nomeNorm.startsWith(c.nome_norm));
  const ativos = pref.filter(c => c.ativo);
  if (ativos.length === 1) return ativos[0];
  if (pref.length === 1) return pref[0];
  return null; // não achou ou ambíguo
}

// ── cálculo do fechamento ───────────────────────────────────────────────────
function listar(empresaId, { mes, ano }) {
  mes = Number(mes); ano = Number(ano);
  const cfg = getCfg(empresaId);
  const faixasVit = faixasVitaminas(empresaId);
  const cols = colaboradoresNorm(empresaId);

  // bases por nome_norm → { premiacao:{valor}, perfumaria:{valor,pct}, kits:{valor}, ... }
  const bases = db.prepare('SELECT tipo, nome_norm, nome_original, valor, pct FROM premiacao_base WHERE empresa_id=? AND mes=? AND ano=?').all(empresaId, mes, ano);
  const porNome = new Map();
  const tiposImportados = new Set();
  for (const b of bases) {
    tiposImportados.add(b.tipo);
    const e = porNome.get(b.nome_norm) || { nome_norm: b.nome_norm, nome_original: b.nome_original };
    e[b.tipo] = { valor: Number(b.valor) || 0, pct: b.pct == null ? null : Number(b.pct) };
    porNome.set(b.nome_norm, e);
  }

  // decisões salvas por colaborador
  const itens = db.prepare('SELECT * FROM premiacao_item WHERE empresa_id=? AND mes=? AND ano=?').all(empresaId, mes, ano);
  const porColab = new Map(itens.map(i => [i.colaborador_id, i]));

  // linhas: todo nome que apareceu em algum relatório + todo colaborador marcado como gestão
  const linhas = [];
  const colabUsado = new Set();
  const montar = (nome_norm, nome_original, base, colab) => {
    const it = colab ? porColab.get(colab.id) : null;
    const b = base || {};
    const premiacaoVenda = b.premiacao?.valor || 0;
    const perfVenda = b.perfumaria?.valor || 0;
    const perfPct = b.perfumaria?.pct ?? null;
    const kitsQtd = b.kits?.valor || 0;
    const uniQtd = b.unidades?.valor || 0;
    const vitQtd = b.vitaminas?.valor || 0;

    const premiacaoPct = it && it.premiacao_pct != null ? Number(it.premiacao_pct) : null;
    const premiacaoValor = premiacaoPct != null ? round(premiacaoVenda * premiacaoPct / 100) : 0;

    const ehPerfumista = !!(colab && colab.perfumista) || perfVenda > 0;
    const perfumariaValor = ehPerfumista && perfPct != null ? round(perfVenda * perfPct / 100) : 0;

    const vitUn = valorUnVitamina(vitQtd, faixasVit);
    const vitaminasValor = round(vitQtd * vitUn);
    const unidadesValor = round(uniQtd * (cfg.uv_valor_un || 0));

    const ehCaixa = !!(colab && colab.premiacao_caixa);
    const kitsValor = ehCaixa && kitsQtd > 0 ? (kitsQtd >= cfg.kit_min ? cfg.kit_alto : cfg.kit_baixo) : 0;

    const gestaoTipo = colab ? (colab.premiacao_gestao || '') : '';
    const metaBateu = it ? !!it.meta_bateu : false;
    const gestaoValor = gestaoTipo ? (it ? Number(it.gestao_valor) || 0 : 0) : 0;

    const difCaixa = it ? Number(it.dif_caixa) || 0 : 0;
    const outrosDesc = it ? Number(it.outros_desc) || 0 : 0;

    const bruto = round(premiacaoValor + perfumariaValor + vitaminasValor + unidadesValor + kitsValor + gestaoValor);
    const descontos = round(difCaixa + outrosDesc);
    const liquido = round(bruto - descontos);

    linhas.push({
      colaborador_id: colab ? colab.id : null,
      nome: colab ? colab.nome : nome_original,
      nome_relatorio: nome_original,
      loja_nome: colab ? colab.loja_nome : null,
      sem_cadastro: !colab,
      inativo: colab ? !colab.ativo : false,
      perfumista: ehPerfumista, caixa: ehCaixa, gestao: gestaoTipo,
      // bases
      premiacao_venda: round(premiacaoVenda), perfumaria_venda: round(perfVenda), perfumaria_pct: perfPct,
      kits_qtd: kitsQtd, unidades_qtd: uniQtd, vitaminas_qtd: vitQtd,
      // decisões / valores
      premiacao_pct: premiacaoPct, premiacao_valor: premiacaoValor,
      perfumaria_valor: perfumariaValor, vitaminas_valor: vitaminasValor, vitaminas_un: vitUn,
      unidades_valor: unidadesValor, kits_valor: kitsValor,
      meta_bateu: metaBateu, gestao_valor: gestaoValor,
      dif_caixa: difCaixa, outros_desc: outrosDesc, obs: it ? (it.obs || '') : '',
      bruto, descontos, liquido,
    });
  };

  for (const [nome_norm, base] of porNome) {
    const colab = casar(nome_norm, cols);
    if (colab) colabUsado.add(colab.id);
    montar(nome_norm, base.nome_original, base, colab);
  }
  // gestão sem linha de relatório (gerentes/liderança que não aparecem nos relatórios de venda)
  for (const c of cols) {
    if (c.premiacao_gestao && c.ativo && !colabUsado.has(c.id)) montar(c.nome_norm, c.nome, null, c);
  }

  linhas.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const resumo = {
    colaboradores: linhas.length,
    sem_cadastro: linhas.filter(l => l.sem_cadastro).length,
    bruto: round(linhas.reduce((s, l) => s + l.bruto, 0)),
    descontos: round(linhas.reduce((s, l) => s + l.descontos, 0)),
    liquido: round(linhas.reduce((s, l) => s + l.liquido, 0)),
  };
  return { ok: true, mes, ano, cfg, linhas, resumo, relatorios: [...tiposImportados] };
}

function salvarItem(empresaId, body) {
  const { mes, ano, colaborador_id } = body;
  if (!colaborador_id) throw new Error('Colaborador obrigatório.');
  const num = v => (v === '' || v == null ? null : Number(v));
  db.prepare(`INSERT INTO premiacao_item (id, empresa_id, mes, ano, colaborador_id, premiacao_pct, meta_bateu, gestao_valor, dif_caixa, outros_desc, obs, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, mes, ano, colaborador_id) DO UPDATE SET
      premiacao_pct=excluded.premiacao_pct, meta_bateu=excluded.meta_bateu, gestao_valor=excluded.gestao_valor,
      dif_caixa=excluded.dif_caixa, outros_desc=excluded.outros_desc, obs=excluded.obs, atualizado_em=datetime('now')`)
    .run(uuidv4(), empresaId, Number(mes), Number(ano), colaborador_id,
      num(body.premiacao_pct), body.meta_bateu ? 1 : 0, Number(body.gestao_valor) || 0,
      Number(body.dif_caixa) || 0, Number(body.outros_desc) || 0, body.obs || null);
  return { ok: true };
}

module.exports = { importar, listar, salvarItem, salvarCfg, getCfg };
