// premiacaoFechamento.js — Fechamento mensal de Premiação a partir dos relatórios do ERP
// ("Análise de Plano de Remuneração": Premiação, Perfumaria, Kits, Unidades vendidas, Vitaminas).
// Lê cada relatório (xls/csv), guarda a BASE por colaborador, cruza com os marcadores do cadastro
// (perfumista/premiacao_gestao/premiacao_caixa) e calcula o prêmio bruto, os descontos e o líquido.
// O sistema NÃO escreve no ERP — os relatórios são a fonte da base (o Joe os baixa todo mês).
const XLSX = require('xlsx');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { erpQuery } = require('../db/erp');

// modelo oficial da carga Pay X (embutido no projeto) — a formatação sai IDÊNTICA a ele.
const MODELO_PATH = path.join(__dirname, '..', 'templates', 'payx_modelo.xlsx');
let _modeloBuf = null;
const modeloBuf = () => { if (!_modeloBuf) _modeloBuf = fs.readFileSync(MODELO_PATH); return _modeloBuf; };
const xmlEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Preenche o modelo com os dados de UMA conta/CNPJ, preservando 100% a formatação (estilos,
// logo, colunas). Troca só os valores do cabeçalho e regenera as linhas de dados (A=CPF, B=Nome,
// C=Valor, D=ID), reaproveitando os estilos do modelo (s10/s11). Devolve o buffer do xlsx.
async function preencherTemplate(g) {
  const z = await JSZip.loadAsync(modeloBuf());
  let xml = await z.file('xl/worksheets/sheet1.xml').async('string');
  const setCell = (ref, s, conteudo) => {
    const re = new RegExp('<c r="' + ref + '"(?:\\s[^>]*?)?(?:/>|>[\\s\\S]*?</c>)');
    xml = xml.replace(re, `<c r="${ref}" s="${s}"${conteudo}`);
  };
  const inline = v => ` t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  const number = v => `><v>${v}</v></c>`;
  const codNum = /^\d+$/.test(String(g.codigo || '')) ? Number(g.codigo) : null;
  setCell('B2', 14, inline(g.empresa));
  setCell('B4', 14, inline(g.cnpj_fmt));
  setCell('B5', 14, inline(g.produto));
  setCell('B6', 14, codNum != null ? number(codNum) : inline(g.codigo));
  setCell('B7', 17, number(g.taxaFrac));
  setCell('D7', 4, number(g.taxaRs));
  setCell('B8', 4, number(g.soma));
  setCell('B9', 21, number(g.total));
  // regenera as linhas de dados (apaga r>=11 e recria com os estilos do modelo)
  const cut = xml.indexOf('<row r="11"');
  const endSD = xml.indexOf('</sheetData>');
  const cabeca = cut >= 0 ? xml.slice(0, cut) : xml.slice(0, endSD);
  const cauda = xml.slice(endSD);
  let dataRows = '';
  g.linhas.forEach((l, i) => {
    const rn = 11 + i;
    dataRows += `<row r="${rn}" spans="1:5">`
      + `<c r="A${rn}" s="10" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(l.cpf)}</t></is></c>`
      + `<c r="B${rn}" s="10" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(l.nome)}</t></is></c>`
      + `<c r="C${rn}" s="11"><v>${Number(l.valor) || 0}</v></c>`
      + `<c r="D${rn}" s="10" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(l.id || '')}</t></is></c>`
      + `</row>`;
  });
  xml = cabeca + dataRows + cauda;
  const lastRow = 10 + g.linhas.length;
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:E${Math.max(11, lastRow)}"/>`);
  z.file('xl/worksheets/sheet1.xml', xml);
  // remove o calcChain (não há fórmulas) p/ o Excel não tentar recalcular células trocadas
  if (z.file('xl/calcChain.xml')) {
    z.remove('xl/calcChain.xml');
    let ct = await z.file('[Content_Types].xml').async('string');
    ct = ct.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, '');
    z.file('[Content_Types].xml', ct);
  }
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

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
const CFG_PADRAO = { uv_valor_un: 0, kit_min: 100, kit_alto: 250, kit_baixo: 120, taxa_adm: 1.2, premiacao_pct_padrao: 5, perfumaria_pct_padrao: 1.5 };
const cpf11 = c => String(c == null ? '' : c).replace(/\D/g, '').padStart(11, '0');
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

