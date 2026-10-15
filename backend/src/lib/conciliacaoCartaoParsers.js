// conciliacaoCartaoParsers.js — lê os relatórios das operadoras (xlsx/xls/csv) e devolve
// linhas NORMALIZADAS, iguais para todas as operadoras. Quem confronta é conciliacaoCartao.js.
//
// Linha normalizada: { data, hora, nsu, autorizacao, cnpj, valor, valorLiquido, taxa,
//                      parcelas, grupo, bandeira, status, cliente, cartao, bruto }
// grupo = DEBITO | CREDITO | PARCELADO | VOUCHER | PIX | CREDIARIO | PREPAGO | OUTRO
const XLSX = require('xlsx');

// ── helpers ────────────────────────────────────────────────────────────────
// Aceita "R$ 1.234,56", "R$ 35.99", "     210,00", "1234". Decide o decimal pelo ÚLTIMO separador.
function num(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).replace(/[^\d,.-]/g, '').trim();
  if (!s || s === '-') return 0;
  const iv = s.lastIndexOf(','), ip = s.lastIndexOf('.');
  const dec = Math.max(iv, ip);
  const casas = s.length - dec - 1;
  if (dec >= 0 && casas >= 1 && casas <= 2) s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1);
  else s = s.replace(/[.,]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function pct(v) { return num(String(v).replace('%', '')); }

// "20/08/2026 18:06:15" | "20/08/2026" | Date → { data:'2026-08-20', hora:'18:06:15' }
function dataHora(v) {
  if (v instanceof Date && !isNaN(v)) {
    const p = n => String(n).padStart(2, '0');
    return { data: v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate()),
      hora: p(v.getHours()) + ':' + p(v.getMinutes()) + ':' + p(v.getSeconds()) };
  }
  const s = String(v == null ? '' : v).trim();
  const br = s.match(/(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!br && !iso) return { data: null, hora: null };
  const data = br ? br[3] + '-' + br[2] + '-' + br[1] : iso[1] + '-' + iso[2] + '-' + iso[3];
  const h = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return { data, hora: h ? h[1].padStart(2, '0') + ':' + h[2] + ':' + (h[3] || '00') : null };
}

const txt = v => String(v == null ? '' : v).trim();
const soDigitos = v => txt(v).replace(/\D/g, '');
const vazio = v => { const t = txt(v); return !t || t === '-' || t === '--'; };

// ── detecção do layout pelo cabeçalho ──────────────────────────────────────
const ASSINATURAS = [
  { layout: 'REDE', operadora: 'Rede', tem: ['nsu/cv', 'modalidade'] },
  { layout: 'BRASILCARD', operadora: 'Brasil Card', tem: ['numero autorizacao', 'valor da venda'] },
  // "Relatório de vendas completos": 1 linha por PARCELA (com vencimento dela), não por venda —
  // formato diferente do BRASILCARD de cima (que já vem com a venda inteira numa linha só).
  { layout: 'BRASILCARD_DET', operadora: 'Brasil Card', tem: ['numero autorizacao', 'valor bruto', 'data de vencimento'] },
  { layout: 'LECARD', operadora: 'Le Card', tem: ['autoriz', 'compr.'] },
  { layout: 'BRACOV', operadora: 'Bracov', tem: ['credenciado', 'valor_trans'] },
  { layout: 'NUTRICASH', operadora: 'Nutricash', tem: ['cod. autorizacao', 'portador'] },
  { layout: 'MULVI', operadora: 'Banese / Mulvi', tem: ['data_transacao', 'valor_bruto'] },
];

// tira acento e baixa a caixa — os relatórios variam em acentuação/encoding
const chave = v => txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

function detectar(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const linha = (rows[i] || []).map(chave).join('|');
    for (const a of ASSINATURAS) if (a.tem.every(t => linha.includes(t))) return { ...a, headerIdx: i };
  }
  return null;
}

