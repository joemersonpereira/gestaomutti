// spedValidadorErp.js — VALIDADOR DO SPED antes de enviar.
// O CFOP de ENTRADA (onde mora o erro "2102→2403") não fica no ERP (lá está o CFOP do fornecedor);
// ele é gerado no arquivo SPED, no registro C170. Então validamos o PRÓPRIO .txt do SPED (que já
// está no repositório) — é o mesmo que a contabilidade confere, só que automático e antes de enviar.
//
// Regras (PDF "Escrituração Fiscal Farmácias", revenda):
//   CST ICMS final 60 (ST) → CFOP de entrada 1403/2403
//   CST ICMS final 40/41 (isenta/não trib.) → 1102/2102
//   CFOP de entrada 1102/2102 (revenda tributada) → REVISAR: na farmácia a maioria é ST (1403/2403)
//   item de uso/consumo com CFOP de revenda, combustível 1653/2653, etc. — o PDF detalha
const fim2 = cst => String(cst || '').replace(/\D/g, '').slice(-2);
const cfop4 = c => String(c || '').replace(/\D/g, '').slice(0, 4);
const round = n => Math.round((Number(n) || 0) * 100) / 100;
const numBR = v => { const s = String(v == null ? '' : v).trim().replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; };

const REGRA_CFOP_CST = {
  '60': { ok: ['1403', '2403'], rotulo: 'CST 60 (ST) deveria ter CFOP 1403/2403' },
  '40': { ok: ['1102', '2102'], rotulo: 'CST 40 (isenta) deveria ter CFOP 1102/2102' },
  '41': { ok: ['1102', '2102'], rotulo: 'CST 41 (não tributada) deveria ter CFOP 1102/2102' },
};

// valida o arquivo SPED (buffer). Percorre C100 (entrada/saída) → C170 (itens). Só itens de ENTRADA.
function validarSpedArquivo(dados) {
  const txt = Buffer.isBuffer(dados) ? dados.toString('latin1') : String(dados || '');
  const linhas = txt.split(/\r?\n/);
  let ehEntrada = false, numDocAtual = '', chvAtual = '';
  const cfopErrado = {}, cfopRevisar = {};
  let semNcm = { n: 0, valor: 0 }, semCfop = { n: 0, valor: 0 }, semCst = { n: 0, valor: 0 };
  let totalItens = 0, valorItens = 0;
  const amostra = [];
  // mapa COD_ITEM → NCM (registro 0200) pra apontar item sem NCM
  const ncmPorItem = {};
  for (const raw of linhas) {
    const l = raw.trim(); if (!l) continue;
    const c = l.replace(/^\|/, '').split('|');
    if (c[0] === '0200') { ncmPorItem[c[1]] = String(c[7] || '').trim(); continue; } // |0200|COD_ITEM|DESCR|COD_BARRA|COD_ANT|UNID_INV|TIPO_ITEM|COD_NCM|...
    if (c[0] === 'C100') { ehEntrada = String(c[1]) === '0'; numDocAtual = c[8] || ''; chvAtual = String(c[9] || '').replace(/\D/g, ''); continue; }
    if (c[0] !== 'C170' || !ehEntrada) continue;
    // |C170|NUM_ITEM|COD_ITEM|DESCR_COMPL|QTD|UNID|VL_ITEM|VL_DESC|IND_MOV|CST_ICMS|CFOP|COD_NAT|...
    const codItem = c[2], cst = String(c[9] || '').trim(), cfop = cfop4(c[10]);
    const valor = numBR(c[6]);
    totalItens++; valorItens += valor;
    const ncm = ncmPorItem[codItem];
    if (ncm !== undefined && ncm === '') { semNcm.n++; semNcm.valor += valor; }
    if (!cfop) { semCfop.n++; semCfop.valor += valor; continue; }
    if (!cst) { semCst.n++; semCst.valor += valor; }
    let motivo = null;
    if (/^[567]/.test(cfop)) motivo = 'CFOP de saída numa nota de entrada';
    else { const reg = REGRA_CFOP_CST[fim2(cst)]; if (reg && !reg.ok.includes(cfop)) motivo = reg.rotulo; }
    const push = (bucket, extra) => {
      const k = cfop + '|' + (cst || '—');
      const o = bucket[k] || (bucket[k] = { cfop, cst: cst || '—', n: 0, valor: 0, ...extra });
      o.n++; o.valor += valor;
      if (amostra.length < 80) amostra.push({ nf: numDocAtual, cod: codItem, produto: (c[3] || '').slice(0, 50), cfop, cst, valor: round(valor), motivo: extra.motivo });
    };
    if (motivo) push(cfopErrado, { motivo });
    else if (cfop === '1102' || cfop === '2102') {
      const esperado = cfop === '1102' ? '1403' : '2403';
      push(cfopRevisar, { motivo: `Revenda tributada — conferir se é ST (deveria ser ${esperado})`, esperado });
    }
  }
  const arr = o => Object.values(o).map(x => ({ ...x, valor: round(x.valor) })).sort((a, b) => b.n - a.n);
  const cfopErradoArr = arr(cfopErrado), cfopRevisarArr = arr(cfopRevisar);
  const checks = [
    { chave: 'cfop', categoria: 'CST / CFOP divergente', titulo: 'Itens com CFOP/CST errado', gravidade: 'alta',
      n: cfopErradoArr.reduce((a, x) => a + x.n, 0), valor: round(cfopErradoArr.reduce((a, x) => a + x.valor, 0)), grupos: cfopErradoArr },
    { chave: 'cfop_revisar', categoria: 'CST / CFOP divergente', titulo: 'Revenda tributada a revisar (ST? → 1403/2403)', gravidade: 'revisar',
      n: cfopRevisarArr.reduce((a, x) => a + x.n, 0), valor: round(cfopRevisarArr.reduce((a, x) => a + x.valor, 0)), grupos: cfopRevisarArr },
    { chave: 'sem_cfop', categoria: 'CST / CFOP divergente', titulo: 'Itens de entrada sem CFOP', gravidade: 'alta', n: semCfop.n, valor: round(semCfop.valor) },
    { chave: 'sem_cst', categoria: 'CST / CFOP divergente', titulo: 'Itens de entrada sem CST de ICMS', gravidade: 'media', n: semCst.n, valor: round(semCst.valor) },
    { chave: 'sem_ncm', categoria: 'NCM / produto', titulo: 'Itens de entrada sem NCM', gravidade: 'media', n: semNcm.n, valor: round(semNcm.valor) },
  ];
  const totalProblemas = checks.reduce((a, c) => a + (c.n || 0), 0);
  return { ok: true, totalItens, valorItens: round(valorItens), totalProblemas, checks, amostra: amostra.slice(0, 80) };
}

module.exports = { validarSpedArquivo };