// ── status do mês (aberto/fechado) ──────────────────────────────────────────
function status(empresaId, mes, ano) {
  const r = db.prepare('SELECT fechado, fechado_em, fechado_por FROM premiacao_fechado WHERE empresa_id=? AND mes=? AND ano=?').get(empresaId, Number(mes), Number(ano));
  return { fechado: !!(r && r.fechado), fechado_em: (r && r.fechado_em) || null, fechado_por: (r && r.fechado_por) || null };
}
function exigeAberto(empresaId, mes, ano) {
  if (status(empresaId, mes, ano).fechado) throw new Error('Este mês está FECHADO. Reabra antes de alterar.');
}
async function fechar(empresaId, { mes, ano, usuario, reabrir }) {
  mes = Number(mes); ano = Number(ano);
  // Ao FECHAR: se o mês ainda não tem base salva (está no monitor ao vivo), congela um snapshot
  // do ERP agora — assim mudanças no plano depois NÃO alteram o mês fechado (pedido do Joe).
  if (!reabrir) {
    const tem = db.prepare('SELECT 1 FROM premiacao_base WHERE empresa_id=? AND mes=? AND ano=? LIMIT 1').get(empresaId, Number(mes), Number(ano));
    if (!tem) { try { await puxarDoErp(empresaId, { mes, ano }); } catch (e) { /* ERP indisponível — fecha assim mesmo */ } }
  }
  const fechado = reabrir ? 0 : 1;
  db.prepare(`INSERT INTO premiacao_fechado (empresa_id, mes, ano, fechado, fechado_em, fechado_por)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(empresa_id, mes, ano) DO UPDATE SET fechado=excluded.fechado, fechado_em=excluded.fechado_em, fechado_por=excluded.fechado_por`)
    .run(empresaId, mes, ano, fechado, fechado ? new Date().toISOString() : null, fechado ? ((usuario && usuario.nome) || '') : null);
  return { ok: true, ...status(empresaId, mes, ano) };
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
  exigeAberto(empresaId, r.mes, r.ano);
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
async function listar(empresaId, { mes, ano }) {
  mes = Number(mes); ano = Number(ano);
  const cfg = getCfg(empresaId);
  const pctPadrao = cfg.premiacao_pct_padrao != null ? Number(cfg.premiacao_pct_padrao) : 5;
  const faixasVit = faixasVitaminas(empresaId);
  const cols = colaboradoresNorm(empresaId);
  const st = status(empresaId, mes, ano);

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
    const kitsQtd = b.kits?.valor || 0;
    const uniQtd = b.unidades?.valor || 0;
    const vitQtd = b.vitaminas?.valor || 0;

    // % padrão (5) quando há venda e nada foi escolhido ainda; o operador ajusta as exceções.
    const premiacaoPct = it && it.premiacao_pct != null ? Number(it.premiacao_pct) : (premiacaoVenda > 0 ? pctPadrao : null);
    const premiacaoValor = premiacaoPct != null ? round(premiacaoVenda * premiacaoPct / 100) : 0;

    // Perfumista = MARCADOR no cadastro. % padrão 1,5 (ou 1); ajusta/valida no fim.
    const ehPerfumista = !!(colab && colab.perfumista);
    const perfPct = (it && it.perfumaria_pct != null) ? Number(it.perfumaria_pct)
      : ((b.perfumaria && b.perfumaria.pct != null) ? Number(b.perfumaria.pct)
        : (ehPerfumista ? (cfg.perfumaria_pct_padrao != null ? Number(cfg.perfumaria_pct_padrao) : 1.5) : null));
    const perfumariaValor = ehPerfumista && perfPct != null ? round(perfVenda * perfPct / 100) : 0;

    const vitUn = valorUnVitamina(vitQtd, faixasVit);
    const vitaminasValor = round(vitQtd * vitUn);
    // Unidades Vendidas: o valor da base JÁ É o R$ da bonificação (Σ qtd×R$/un por produto), usado direto.
    const unidadesValor = round(uniQtd);

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
  // SEM base salva (nem Excel nem snapshot) e mês ABERTO → MONITOR AO VIVO do ERP, automático.
  // Casa por erp_pessoa_id (sem "sem cadastro"). Ao fechar o mês vira snapshot congelado.
  let aoVivo = false;
  if (!porNome.size && !st.fechado) {
    aoVivo = true;
    let erp = null;
    try { erp = await basesErp(empresaId, mes, ano); } catch (e) { /* ERP indisponível → tabela vazia */ }
    if (erp) {
      ['premiacao', 'perfumaria', 'vitaminas', 'kits', 'unidades'].forEach(t => tiposImportados.add(t));
      for (const colab of cols) {
        const b = erp.get(colab.id);
        if (!b || !(b.premiacao_venda || b.perfumaria_venda || b.kits_qtd || b.unidades_valor || b.vitaminas_qtd)) continue;
        const base = { nome_original: colab.nome, premiacao: { valor: b.premiacao_venda }, perfumaria: { valor: b.perfumaria_venda, pct: null }, kits: { valor: b.kits_qtd }, unidades: { valor: b.unidades_valor }, vitaminas: { valor: b.vitaminas_qtd } };
        colabUsado.add(colab.id);
        montar(colab.nome_norm, colab.nome, base, colab);
      }
    }
  }
  // gestão sem linha de venda (gerentes/liderança que não aparecem nas vendas)
  for (const c of cols) {
    if (c.premiacao_gestao && c.ativo && !colabUsado.has(c.id)) montar(c.nome_norm, c.nome, null, c);
  }

  linhas.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const soma = campo => round(linhas.reduce((s, l) => s + (l[campo] || 0), 0));
  const resumo = {
    colaboradores: linhas.length,
    sem_cadastro: linhas.filter(l => l.sem_cadastro).length,
    premiacao: soma('premiacao_valor'), perfumaria: soma('perfumaria_valor'),
    vitaminas: soma('vitaminas_valor'), unidades: soma('unidades_valor'),
    kits: soma('kits_valor'), gestao: soma('gestao_valor'),
    bruto: soma('bruto'), descontos: soma('descontos'), liquido: soma('liquido'),
  };
  return { ok: true, mes, ano, cfg, linhas, resumo, relatorios: [...tiposImportados], fechado: st.fechado, fechado_em: st.fechado_em, fechado_por: st.fechado_por, ao_vivo: aoVivo };
}

function salvarItem(empresaId, body) {
  const { mes, ano, colaborador_id } = body;
  if (!colaborador_id) throw new Error('Colaborador obrigatório.');
  exigeAberto(empresaId, mes, ano);
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

// ── subir planilha de DIFERENÇAS DE CAIXA → desconta por colaborador ─────────
// Leitor flexível: acha a linha de cabeçalho e as colunas de CPF/Nome e de diferença/valor;
// casa por CPF (11 díg) ou nome; grava em premiacao_item.dif_caixa (valor absoluto = desconto).
function importarDifCaixa(empresaId, { conteudoBase64, nomeArquivo, mes, ano }) {
  mes = Number(mes); ano = Number(ano);
  exigeAberto(empresaId, mes, ano);
  const buf = Buffer.from(String(conteudoBase64 || '').replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length) throw new Error('Arquivo vazio.');
  let wb;
  try { wb = XLSX.read(buf, { raw: true }); } catch (e) { throw new Error('Não consegui abrir (' + e.message + ').'); }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  let hi = -1, iCpf = -1, iNome = -1, iVal = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = (rows[i] || []).map(norm);
    const fCpf = r.findIndex(c => c.includes('CPF'));
    const fNome = r.findIndex(c => c.includes('NOME') || c.includes('COLABORADOR') || c.includes('VENDEDOR') || c.includes('FUNCIONARIO'));
    // prefere a coluna "DIFERENÇA FINAL" (já líquida dos pontos); senão, qualquer diferença/valor.
    let fVal = r.findIndex(c => c.includes('FINAL'));
    if (fVal < 0) fVal = r.findIndex(c => c.includes('DIFER') || c.includes('VALOR') || c.includes('QUEBRA') || c.includes('FALTA') || c.includes('SOBRA'));
    if ((fCpf >= 0 || fNome >= 0) && fVal >= 0) { hi = i; iCpf = fCpf; iNome = fNome; iVal = fVal; break; }
  }
  if (hi < 0) throw new Error('Não achei as colunas. Precisa de COLABORADOR (ou CPF) e uma coluna de DIFERENÇA FINAL (ou diferença/valor).');
  const cols = db.prepare('SELECT id, nome, cpf FROM colaboradores WHERE empresa_id=?').all(empresaId);
  const porCpf = new Map(cols.filter(c => c.cpf).map(c => [cpf11(c.cpf), c.id]));
  const colsNorm = cols.map(c => ({ id: c.id, nn: norm(c.nome) }));
  const up = db.prepare(`INSERT INTO premiacao_item (id, empresa_id, mes, ano, colaborador_id, dif_caixa, atualizado_em)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, mes, ano, colaborador_id) DO UPDATE SET dif_caixa=excluded.dif_caixa, atualizado_em=datetime('now')`);
  let aplicados = 0; const naoAchados = [];
  const tx = db.transaction(() => {
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const valor = Math.abs(num(r[iVal]));
      const cpf = iCpf >= 0 ? cpf11(r[iCpf]) : '';
      const nomeOrig = iNome >= 0 ? String(r[iNome] || '').trim() : '';
      if (!valor && !cpf && !nomeOrig) continue;
      let id = (cpf && cpf !== '00000000000') ? porCpf.get(cpf) : null;
      if (!id && nomeOrig) { const nn = norm(nomeOrig); const cand = colsNorm.filter(c => c.nn === nn || c.nn.startsWith(nn) || nn.startsWith(c.nn)); if (cand.length === 1) id = cand[0].id; }
      if (id) { up.run(uuidv4(), empresaId, mes, ano, id, valor); aplicados++; }
      else if (valor) naoAchados.push(nomeOrig || cpf);
    }
  });
  tx();
  return { ok: true, aplicados, nao_achados: naoAchados, arquivo: nomeArquivo || '' };
}