// acha a coluna pelo NOME do cabeçalho (tolerante a ordem, acento e caixa)
function mapaColunas(header) {
  const m = {};
  (header || []).forEach((h, i) => { const k = chave(h); if (k && !(k in m)) m[k] = i; });
  return (...nomes) => {
    for (const n of nomes) {
      const alvo = chave(n);
      if (alvo in m) return m[alvo];
      const achou = Object.keys(m).find(k => k.startsWith(alvo));
      if (achou) return m[achou];
    }
    return -1;
  };
}

// ── parsers por operadora ──────────────────────────────────────────────────
// REDE: multibandeira/multimodalidade — o arquivo diz débito/crédito/pix/voucher e traz o CNPJ da loja.
function parseRede(rows, hi) {
  const c = mapaColunas(rows[hi]);
  const iData = c('data da venda'), iHora = c('hora da venda'), iSt = c('status da venda'),
    iVal = c('valor da venda original', 'valor da venda'), iLiq = c('valor liquido'),
    iMod = c('modalidade'), iTipo = c('tipo'), iParc = c('numero de parcelas'), iBand = c('bandeira'),
    iTaxa = c('taxa mdr'), iNsu = c('nsu/cv', 'nsu'), iAut = c('numero da autorizacao'), iCnpj = c('cnpj'),
    iEstab = c('numero do estabelecimento'), iPrazo = c('prazo de recebimento'), iLote = c('resumo de vendas');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (vazio(r[iData])) continue;
    const dh = dataHora(r[iData]); if (!dh.data) continue;
    const mod = chave(r[iMod]), tipo = chave(r[iTipo]);
    const parcelas = Math.max(1, Number(soDigitos(r[iParc])) || 1);
    let grupo = 'OUTRO';
    if (mod.startsWith('pix')) grupo = 'PIX';
    else if (mod.startsWith('voucher')) grupo = 'VOUCHER';
    else if (mod.startsWith('deb')) grupo = 'DEBITO';
    else if (mod.startsWith('cred')) grupo = (parcelas > 1 || tipo.includes('parcelad')) ? 'PARCELADO' : 'CREDITO';
    const st = chave(r[iSt]);
    out.push({
      data: dh.data, hora: vazio(r[iHora]) ? dh.hora : txt(r[iHora]), nsu: vazio(r[iNsu]) ? '' : txt(r[iNsu]),
      autorizacao: vazio(r[iAut]) ? '' : txt(r[iAut]), cnpj: soDigitos(r[iCnpj]),
      valor: num(r[iVal]), valorLiquido: num(r[iLiq]), taxa: pct(r[iTaxa]), parcelas, grupo,
      bandeira: vazio(r[iBand]) ? '' : txt(r[iBand]),
      status: (st === 'aprovada' || st === 'pago' || st === 'aprovado') ? 'OK' : st.toUpperCase(),
      cliente: '', cartao: '', tipoOperadora: mod + (tipo ? ' / ' + tipo : ''),
      // usados pela trilha do repasse: o nº do estabelecimento identifica a filial no crédito,
      // e o prazo diz em que dia essa venda deve cair
      estabelecimento: soDigitos(r[iEstab]), prazo: vazio(r[iPrazo]) ? '' : txt(r[iPrazo]),
      lote: vazio(r[iLote]) ? '' : txt(r[iLote]),
    });
  }
  return out;
}

