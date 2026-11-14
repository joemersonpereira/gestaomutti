// pesquisaPrecoErp.js — Pesquisa de Preço (Joe 2026-11-14). Fase 1: lista produtos do ERP p/ montar a
// planilha de pesquisa (formato da empresa terceirizada): código, EAN, descrição, estrutura mercadológica,
// preço de venda por FILIAL de referência + venda (und) p/ ordenar por "mais venda"/curva. ERP só leitura.
const { erpQuery, habilitado } = require('../db/erp');
const { produtosDoComprador } = require('./indicadoresCompraErp');

// Filiais de referência da planilha (as colunas "Preço Atual - <loja>"). Configurável depois.
const FILIAIS = [
  { chave: 'entrerios', nome: 'ENTRE RIOS', uni: 70424 },
  { chave: 'esplanada', nome: 'ESPLANADA', uni: 70423 },
  { chave: 'rioreal', nome: 'MUTTI RIO REAL', uni: 70421 },
  { chave: 'farmarocha', nome: 'FARMAROCHA', uni: 70418 },
];
const UNI_VENDA = 70423; // base de "venda und" p/ curva/mais-venda (Esplanada = loja referência de giro)

async function produtosDaClassificacao(classificacaoId) {
  const rows = await erpQuery(`SELECT DISTINCT cp.produtoid FROM classificacaoproduto cp
    JOIN classificacao cc ON cc.id=cp.classificacaoid
    WHERE cc.caminho LIKE (SELECT caminho FROM classificacao WHERE id=$1) || '%'`, [Number(classificacaoId)]);
  return rows.map(r => Number(r.produtoid));
}

// Lista produtos p/ seleção da pesquisa. Filtra por comprador/classificação/busca; traz preço por filial
// + venda und (period). Ordena por venda desc (os "mais venda" primeiro); curva ABC calculada no conjunto.
async function listarProdutos(empresaId, { compradorId = null, classificacaoId = null, produtoIds = null, busca = '', dias = 90, limite = 400 } = {}) {
  if (!habilitado()) return { erp: false };
  // produtoIds (ex.: de uma TAG) + comprador + classificação se CRUZAM (ex.: grupo X com tag "formador de opinião").
  let prodIds = produtoIds && produtoIds.length ? produtoIds.map(Number) : (compradorId ? await produtosDoComprador(empresaId, compradorId) : null);
  if (classificacaoId) { const cp = await produtosDaClassificacao(classificacaoId); const set = new Set(cp); prodIds = prodIds ? prodIds.filter(id => set.has(Number(id))) : cp; }
  if (prodIds && !prodIds.length) return { erp: true, filiais: FILIAIS, itens: [] };

  // preços por filial via subselect (precoembalagemunidadenegocio, fallback embalagem).
  const precoCols = FILIAIS.map(f => `COALESCE((SELECT pv.precovenda FROM precoembalagemunidadenegocio pv WHERE pv.embalagemid=e.id AND pv.unidadenegocioid=${f.uni}), e.precovenda, e.precoreferencial, 0) preco_${f.chave}`).join(',\n      ');
  const termo = busca ? `%${String(busca).trim().toLowerCase()}%` : null;
  const cond = []; const params = [UNI_VENDA, Number(dias) || 90];
  if (prodIds) { params.push(prodIds); cond.push(`pr.id = ANY($${params.length}::bigint[])`); }
  if (termo) { params.push(termo); params.push(String(busca).trim()); cond.push(`(lower(pr.descricao) LIKE $${params.length - 1} OR e.codigobarras = $${params.length})`); }
  const where = cond.length ? 'AND ' + cond.join(' AND ') : '';

  const rows = await erpQuery(`
    SELECT DISTINCT ON (pr.id) pr.id produto_id, pr.codigo codigo, e.codigobarras ean, pr.descricao,
      (SELECT COALESCE(cpai.nome||' > ','')||cc.nome FROM classificacaoproduto cpx JOIN classificacao cc ON cc.id=cpx.classificacaoid
        LEFT JOIN classificacao cpai ON cpai.id=cc.classificacaopaiid WHERE cpx.produtoid=pr.id ORDER BY cc.folha DESC NULLS LAST, cc.profundidade DESC NULLS LAST LIMIT 1) estrutura,
      COALESCE(pf.razaosocial, pf.nome) laboratorio,
      COALESCE((SELECT sum(iv.quantidade) FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
        WHERE iv.embalagemid=e.id AND v.unidadenegocioid=$1 AND v.status IN ('F','D') AND iv.status='F'
          AND v.datahorafechamento >= now() - ($2 || ' days')::interval),0) venda_und,
      ${precoCols}
    FROM produto pr
    JOIN embalagem e ON e.produtoid=pr.id AND e.codigobarras IS NOT NULL AND e.codigobarras <> ''
    LEFT JOIN fabricante fb ON fb.id=pr.fabricanteid
    LEFT JOIN pessoa pf ON pf.id=fb.pessoaid
    WHERE pr.status='A' ${where}
    ORDER BY pr.id, e.quantidadeporembalagem ASC NULLS LAST, e.precovenda ASC
    LIMIT ${Number(limite) || 400}`, params);

  let itens = rows.map(r => ({
    produtoId: Number(r.produto_id), codigo: r.codigo, ean: r.ean, descricao: (r.descricao || '').trim(),
    estrutura: r.estrutura || '', laboratorio: (r.laboratorio || '').trim() || null, vendaUnd: Number(r.venda_und) || 0,
    precos: Object.fromEntries(FILIAIS.map(f => [f.chave, Math.round((Number(r['preco_' + f.chave]) || 0) * 100) / 100])),
  }));
  // ordena por venda desc e calcula curva ABC (A=80%, B=95%, C=resto; sem venda = '-') no conjunto.
  itens.sort((a, b) => b.vendaUnd - a.vendaUnd);
  const tot = itens.reduce((s, i) => s + i.vendaUnd, 0); let acc = 0;
  itens.forEach(i => { if (!tot || !i.vendaUnd) { i.curva = '-'; return; } acc += i.vendaUnd; const p = acc / tot; i.curva = p <= 0.8 ? 'A' : p <= 0.95 ? 'B' : 'C'; });
  return { erp: true, filiais: FILIAIS, dias, itens };
}