// ── importar os ID Premiação em massa (das cargas preenchidas pela operadora) ─
// Lê as planilhas de carga (CPF/CNPJ | Nome | Valor | ID | OBS), casa por CPF (11 díg, zero à
// esquerda) e grava colaboradores.id_premiacao. Devolve quem casou e quem não achou.
const campoCab = (rows, label) => { const r = rows.find(x => String(x[0] || '').toUpperCase().trim().startsWith(label)); return r ? String(r[1] == null ? '' : r[1]).trim() : ''; };
function importarIds(empresaId, { conteudoBase64, nomeArquivo }) {
  const buf = Buffer.from(String(conteudoBase64 || '').replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length) throw new Error('Arquivo vazio.');
  let wb;
  try { wb = XLSX.read(buf, { raw: false }); } catch (e) { throw new Error('Não consegui abrir (' + e.message + ').'); }
  const cols = db.prepare('SELECT id, cpf FROM colaboradores WHERE empresa_id=?').all(empresaId);
  const porCpf = new Map(cols.filter(c => c.cpf).map(c => [cpf11(c.cpf), c.id]));
  const updId = db.prepare('UPDATE colaboradores SET id_premiacao=?, payx_cnpj=? WHERE id=?');
  const upsertConta = db.prepare(`INSERT INTO payx_conta (empresa_id, cnpj, cnpj_fmt, empresa_nome, produto, codigo, taxa_adm)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(empresa_id, cnpj) DO UPDATE SET cnpj_fmt=excluded.cnpj_fmt, empresa_nome=excluded.empresa_nome,
      produto=excluded.produto, codigo=excluded.codigo, taxa_adm=excluded.taxa_adm`);
  let atualizados = 0; const naoAchados = []; const contas = [];
  const tx = db.transaction(() => {
    for (const ab of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[ab], { header: 1, raw: false, defval: '' });
      const hi = rows.findIndex(r => String(r[0] || '').toUpperCase().includes('CPF'));
      if (hi < 0) continue;
      // cabeçalho da conta Pay X
      const cnpjFmt = campoCab(rows, 'CNPJ') || ab;
      const cnpj = cnpjFmt.replace(/\D/g, '') || ab.replace(/\D/g, '');
      const taxaTxt = campoCab(rows, 'TAXA');
      const taxa = parsePct(taxaTxt);
      upsertConta.run(empresaId, cnpj, cnpjFmt, campoCab(rows, 'EMPRESA'),
        campoCab(rows, 'PRODUTO'), campoCab(rows, 'CÓDIGO') || campoCab(rows, 'CODIGO'), taxa != null ? taxa : 1.2);
      contas.push(cnpjFmt);
      for (let i = hi + 1; i < rows.length; i++) {
        const cpf = cpf11(rows[i][0]); const id = String(rows[i][3] || '').trim();
        if (cpf === '00000000000' || !id) continue;
        const colabId = porCpf.get(cpf);
        if (colabId) { updId.run(id, cnpj, colabId); atualizados++; }
        else naoAchados.push(String(rows[i][1] || '').trim() || cpf);
      }
    }
  });
  tx();
  return { ok: true, atualizados, nao_achados: naoAchados, contas, arquivo: nomeArquivo || '' };
}