// BRASIL CARD: convênio próprio, sem NSU e sem CNPJ (a loja vem do upload).
function parseBrasilCard(rows, hi) {
  const c = mapaColunas(rows[hi]);
  const iData = c('data da venda'), iAut = c('numero autorizacao'), iParc = c('numero de parcelas'),
    iCart = c('cartao'), iNome = c('nome'), iVal = c('valor da venda'), iLiq = c('valor liquido'), iSt = c('status da venda'),
    // só existem quando a busca é feita com "INCLUIR FILIAIS" marcado — é o que permite ratear por loja
    iPdv = c('pdv'), iCnpj = c('cnpj');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (vazio(r[iData]) || /total/i.test(txt(r[0]))) continue;
    const dh = dataHora(r[iData]); if (!dh.data) continue;
    const parcelas = Math.max(1, Number(soDigitos(r[iParc])) || 1);
    const st = chave(r[iSt]);
    const bruto = num(r[iVal]), liquido = num(r[iLiq]);
    out.push({
      data: dh.data, hora: dh.hora, nsu: '', autorizacao: txt(r[iAut]),
      cnpj: soDigitos(r[iCnpj]), estabelecimento: soDigitos(r[iPdv]),
      valor: bruto, valorLiquido: liquido,
      // o Brasil Card não publica a taxa: ela sai da diferença bruto − líquido (2,99% a vista, sobe por parcela)
      taxa: bruto ? Math.round(((bruto - liquido) / bruto) * 10000) / 100 : 0, parcelas,
      grupo: null, bandeira: 'Brasil Card',
      status: st.startsWith('autoriz') ? 'OK' : st.toUpperCase(), cliente: txt(r[iNome]), cartao: txt(r[iCart]),
      tipoOperadora: parcelas > 1 ? 'convenio ' + parcelas + 'x' : 'convenio a vista',
    });
  }
  return out;
}

// BRASIL CARD "detalhado" (Relatório de vendas completos): 1 linha por PARCELA — Data da venda,
// Data de vencimento, Número autorização, Parcela(s), Cartão, Nome, Valor Bruto, Valor Líquido,
// Data de pagamento, e uma última coluna (chamada "Modalidade" no arquivo, mas na prática marca o
// TIPO da linha: "Venda" ou "Tarifa"). Agrupa pelo número de autorização — é o que liga as parcelas
// de uma mesma venda — e soma bruto/líquido, igual o ERP agrupa os títulos da mesma transação.
// Tarifa (mensalidade da maquininha) não é venda de cliente: fica fora do confronto de propósito.
// Com "INCLUIR FILIAIS" marcado no portal, o arquivo ganha PDV + CNPJ por linha — aí dá pra achar
// a loja sozinho (igual Rede/Bracov) em vez de pedir pra escolher; sem essas colunas, cai na loja
// escolhida no upload (arquivo de uma loja só).
function parseBrasilCardDetalhado(rows, hi) {
  const c = mapaColunas(rows[hi]);
  const iData = c('data da venda'), iAut = c('numero autorizacao'), iCart = c('cartao'),
    iNome = c('nome'), iVal = c('valor bruto'), iLiq = c('valor liquido'), iTipo = c('modalidade'),
    iPdv = c('pdv'), iCnpj = c('cnpj');
  const porAut = new Map();
  for (const r of rows.slice(hi + 1)) {
    if (vazio(r[iData]) || chave(r[iTipo]) !== 'venda') continue;
    const dh = dataHora(r[iData]); if (!dh.data) continue;
    const aut = txt(r[iAut]); if (!aut) continue;
    let v = porAut.get(aut);
    if (!v) { v = { data: dh.data, hora: dh.hora, autorizacao: aut, cliente: txt(r[iNome]), cartao: txt(r[iCart]),
      cnpj: soDigitos(r[iCnpj]), estabelecimento: soDigitos(r[iPdv]), bruto: 0, liquido: 0, parcelas: 0 }; porAut.set(aut, v); }
    v.bruto += num(r[iVal]); v.liquido += num(r[iLiq]); v.parcelas++;
  }
  return [...porAut.values()].map(v => ({
    data: v.data, hora: v.hora, nsu: '', autorizacao: v.autorizacao, cnpj: v.cnpj, estabelecimento: v.estabelecimento,
    valor: Math.round(v.bruto * 100) / 100, valorLiquido: Math.round(v.liquido * 100) / 100,
    taxa: v.bruto ? Math.round(((v.bruto - v.liquido) / v.bruto) * 10000) / 100 : 0,
    parcelas: v.parcelas, grupo: null, bandeira: 'Brasil Card', status: 'OK',
    cliente: v.cliente, cartao: v.cartao,
    tipoOperadora: v.parcelas > 1 ? 'convenio ' + v.parcelas + 'x' : 'convenio a vista',
  }));
}