// Gera a planilha de pesquisa (xlsx) no FORMATO da empresa: aba Produtos + aba Parametros.
// produtoIds = selecionados; filialRef = chave da filial de referência (default entrerios).
async function gerarPlanilha(empresaId, { produtoIds = [], filialRef = 'entrerios' } = {}) {
  const XLSX = require('xlsx');
  const r = await listarProdutos(empresaId, { produtoIds, limite: 5000 });
  const itens = r.itens || [];
  const refNome = (FILIAIS.find(f => f.chave === filialRef) || FILIAIS[0]).nome;
  const header = ['Código Produto', 'Código EAN', 'Descrição Completa', 'Estrutura Mercadológica (Categoria)', 'Preço de Referência', ...FILIAIS.map(f => 'Preço Atual - ' + f.nome)];
  const linhas = itens.map(i => [i.codigo || i.produtoId, i.ean, i.descricao, i.estrutura, i.precos[filialRef] || 0, ...FILIAIS.map(f => i.precos[f.chave] || 0)]);
  const wsProd = XLSX.utils.aoa_to_sheet([header, ...linhas]);
  wsProd['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 48 }, { wch: 34 }, { wch: 14 }, ...FILIAIS.map(() => ({ wch: 16 }))];
  const wsPar = XLSX.utils.aoa_to_sheet([
    ['Parâmetros do modelo de pesquisa de preço'], [],
    ['Filial de referência (preço p/ competitividade)', refNome], [],
    ['Legenda'], ['Fundo amarelo', 'Célula para editar (filial de referência).'],
    ['Gerado em', new Date().toLocaleString('pt-BR')], ['Itens', itens.length],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsProd, 'Produtos');
  XLSX.utils.book_append_sheet(wb, wsPar, 'Parametros');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Preço atual (Alpha) por EAN numa filial de referência — p/ o cruzamento.
async function precosPorEan(empresaId, eans, uni) {
  if (!habilitado() || !eans || !eans.length) return {};
  const lista = [...new Set(eans.map(e => String(e).trim()).filter(Boolean))];
  const rows = await erpQuery(`
    SELECT DISTINCT ON (e.codigobarras) e.codigobarras ean, pr.descricao,
      COALESCE((SELECT pv.precovenda FROM precoembalagemunidadenegocio pv WHERE pv.embalagemid=e.id AND pv.unidadenegocioid=$2), e.precovenda, e.precoreferencial, 0) preco
    FROM embalagem e JOIN produto pr ON pr.id=e.produtoid
    WHERE e.codigobarras = ANY($1::text[])
    ORDER BY e.codigobarras, e.precovenda DESC NULLS LAST`, [lista, uni || UNI_VENDA]);
  const m = {}; rows.forEach(r => { m[String(r.ean)] = { preco: Math.round((Number(r.preco) || 0) * 100) / 100, descricao: (r.descricao || '').trim() }; });
  return m;
}

// Cruza o RETORNO da empresa (xlsx base64 com preços dos concorrentes) × nosso preço ATUAL do Alpha.
// Detecta a coluna-chave (EAN/código) e as colunas de concorrente (preços que NÃO são as nossas filiais).
async function cruzar(empresaId, { base64 = '', filialRef = 'entrerios' } = {}) {
  const XLSX = require('xlsx');
  if (!base64) throw new Error('Envie a planilha devolvida.');
  const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
  const ws = wb.Sheets['Produtos'] || wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  if (!aoa.length) return { ok: true, itens: [], concorrentes: [], resumo: {} };
  const head = aoa[0].map(h => String(h == null ? '' : h).trim());
  const low = head.map(h => h.toLowerCase());
  const idxEan = low.findIndex(h => h.includes('ean'));
  const idxCod = low.findIndex(h => h.includes('código produto') || h.includes('codigo produto') || h === 'código' || h === 'codigo');
  const idxDesc = low.findIndex(h => h.includes('descri'));
  // nossas colunas = filiais/MUTTI/referência; descrição/estrutura/código/ean = ignoradas; o resto = concorrente.
  const nossas = /entre rios|esplanada|rio real|farmarocha|mutti|refer[eê]ncia/i;
  const ignora = /ean|código|codigo|descri|estrutura|categoria|laborat|curva|ranking|tipo|venda/i;
  const concIdx = head.map((h, i) => ({ h, i })).filter(({ h, i }) => h && i !== idxEan && i !== idxCod && i !== idxDesc && !nossas.test(h) && !ignora.test(h));
  const uni = (FILIAIS.find(f => f.chave === filialRef) || FILIAIS[0]).uni;
  const eans = aoa.slice(1).map(r => idxEan >= 0 ? String(r[idxEan] || '').trim() : '').filter(Boolean);
  const alpha = await precosPorEan(empresaId, eans, uni);
  const toNum = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  const itens = aoa.slice(1).map(r => {
    const ean = idxEan >= 0 ? String(r[idxEan] || '').trim() : '';
    const a = alpha[ean];
    const nossoPreco = a ? a.preco : null;
    const precos = {}; let menor = null, menorNome = null;
    concIdx.forEach(({ h, i }) => { const v = toNum(r[i]); precos[h] = v; if (v != null && (menor == null || v < menor)) { menor = v; menorNome = h; } });
    let status = 'sem_conc';
    if (menor != null && nossoPreco != null) status = nossoPreco > menor ? 'mais_caro' : nossoPreco < menor ? 'mais_barato' : 'igual';
    const gap = (menor != null && nossoPreco != null) ? Math.round((nossoPreco - menor) * 100) / 100 : null;
    return { ean, codigo: idxCod >= 0 ? r[idxCod] : null, descricao: (idxDesc >= 0 ? String(r[idxDesc] || '') : (a ? a.descricao : '')).trim(),
      nossoPreco, precos, menorConc: menor, menorConcNome: menorNome, gap, gapPct: (menor && nossoPreco) ? Math.round((nossoPreco - menor) / menor * 1000) / 10 : null, status };
  }).filter(i => i.ean || i.descricao);
  const resumo = { total: itens.length, maisCaro: itens.filter(i => i.status === 'mais_caro').length,
    maisBarato: itens.filter(i => i.status === 'mais_barato').length, igual: itens.filter(i => i.status === 'igual').length,
    semConc: itens.filter(i => i.status === 'sem_conc').length, semNosso: itens.filter(i => i.nossoPreco == null).length };
  return { ok: true, concorrentes: concIdx.map(c => c.h), filialRef, itens, resumo };
}

// Cadernos de oferta DO ALPHA (cadernooferta) — p/ escolher o nome do caderno (não digitar à mão).
async function cadernosErp(empresaId, { busca = '', limite = 200 } = {}) {
  if (!habilitado()) return [];
  const cond = []; const params = [];
  if (busca) { params.push(`%${String(busca).trim().toLowerCase()}%`); cond.push(`lower(nome) LIKE $${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const rows = await erpQuery(`SELECT id, nome, status, to_char(datahorainicial,'YYYY-MM-DD') ini, to_char(datahorafinal,'YYYY-MM-DD') fim
    FROM cadernooferta ${where} ORDER BY datahorafinal DESC NULLS LAST, nome LIMIT ${Number(limite) || 200}`, params);
  return rows.map(r => ({ id: String(r.id), nome: (r.nome || '').trim(), status: r.status, ini: r.ini, fim: r.fim }));
}

module.exports = { listarProdutos, gerarPlanilha, precosPorEan, cruzar, cadernosErp, FILIAIS };