// contas Pay X (cabeçalho por CNPJ) — listar e editar (taxa/produto/código/empresa)
function listarContas(empresaId) {
  return db.prepare('SELECT cnpj, cnpj_fmt, empresa_nome, produto, codigo, taxa_adm FROM payx_conta WHERE empresa_id=? ORDER BY cnpj_fmt').all(empresaId);
}
function salvarConta(empresaId, c) {
  const cnpj = String(c.cnpj || '').replace(/\D/g, '');
  if (!cnpj) throw new Error('CNPJ obrigatório.');
  db.prepare(`INSERT INTO payx_conta (empresa_id, cnpj, cnpj_fmt, empresa_nome, produto, codigo, taxa_adm)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(empresa_id, cnpj) DO UPDATE SET cnpj_fmt=excluded.cnpj_fmt, empresa_nome=excluded.empresa_nome,
      produto=excluded.produto, codigo=excluded.codigo, taxa_adm=excluded.taxa_adm`)
    .run(empresaId, cnpj, c.cnpj_fmt || c.cnpj || '', c.empresa_nome || '', c.produto || '', c.codigo || '', Number(c.taxa_adm) || 0);
  return { ok: true, contas: listarContas(empresaId) };
}

// ── export no modelo da operadora (Pay X Virtual com PIX) ───────────────────
// Uma aba por loja (CNPJ), com o cabeçalho que a planilha de CARGA exige e as linhas
// CPF | Nome | Valor (líquido) | ID (id_premiacao do cadastro) | OBSERVAÇÃO.
async function exportarCarga(empresaId, mes, ano) {
  const cfg = getCfg(empresaId);
  const taxaPct = cfg.taxa_adm != null ? Number(cfg.taxa_adm) : 1.2;
  const L = await listar(empresaId, { mes: Number(mes), ano: Number(ano) });
  const pagaveis = L.linhas.filter(l => l.colaborador_id && l.liquido > 0);
  const semId = []; const semVinculo = [];
  const det = new Map();
  if (pagaveis.length) {
    const ids = pagaveis.map(l => l.colaborador_id);
    const q = db.prepare(`SELECT c.id, c.cpf, c.id_premiacao, c.payx_cnpj, c.loja_id, l.razao_social, l.cnpj AS loja_cnpj, l.nome AS loja_nome
      FROM colaboradores c LEFT JOIN lojas l ON l.id=c.loja_id WHERE c.id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    q.forEach(r => det.set(r.id, r));
  }
  const contas = new Map(listarContas(empresaId).map(c => [c.cnpj, c]));
  const grupos = new Map();
  for (const l of pagaveis) {
    const d = det.get(l.colaborador_id) || {};
    if (!d.id_premiacao) semId.push(l.nome);
    // vínculo Pay X do colaborador; se não tiver, cai no CNPJ da loja onde trabalha
    const cnpjVinc = (d.payx_cnpj || '').replace(/\D/g, '') || (d.loja_cnpj || '').replace(/\D/g, '');
    if (!d.payx_cnpj) semVinculo.push(l.nome);
    const key = cnpjVinc || ('loja:' + (d.loja_id || 'sem'));
    const conta = contas.get(cnpjVinc);
    const g = grupos.get(key) || {
      cnpj_fmt: (conta && conta.cnpj_fmt) || d.loja_cnpj || '',
      empresa: (conta && conta.empresa_nome) || d.razao_social || d.loja_nome || 'FARMACIA',
      produto: (conta && conta.produto) || 'PAYX VIRTUAL COM PIX',
      codigo: (conta && conta.codigo) || 38,
      taxa: conta && conta.taxa_adm != null ? Number(conta.taxa_adm) : taxaPct,
      linhas: [],
    };
    g.linhas.push({ cpf: cpf11(d.cpf), nome: l.nome, valor: l.liquido, id: d.id_premiacao || '', obs: '' });
    grupos.set(key, g);
  }

  // 1 ARQUIVO POR CNPJ, no modelo oficial (formatação idêntica), empacotados num ZIP.
  const zip = new JSZip();
  const nomesUsados = new Set();
  const mm = String(mes).padStart(2, '0');
  for (const [key, g] of grupos) {
    const soma = round(g.linhas.reduce((s, x) => s + x.valor, 0));
    const taxaRs = round(soma * (g.taxa || 0) / 100);
    const buf = await preencherTemplate({
      empresa: String(g.empresa || '').trim(), cnpj_fmt: g.cnpj_fmt || '', produto: g.produto || 'PAYX VIRTUAL COM PIX',
      codigo: g.codigo, taxaFrac: (Number(g.taxa) || 0) / 100, taxaRs, soma, total: round(soma + taxaRs),
      linhas: g.linhas,
    });
    const cnpjDig = (g.cnpj_fmt || '').replace(/\D/g, '') || String(key);
    let nome = `CARREGAMENTO - ${(g.produto || 'PAYX')} ${g.cnpj_fmt || cnpjDig} ${mm}-${ano}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');
    let n = nome, i = 2;
    while (nomesUsados.has(n)) { n = nome.replace('.xlsx', '') + '_' + i++ + '.xlsx'; }
    nomesUsados.add(n);
    zip.file(n, buf);
  }
  if (!grupos.size) zip.file('VAZIO.txt', 'Sem colaboradores com líquido a pagar e cadastro neste mês.');
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, zip: true, lojas: grupos.size, colaboradores: pagaveis.length, sem_id: semId, sem_vinculo: semVinculo };
}