// LE CARD: relatório "de tela" (linhas em branco e seções); a linha válida é a que tem data.
function parseLeCard(rows, hi) {
  const c = mapaColunas(rows[hi]);
  const iData = c('data'), iCli = c('cliente'), iCart = c('numero do cartao'), iVal = c('valor'),
    iParc = c('parc.'), iAut = c('autoriz'), iComp = c('compr.'), iLoja = c('loja');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (vazio(r[iData])) continue;
    const dh = dataHora(r[iData]); if (!dh.data) continue;
    const parcelas = Math.max(1, Number(soDigitos(r[iParc])) || 1);
    out.push({
      data: dh.data, hora: dh.hora, nsu: vazio(r[iComp]) ? '' : txt(r[iComp]), autorizacao: txt(r[iAut]), cnpj: '',
      valor: num(r[iVal]), valorLiquido: 0, taxa: 0, parcelas, grupo: null, bandeira: 'Le Card',
      status: 'OK', cliente: txt(r[iCli]), cartao: txt(r[iCart]), lojaArquivo: txt(r[iLoja]),
      tipoOperadora: 'beneficio',
    });
  }
  return out;
}

// BRACOV: "Movimento Diário de Vendas" — CREDENCIADO · NOME · CNPJ · DIA · HORA · TIPO_TRANS ·
// DESC_TRANS · NSU_HOST · NSU_AUTORIZ · CARTAO · QUANT_PARCELAS · VALOR_TRANS · SUBREDE.
// Não traz valor líquido nem taxa (isso só sai no relatório de repasse/lotes fechados) — aqui é
// só a venda bruta, uma linha por transação. Traz o CNPJ do credenciado (acha a loja sozinho).
function parseBracov(rows, hi) {
  const c = mapaColunas(rows[hi]);
  const iCart = c('cartao'), iData = c('dia'), iHora = c('hora'), iNsuHost = c('nsu_host'),
    iNsuAut = c('nsu_autoriz'), iVal = c('valor_trans'), iParc = c('quant_parcelas'),
    iDesc = c('desc_trans'), iCnpj = c('cnpj'), iCred = c('credenciado');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (vazio(r[iData])) continue;
    const dh = dataHora(r[iData]); if (!dh.data) continue;
    const parcelas = Math.max(1, Number(soDigitos(r[iParc])) || 1);
    out.push({
      data: dh.data, hora: txt(r[iHora]) || dh.hora, nsu: txt(r[iNsuHost]), autorizacao: txt(r[iNsuAut]),
      cnpj: soDigitos(r[iCnpj]), estabelecimento: soDigitos(r[iCred]),
      valor: num(r[iVal]), valorLiquido: 0, taxa: 0, parcelas,
      grupo: null, bandeira: 'Bracov', status: 'OK', cliente: '', cartao: txt(r[iCart]),
      tipoOperadora: txt(r[iDesc]).trim().toLowerCase() || 'convenio',
    });
  }
  return out;
}

