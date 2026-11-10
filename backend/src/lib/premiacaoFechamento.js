// premiacaoFechamento.js — Fechamento mensal de Premiação a partir dos relatórios do ERP
// ("Análise de Plano de Remuneração": Premiação, Perfumaria, Kits, Unidades vendidas, Vitaminas).
// Lê cada relatório (xls/csv), guarda a BASE por colaborador, cruza com os marcadores do cadastro
// (perfumista/premiacao_gestao/premiacao_caixa) e calcula o prêmio bruto, os descontos e o líquido.
// O sistema NÃO escreve no ERP — os relatórios são a fonte da base (o Joe os baixa todo mês).
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { erpQuery } = require('../db/erp');

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
const CFG_PADRAO = { uv_valor_un: 0, kit_min: 100, kit_alto: 250, kit_baixo: 120, taxa_adm: 1.2 };
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
function fechar(empresaId, { mes, ano, usuario, reabrir }) {
  mes = Number(mes); ano = Number(ano);
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
  const st = status(empresaId, mes, ano);
  const resumo = {
    colaboradores: linhas.length,
    sem_cadastro: linhas.filter(l => l.sem_cadastro).length,
    bruto: round(linhas.reduce((s, l) => s + l.bruto, 0)),
    descontos: round(linhas.reduce((s, l) => s + l.descontos, 0)),
    liquido: round(linhas.reduce((s, l) => s + l.liquido, 0)),
  };
  return { ok: true, mes, ano, cfg, linhas, resumo, relatorios: [...tiposImportados], fechado: st.fechado, fechado_em: st.fechado_em, fechado_por: st.fechado_por };
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
function exportarCarga(empresaId, mes, ano) {
  const cfg = getCfg(empresaId);
  const taxaPct = cfg.taxa_adm != null ? Number(cfg.taxa_adm) : 1.2;
  const L = listar(empresaId, { mes: Number(mes), ano: Number(ano) });
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

  const wb = XLSX.utils.book_new();
  const nomesUsados = new Set();
  for (const [key, g] of grupos) {
    const soma = round(g.linhas.reduce((s, x) => s + x.valor, 0));
    const taxa = round(soma * (g.taxa || 0) / 100);
    const aoa = [
      ['SOLICITAÇÃO DE PREMIAÇÕES – CARREGAMENTO'],
      ['Empresa', String(g.empresa).trim()],
      [],
      ['CNPJ', g.cnpj_fmt],
      ['Produto', g.produto],
      ['Código', g.codigo],
      ['Taxa Adm. (%)', Number(g.taxa).toFixed(2) + '%', '', taxa],
      ['Valor da premiação', soma, 'Modelo', 1],
      ['Total da fatura', round(soma + taxa)],
      ['CPF/CNPJ', 'Nome', 'Valor', 'ID', 'OBSERVAÇÃO'],
      ...g.linhas.map(x => [x.cpf, x.nome, x.valor, x.id, x.obs]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    let nome = (g.cnpj_fmt || '').replace(/\D/g, '') || String(key).slice(0, 28);
    nome = nome.slice(0, 31); let n = nome, i = 2;
    while (nomesUsados.has(n)) { n = nome.slice(0, 28) + '_' + i++; }
    nomesUsados.add(n);
    XLSX.utils.book_append_sheet(wb, ws, n);
  }
  if (!grupos.size) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Sem colaboradores com líquido a pagar e cadastro neste mês.']]), 'vazio');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, lojas: grupos.size, colaboradores: pagaveis.length, sem_id: semId, sem_vinculo: semVinculo };
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

module.exports = { importar, listar, salvarItem, salvarCfg, getCfg, status, fechar, exportarCarga, importarIds, listarContas, salvarConta, planosErp };