// ── base AO VIVO direto dos planos de remuneração do ERP ────────────────────
// Calcula por colaborador (casando por erp_pessoa_id): Premiação/Perfumaria (Σ venda das
// classificações do plano), Vitaminas/Kits (Σ qtd dos produtos do plano), Unidades (Σ qtd×R$/un).
// Usa a DATA DE VENDA (datahoraabertura) e as regras ATUAIS do plano. Depois o "puxar do ERP"
// grava isso em premiacao_base (snapshot) — e ao fechar o mês fica congelado.
const SELLER_JOIN = 'LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)';
const _basesCache = new Map();
async function basesErp(empresaId, mes, ano, force) {
  const chave = `${empresaId}|${mes}|${ano}`;
  const cache = _basesCache.get(chave);
  if (!force && cache && Date.now() - cache.at < 90 * 1000) return cache.val;
  const colabs = db.prepare('SELECT id, erp_pessoa_id, nome FROM colaboradores WHERE empresa_id=? AND erp_pessoa_id IS NOT NULL AND ativo=1').all(empresaId);
  const porPessoa = new Map(colabs.map(c => [Number(c.erp_pessoa_id), c.id]));
  const out = new Map(colabs.map(c => [c.id, { colaborador_id: c.id, nome: c.nome, premiacao_venda: 0, perfumaria_venda: 0, kits_qtd: 0, unidades_valor: 0, vitaminas_qtd: 0 }]));
  if (!porPessoa.size) return out;
  const mm = String(mes).padStart(2, '0');
  const ini = `${ano}-${mm}-01`;
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  const pessoas = [...porPessoa.keys()];
  const planos = await erpQuery("SELECT id, nome FROM planoremuneracao WHERE status='A'");
  const P = n => { const p = planos.find(x => (x.nome || '').trim().toLowerCase() === n); return p && p.id; };
  const setCampo = (rows, campo) => { for (const r of rows) { const id = porPessoa.get(Number(r.pessoaid)); if (id) out.get(id)[campo] = Number(r.v) || 0; } };
  // casa a classificação do produto com a do plano OU qualquer DESCENDENTE dela (via caminho) —
  // Premiação lista nós-folha (match igual), mas Perfumista lista nós altos (PERFUMARIA/VAREJO/
  // CONVENIÊNCIA) e os produtos ficam em sub-nós abaixo; sem descendente, perfumaria vinha zero.
  const comSQL = `SELECT u.pessoaid, COALESCE(SUM(iv.valortotal),0) v FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid ${SELLER_JOIN}
    JOIN embalagem e ON e.id=iv.embalagemid JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid JOIN classificacao c ON c.id=cp.classificacaoid
    WHERE EXISTS (SELECT 1 FROM planoremuneracaoitem pri JOIN classificacao pc ON pc.id=pri.classificacaoid
        WHERE pri.planoremuneracaoid=$1 AND pri.classificacaoid IS NOT NULL AND (c.caminho=pc.caminho OR c.caminho LIKE pc.caminho||' > %'))
      AND v.status='F' AND iv.status='F' AND v.datahoraabertura>=$2 AND v.datahoraabertura<$3 AND u.pessoaid = ANY($4::bigint[]) GROUP BY u.pessoaid`;
  const qtySQL = `SELECT u.pessoaid, COALESCE(SUM(iv.quantidade),0) v FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid ${SELLER_JOIN}
    JOIN embalagem e ON e.id=iv.embalagemid
    WHERE EXISTS(SELECT 1 FROM planoremuneracaoitem pri WHERE pri.planoremuneracaoid=$1 AND (pri.embalagemid=iv.embalagemid OR pri.produtoid=e.produtoid))
      AND v.status='F' AND iv.status='F' AND v.datahoraabertura>=$2 AND v.datahoraabertura<$3 AND u.pessoaid = ANY($4::bigint[]) GROUP BY u.pessoaid`;
  const valSQL = `SELECT u.pessoaid, COALESCE(SUM(iv.quantidade*pri.bonificacao),0) v FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid ${SELLER_JOIN}
    JOIN embalagem e ON e.id=iv.embalagemid
    JOIN LATERAL (SELECT bonificacao FROM planoremuneracaoitem pri WHERE pri.planoremuneracaoid=$1 AND (pri.embalagemid=iv.embalagemid OR pri.produtoid=e.produtoid) LIMIT 1) pri ON true
    WHERE v.status='F' AND iv.status='F' AND v.datahoraabertura>=$2 AND v.datahoraabertura<$3 AND u.pessoaid = ANY($4::bigint[]) GROUP BY u.pessoaid`;
  if (P('premiação')) setCampo(await erpQuery(comSQL, [P('premiação'), ini, fim, pessoas]), 'premiacao_venda');
  if (P('perfumista')) setCampo(await erpQuery(comSQL, [P('perfumista'), ini, fim, pessoas]), 'perfumaria_venda');
  if (P('vitaminas')) setCampo(await erpQuery(qtySQL, [P('vitaminas'), ini, fim, pessoas]), 'vitaminas_qtd');
  if (P('kits')) setCampo(await erpQuery(qtySQL, [P('kits'), ini, fim, pessoas]), 'kits_qtd');
  if (P('unidades vendidas')) setCampo(await erpQuery(valSQL, [P('unidades vendidas'), ini, fim, pessoas]), 'unidades_valor');
  _basesCache.set(chave, { at: Date.now(), val: out });
  return out;
}