// NUTRICASH: vale/benefício, sem loja no arquivo.
function parseNutricash(rows, hi) {
  const c = mapaColunas(rows[hi]);
  const iAut = c('cod. autorizacao'), iProd = c('produto'), iCli = c('cliente'), iPort = c('portador'),
    iCart = c('cartao'), iData = c('data'), iVal = c('valor'), iParc = c('parcelas'), iSt = c('status');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (vazio(r[iData])) continue;
    const dh = dataHora(r[iData]); if (!dh.data) continue;
    const parcelas = Math.max(1, Number(soDigitos(r[iParc])) || 1);
    const st = chave(r[iSt]);
    out.push({
      data: dh.data, hora: dh.hora, nsu: '', autorizacao: txt(r[iAut]), cnpj: '',
      valor: num(r[iVal]), valorLiquido: 0, taxa: 0, parcelas, grupo: null, bandeira: 'Nutricash',
      status: st.startsWith('valid') ? 'OK' : st.toUpperCase(), cliente: txt(r[iPort]) || txt(r[iCli]),
      cartao: txt(r[iCart]), tipoOperadora: chave(r[iProd]) || 'beneficio',
    });
  }
  return out;
}

// MULVI PAY / BANESE CARD: "Movimento de Vendas do Lojista - Analítica" (portal mulvipay.com.br).
// Um arquivo por CNPJ (a loja é escolhida no seletor do portal, não vem no arquivo) e uma linha
// de "SubTotal" depois de cada dia — essas são puladas.
function parseMulvi(rows, hi) {
  const c = mapaColunas(rows[hi]);
  const iData = c('data_transacao'), iNsu = c('nsu'), iBand = c('bandeira'), iMod = c('modalidade'),
    iParc = c('quantidade_parcela'), iCart = c('cartao'), iVal = c('valor_bruto'), iLiq = c('valor_liquido');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    // pula SubTotal, 'Total Periodo' e o rodape 'MULVI ... Emitido em: dd/mm/aaaa'
    if (vazio(r[iData]) || /subtotal|total/i.test(txt(r[iCart])) || vazio(r[iNsu])) continue;
    const dh = dataHora(r[iData]); if (!dh.data) continue;
    const parcelas = Math.max(1, Number(soDigitos(r[iParc])) || 1);
    const mod = chave(r[iMod]);
    let grupo = 'OUTRO';
    if (mod.startsWith('deb')) grupo = 'DEBITO';
    else if (mod.startsWith('parcel')) grupo = 'PARCELADO';
    else if (mod.startsWith('cred') || mod.startsWith('rotativ')) grupo = parcelas > 1 ? 'PARCELADO' : 'CREDITO';
    else if (mod.startsWith('pix')) grupo = 'PIX';
    else if (mod.startsWith('voucher') || mod.includes('aliment') || mod.includes('refei')) grupo = 'VOUCHER';
    const bruto = num(r[iVal]), liquido = num(r[iLiq]);
    out.push({
      data: dh.data, hora: dh.hora, nsu: txt(r[iNsu]), autorizacao: '', cnpj: '',
      valor: bruto, valorLiquido: liquido,
      // a Mulvi também não publica a taxa na planilha — sai da diferença
      taxa: bruto ? Math.round(((bruto - liquido) / bruto) * 10000) / 100 : 0, parcelas,
      // o ERP tem UMA forma so ("10-BANESE / MULVI PAY") para debito, rotativo e parcelado da
      // Banese — cobrar a modalidade daria erro em toda venda. Fica null; quem confere e o
      // PARCELAMENTO e o valor. O grupo real da operadora vai em tipoOperadora, so para leitura.
      grupo: null, grupoOperadora: grupo,
      bandeira: txt(r[iBand]) || 'Banese Card', status: 'OK',
      cliente: '', cartao: txt(r[iCart]), tipoOperadora: txt(r[iMod]).trim().toLowerCase(),
    });
  }
  return out;
}