// Puxa as bases do ERP e grava em premiacao_base (snapshot) — por nome exato do colaborador, então
// o listar casa 100% (sem "sem cadastro"). Bloqueado se o mês estiver fechado.
async function puxarDoErp(empresaId, { mes, ano }) {
  mes = Number(mes); ano = Number(ano);
  exigeAberto(empresaId, mes, ano);
  const bases = await basesErp(empresaId, mes, ano);
  const normNome = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM premiacao_base WHERE empresa_id=? AND mes=? AND ano=?').run(empresaId, mes, ano);
    const ins = db.prepare('INSERT INTO premiacao_base (id, empresa_id, mes, ano, tipo, nome_norm, nome_original, valor, pct) VALUES (?,?,?,?,?,?,?,?,?)');
    let n = 0;
    for (const b of bases.values()) {
      const nn = normNome(b.nome);
      const linhas = [['premiacao', b.premiacao_venda, null], ['perfumaria', b.perfumaria_venda, null], ['vitaminas', b.vitaminas_qtd, null], ['kits', b.kits_qtd, null], ['unidades', b.unidades_valor, null]];
      for (const [tipo, valor, pct] of linhas) if (valor) { ins.run(uuidv4(), empresaId, mes, ano, tipo, nn, b.nome, valor, pct); n++; }
    }
    return n;
  });
  const n = tx();
  return { ok: true, colaboradores: bases.size, linhas: n, mes, ano };
}

// ── regras dos planos de remuneração (ERP, só leitura) ──────────────────────
// Mostra cada plano (Premiação, Perfumista, Kits, Unidades, Vitaminas) com TUDO que o compõe:
// classificações (caminho), embalagens/produtos, grupos — e a comissão/bonificação de cada item.
let _planosCache = null, _planosAt = 0;
async function planosErp(force) {
  if (!force && _planosCache && Date.now() - _planosAt < 10 * 60 * 1000) return _planosCache;
  const rows = await erpQuery(`
    SELECT pr.id AS plano_id, pr.nome AS plano, pr.tipo AS plano_tipo,
      pri.tipo AS item_tipo, pri.comissao, pri.bonificacao,
      cl.caminho AS classificacao, cl.nome AS classificacao_nome,
      COALESCE(e.descricao, pe.descricao) AS embalagem, e.codigobarras,
      pp.descricao AS produto, gr.nome AS grupo, fp.nome AS fabricante
    FROM planoremuneracaoitem pri
    JOIN planoremuneracao pr ON pr.id = pri.planoremuneracaoid
    LEFT JOIN classificacao cl ON cl.id = pri.classificacaoid
    LEFT JOIN embalagem e ON e.id = pri.embalagemid
    LEFT JOIN produto pe ON pe.id = e.produtoid
    LEFT JOIN produto pp ON pp.id = pri.produtoid
    LEFT JOIN gruporemarcacao gr ON gr.id = pri.gruporemarcacaoid
    LEFT JOIN fabricante fab ON fab.id = pri.fabricanteid
    LEFT JOIN pessoa fp ON fp.id = fab.pessoaid
    WHERE pr.status = 'A'
    ORDER BY pr.nome, pri.tipo, 8`);
  const map = new Map(); const planos = [];
  for (const r of rows) {
    let p = map.get(r.plano_id);
    if (!p) { p = { id: r.plano_id, plano: r.plano, tipo: r.plano_tipo === 'A' ? 'Comissão' : 'Bonificação', itens: [] }; map.set(r.plano_id, p); planos.push(p); }
    const eh = r.item_tipo === 'D' ? 'Classificação' : (r.classificacao ? 'Classificação' : r.embalagem ? 'Produto' : r.grupo ? 'Grupo' : r.fabricante ? 'Fabricante' : 'Item');
    p.itens.push({
      tipo: eh,
      nome: r.classificacao || r.classificacao_nome || r.embalagem || r.produto || r.grupo || r.fabricante || '—',
      codigo: r.codigobarras || null,
      comissao: r.comissao == null ? null : Number(r.comissao),
      bonificacao: r.bonificacao == null ? null : Number(r.bonificacao),
    });
  }
  _planosCache = { ok: true, planos, gerado_em: new Date().toISOString() };
  _planosAt = Date.now();
  return _planosCache;
}

// aplica o MESMO % de premiação a vários colaboradores de uma vez (preserva os outros campos).
function salvarItemLote(empresaId, { mes, ano, colaborador_ids, premiacao_pct }) {
  if (!Array.isArray(colaborador_ids) || !colaborador_ids.length) throw new Error('Nenhum colaborador selecionado.');
  exigeAberto(empresaId, mes, ano);
  const pct = premiacao_pct === '' || premiacao_pct == null ? null : Number(premiacao_pct);
  const up = db.prepare(`INSERT INTO premiacao_item (id, empresa_id, mes, ano, colaborador_id, premiacao_pct, atualizado_em)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, mes, ano, colaborador_id) DO UPDATE SET premiacao_pct=excluded.premiacao_pct, atualizado_em=datetime('now')`);
  const tx = db.transaction(() => { for (const cid of colaborador_ids) up.run(uuidv4(), empresaId, Number(mes), Number(ano), cid, pct); });
  tx();
  return { ok: true, n: colaborador_ids.length };
}

module.exports = { importar, listar, salvarItem, salvarItemLote, salvarCfg, getCfg, status, fechar, exportarCarga, importarIds, importarDifCaixa, listarContas, salvarConta, planosErp, basesErp, puxarDoErp };