// ALELO (vendas): "Extrato" exportado em meuestabelecimento.alelo.com.br. A aba de dados vem
// SEM CABECALHO — as colunas sao posicionais — entao a deteccao nao pode ser por assinatura:
// o que identifica o arquivo e a dupla de abas "Instrucoes" + "Extrato".
//   0 nome  1 CNPJ  2 EC  3 NSU  4 data  5 hora  6 produto  7 cartao
//   8 rede capturadora  9 bruto  10 liquido  11 status  12 previsao de pagamento
function parseAlelo(rows) {
  const out = [];
  for (const r of rows) {
    const dh = dataHora(r[4]); if (!dh.data) continue;
    const bruto = num(r[9]), liquido = num(r[10]);
    if (!bruto && !liquido) continue;
    const st = chave(r[11]);
    out.push({
      data: dh.data, hora: txt(r[5]) || dh.hora, nsu: txt(r[3]), autorizacao: '',
      cnpj: soDigitos(r[1]), estabelecimento: soDigitos(r[2]),
      valor: bruto, valorLiquido: liquido,
      // a Alelo tambem nao publica a taxa: sai da diferenca (PAT ~3,6%, Auxilio 6,2 a 12,6%)
      taxa: bruto ? Math.round(((bruto - liquido) / bruto) * 10000) / 100 : 0, parcelas: 1,
      grupo: 'VOUCHER', bandeira: 'Alelo',
      status: st.startsWith('aprovad') ? 'OK' : st.toUpperCase(),
      cliente: '', cartao: txt(r[7]), tipoOperadora: txt(r[6]),
      // a propria Alelo ja diz em que dia pretende pagar essa venda
      prazo: dataHora(r[12]).data || '',
    });
  }
  return out;
}

const PARSERS = { REDE: parseRede, BRASILCARD: parseBrasilCard, BRASILCARD_DET: parseBrasilCardDetalhado, LECARD: parseLeCard, BRACOV: parseBracov, NUTRICASH: parseNutricash, MULVI: parseMulvi };

// ── entrada única ──────────────────────────────────────────────────────────
// buffer = conteúdo do arquivo (xlsx/xls/csv). Devolve { ok, layout, operadora, linhas[], descartadas[] }.
function lerArquivo(buffer, { nomeArquivo = '' } = {}) {
  let wb;
  try { wb = XLSX.read(buffer, { cellDates: true, raw: false }); }
  catch (e) { return { ok: false, erro: 'Não consegui abrir o arquivo (' + e.message + ').' }; }
  // A Alelo exporta a aba de dados sem cabecalho — quem identifica o arquivo sao as abas.
  const abaExtrato = wb.SheetNames.find(n => chave(n) === 'extrato');
  if (abaExtrato && wb.SheetNames.some(n => chave(n).startsWith('instruc'))) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[abaExtrato], { header: 1, raw: false, defval: '' });
    const linhas = parseAlelo(rows);
    if (linhas.length) {
      const fora = linhas.filter(l => l.status !== 'OK');
      return { ok: true, layout: 'ALELO_EXTRATO', operadora: 'Alelo', aba: abaExtrato, arquivo: nomeArquivo,
        avisos: fora.length ? [fora.length + ' transacao(oes) nao aprovadas no arquivo — fora do confronto.'] : [],
        linhas: linhas.filter(l => l.status === 'OK'), descartadas: fora };
    }
  }

  for (const aba of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: false, defval: '' });
    const det = detectar(rows);
    if (!det) continue;
    const linhas = PARSERS[det.layout](rows, det.headerIdx);
    const avisos = [];
    const fora = linhas.filter(l => l.status !== 'OK');
    if (fora.length) avisos.push(fora.length + ' transação(ões) não aprovadas no arquivo (negada/cancelada/desfeita) — fora do confronto.');
    return { ok: true, layout: det.layout, operadora: det.operadora, aba, arquivo: nomeArquivo, avisos,
      linhas: linhas.filter(l => l.status === 'OK'), descartadas: fora };
  }
  return { ok: false, erro: 'Layout não reconhecido. Hoje leio: ' + ASSINATURAS.map(a => a.operadora).join(', ') + '.' };
}

module.exports = { lerArquivo, detectar, num, dataHora, ASSINATURAS, mapaColunas, chave, txt, soDigitos, vazio, pct };
