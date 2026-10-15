// conciliacaoUzeParsers.js — Uze / Multi Mais (cartao.algorix.com/redeuze).
// É a única operadora que só exporta PDF, então aqui a leitura é do texto, linha a linha.
//
//   Relatórios ▸ Compras                    → as vendas
//   Relatórios ▸ Repasse ▸ Pagamentos efetuados → o que foi pago (com as parcelas que formaram cada crédito)
const { PDFParse } = require('pdf-parse');

const num = v => {
  const s = String(v || '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const dataBR = d => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(d || '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const round = n => Math.round((Number(n) || 0) * 100) / 100;

async function textoDoPdf(buffer) {
  const p = new PDFParse({ data: buffer });
  const r = await p.getText();
  return r.text || '';
}

// ── Movimento de Compras (vendas) ──────────────────────────────────────────
// Loja: Cv-Fcia Mutti (2097)   Rede: Multmais - Convênio
// 60,90 2 246317 0 0 19/08/2026  ****.****.****.*011  18/08/2026 18/08/2026
//  valor  parc  autoriz  atend  fiscal  processado   cartão      compra     inclusão
function vendasUze(texto, operadora) {
  const linhas = texto.split('\n');
  const out = [];
  let loja = null, lojaNome = null;
  for (const bruta of linhas) {
    const l = bruta.trim();
    const mLoja = /^Loja:\s*(.+?)\s*\((\d+)\)/.exec(l);
    if (mLoja) { lojaNome = mLoja[1].trim(); loja = mLoja[2]; continue; }
    if (/^Total|^Página|^Grupo:|^Movimento de|^Processado/.test(l)) continue;

    const m = /^([\d.,]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\*.\d]+)(?:\s+(\d{2}\/\d{2}\/\d{4}))?(?:\s+(\d{2}\/\d{2}\/\d{4}))?/.exec(l);
    if (!m) continue;
    const [, valor, parcelas, autorizacao, , , processado, cartao, compra, inclusao] = m;
    const dataVenda = dataBR(compra) || dataBR(processado);
    if (!dataVenda) continue;
    out.push({
      data: dataVenda, hora: null, nsu: '', autorizacao: String(autorizacao),
      cnpj: '', estabelecimento: loja || '', estabelecimentoNome: lojaNome || '',
      valor: num(valor), valorLiquido: 0, taxa: 0,
      parcelas: Math.max(1, Number(parcelas) || 1),
      grupo: null,                                   // convênio: quem define é o de-para da operadora
      bandeira: operadora, status: 'OK', cliente: '', cartao: String(cartao),
      tipoOperadora: 'convênio', dataProcessamento: dataBR(processado), dataInclusao: dataBR(inclusao),
    });
  }
  return out;
}

// ── Movimentos em Loja (vendas do Le Card) ─────────────────────────────────
// A linha vem em três blocos separados por TAB:
//   "6375.14**.****.2015 53,47" | "01/06/2026 10:30 Le Card Farmacia Mutti 2" | "Cliente TEF-RE 250106 86541082"
//       cartão      valor          data   hora  rede    loja                    cliente origem autoriz comprovante
function movimentosEmLoja(texto, operadora) {
  const out = [];
  for (const bruta of texto.split('\n')) {
    const l = bruta.trim();
    if (!l || /^Total|^Página|^Grupo:|^Rede:|^Emitido|^Movimentos em|^Parc\.|^COMPRAS/.test(l)) continue;
    const partes = bruta.split('\t').map(p => p.trim()).filter(Boolean);
    if (partes.length < 3) continue;

    const mCartaoValor = /^([\d.*]+)\s+([\d.,]+)$/.exec(partes[0]);
    const mDataLoja = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(.+)$/.exec(partes[1]);
    if (!mCartaoValor || !mDataLoja) continue;

    // "Le Card Farmacia Mutti 2" → rede + loja; a rede é o próprio nome da operadora
    const restante = mDataLoja[3].trim();
    const loja = restante.replace(new RegExp('^' + operadora.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '').trim()
      || restante;

    // "Cliente TEF-RE 250106 86541082" → cliente, origem, autorização, comprovante
    const mFim = /^(.*?)\s*([A-Z]{2,4}-[A-Z]{2,4})?\s*(\d{4,})\s+(\d{4,})\s*$/.exec(partes[2]);
    out.push({
      data: dataBR(mDataLoja[1]), hora: mDataLoja[2],
      nsu: mFim ? mFim[4] : '',                        // "Compr." é o número que o ERP guarda
      autorizacao: mFim ? mFim[3] : '',
      cnpj: '', estabelecimento: loja, estabelecimentoNome: loja,
      valor: num(mCartaoValor[2]), valorLiquido: 0, taxa: 0, parcelas: 1,
      grupo: null, bandeira: operadora, status: 'OK',
      cliente: mFim ? mFim[1].trim() : partes[2],
      cartao: mCartaoValor[1], tipoOperadora: mFim && mFim[2] ? mFim[2] : 'benefício',
    });
  }
  return out;
}

// ── Bracov / Brasil Convênios (NETCARD PJ): Movimentação Diária ────────────
// CREDENCIADO: 468271 - FARMACIA MULTI    18.681.698/0002-02
// DATA HORA | NSU | DOC | DESCRICAO | REDE | CARTAO | PARCS | VALOR
// 20/06/2026 19:03:33  153  690635  COMPRA  FEPAS  639476******3724  1  196,04
function vendasBracov(texto) {
  const out = [];
  let credenciado = null, credNome = null, cnpj = null;
  for (const bruta of texto.split('\n')) {
    const l = bruta.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();

    const mCred = /^CREDENCIADO:\s*(\d+)\s*-\s*(.+?)\s+([\d.]{10,}\/[\d-]+)/.exec(l);
    if (mCred) { credenciado = mCred[1]; credNome = mCred[2].trim(); cnpj = mCred[3].replace(/\D/g, ''); continue; }
    if (/^TOTAL|^DATA|^PERIODO|^BRASIL CONVENIOS|^MOVIMENTACAO|^\*|^—/.test(l)) continue;

    const m = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+([\d*]+)\s+(\d+)\s+([\d.,]+)$/.exec(l);
    if (!m) continue;
    const [, data, hora, nsu, doc, descricao, rede, cartao, parcs, valor] = m;
    out.push({
      data: dataBR(data), hora, nsu: String(nsu), autorizacao: String(doc),
      cnpj: cnpj || '', estabelecimento: credenciado || '', estabelecimentoNome: credNome || '',
      valor: num(valor), valorLiquido: 0, taxa: 0, parcelas: Math.max(1, Number(parcs) || 1),
      grupo: null, bandeira: 'Bracov', status: /COMPRA/i.test(descricao) ? 'OK' : descricao.toUpperCase(),
      cliente: '', cartao, tipoOperadora: rede.toLowerCase(),
    });
  }
  return out;
}

// ── Pagamentos efetuados (repasse) ─────────────────────────────────────────
// Cabeçalho da empresa:
//   Razão Social (M2209) (Fcia Farma Rocha (M2209) - 03.191.469/0001-43) ( Dep: Banco do Brasil Ag: 1072-3 C/C: 23888-0 )
// Crédito (o PDF extrai os números na ordem inversa da tabela impressa):
//   145,14  0,00 …  7,48  152,62  06/08/2026 31/07/2026 Confirmado (R)
//   ↑pago                 ↑comissão ↑compras  ↑crédito   ↑vencimento
// Parcelas que formaram o crédito:
//   21/04/2026 57,23  Compras 3/3 ****.****.****.*011 Ev*****ma
function repasseUze(texto, operadora) {
  const linhas = texto.split('\n');
  const depositos = [], parcelas = [];
  let empresa = null;

  for (const bruta of linhas) {
    const l = bruta.replace(/\t/g, ' ').trim();

    // Uze:     Razão Social (M2209) (Fantasia (M2209) - CNPJ) ( Dep: … )
    // Le Card: Razão Social (Fantasia - CNPJ) ( Dep: … )        ← sem o código antes
    const mEmp = /^(.+?)(?:\s*\((\w+)\))?\s*\(([^()]*(?:\([^()]*\))?[^()]*?)\s*-\s*([\d./-]{14,20})\)(?:\s*\(\s*Dep:\s*(.+?)\s*\))?/.exec(l);
    if (mEmp && !/^\d/.test(l)) {
      empresa = { razao: mEmp[1].trim(), codigo: mEmp[2], fantasia: mEmp[3].trim(),
        cnpj: mEmp[4].replace(/\D/g, ''), deposito: (mEmp[5] || '').trim() };
      continue;
    }
    if (/^Total|^Página|^Grupo:|^Pagamentos efetuados|^Créditos|^Compras\b.*Data do/.test(l)) continue;

    // crédito: termina com duas datas + status
    const mCred = /^([\d.,]+)((?:\s+[\d.,]+){8,10})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/.exec(l);
    if (mCred) {
      const valores = [num(mCred[1]), ...mCred[2].trim().split(/\s+/).map(num)];
      // O cabecalho vem quebrado em varias linhas no PDF, mas as duas ultimas colunas numericas
      // sao sempre "Taxa Admin. compras" e "Compras" — validado em 143 creditos reais:
      // Le Card da 7,00% em 44 de 44, Uze 4,70 a 5,00%.
      //
      // NAO usar (compras - pago) como taxa: essa diferenca junta antecipacao, atraso e
      // pagamentos em loja, e dava extremos irreais de 42% (Le Card) e 50% (Uze).
      const pago = valores[0];
      const compras = valores[valores.length - 1];
      const taxaAdmin = valores[valores.length - 2];
      const comissao = taxaAdmin;
      const descontoTotal = round(compras - pago);
      depositos.push({
        data: dataBR(mCred[3]), dataVencimento: dataBR(mCred[4]),
        bandeira: operadora, modalidade: 'Convênio', grupo: 'CREDIARIO',
        banco: empresa ? empresa.deposito : '', valor: round(pago),
        valorBruto: round(compras), taxa: compras ? round(100 * comissao / compras) : 0,
        valorTaxa: round(taxaAdmin), descontoTotal,
        // o que foi descontado alem da taxa: antecipacao, atraso, credito administrativo
        outrosDescontos: round(descontoTotal - taxaAdmin),
        estabelecimento: empresa ? empresa.codigo : '', estabelecimentoNome: empresa ? empresa.fantasia : '',
        cnpj: empresa ? empresa.cnpj : '', status: /confirmad/i.test(mCred[5]) ? 'PAGO' : mCred[5].trim().toUpperCase(),
        observacao: round(descontoTotal - taxaAdmin) > 0.01
          ? 'alem da taxa, R$ ' + round(descontoTotal - taxaAdmin).toFixed(2) + ' de antecipacao/outros'
          : '',
      });
      continue;
    }

    // parcela: data + valor + "Compras n/m" + cartão + nome
    const mParc = /^(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+Compras\s*(\d+)?\/?(\d+)?\s*([\*.\d]+)?\s*(.*)$/.exec(l);
    if (mParc && depositos.length) {
      const dep = depositos[depositos.length - 1];
      parcelas.push({
        depIdx: depositos.length - 1,
        dataRecebimento: dep.data, dataVenda: null, dataVencimento: dataBR(mParc[1]),
        nsu: '', autorizacao: '', lote: '',
        estabelecimento: dep.estabelecimento, estabelecimentoNome: dep.estabelecimentoNome, cnpj: dep.cnpj,
        modalidade: 'Convênio', bandeira: operadora, grupo: 'CREDIARIO',
        parcelas: Number(mParc[4]) || 1, parcela: Number(mParc[3]) || 1,
        valorBruto: num(mParc[2]), valorLiquido: num(mParc[2]), valorTaxa: 0, taxa: 0,
        banco: '', agencia: '', conta: '', cancelamento: '', status: 'PAGA',
        cliente: (mParc[6] || '').trim(), cartao: mParc[5] || '',
      });
    }
  }
  for (const p of parcelas) delete p.depIdx;
  return { depositos, parcelas };
}

// ── entrada ────────────────────────────────────────────────────────────────
// Uze e Le Card rodam na mesma plataforma (Algorix), com os mesmos relatórios — o nome da
// operadora sai do próprio arquivo ("Grupo: Uze Cartões" / "Grupo: Le Card").
function operadoraDoTexto(texto) {
  if (/BRASIL CONVENIOS|NETCARD/i.test(texto)) return 'Bracov';
  const m = /Grupo:\s*([^\n\r]+?)\s{2,}|Grupo:\s*([^\n\r]+)/.exec(texto);
  const grupo = ((m && (m[1] || m[2])) || '').trim();
  if (/le ?card/i.test(grupo) || /le ?card/i.test(texto.slice(0, 400))) return 'Le Card';
  if (/uze|multmais|multi ?mais/i.test(grupo)) return 'Multi Mais / Uze';
  return grupo || null;
}

async function lerUze(buffer, { nomeArquivo = '' } = {}) {
  const texto = await textoDoPdf(buffer);
  const operadora = operadoraDoTexto(texto);
  if (!operadora) return { ok: false, erro: 'Não parece um relatório do Uze nem do Le Card.' };

  if (/MOVIMENTACAO DIARIA/i.test(texto)) {
    const linhas = vendasBracov(texto);
    if (!linhas.length) return { ok: false, erro: 'O relatório do Bracov abriu, mas não tem nenhuma venda no período.' };
    return { ok: true, tipo: 'vendas', operadora: 'Bracov', layout: 'NETCARD_MOVIMENTACAO', arquivo: nomeArquivo, linhas, descartadas: [], avisos: [] };
  }

  if (/Movimentos em Loja/i.test(texto)) {
    const linhas = movimentosEmLoja(texto, operadora);
    if (!linhas.length) return { ok: false, erro: 'O relatório de movimentos abriu, mas não tem nenhuma venda no período.' };
    return { ok: true, tipo: 'vendas', operadora, layout: 'ALGORIX_MOVIMENTOS', arquivo: nomeArquivo, linhas, descartadas: [], avisos: [] };
  }

  if (/Movimento de Compras/i.test(texto)) {
    const linhas = vendasUze(texto, operadora);
    if (!linhas.length) return { ok: false, erro: 'O relatório de compras do Uze abriu, mas não tem nenhuma venda no período.' };
    return { ok: true, tipo: 'vendas', operadora, layout: 'ALGORIX_COMPRAS',
      arquivo: nomeArquivo, linhas, descartadas: [], avisos: [] };
  }

  if (/Pagamentos efetuados/i.test(texto)) {
    const { depositos, parcelas } = repasseUze(texto, operadora);
    if (!depositos.length) return { ok: false, erro: 'O relatório de pagamentos do Uze abriu, mas não tem nenhum crédito no período.' };
    const avisos = [];
    if (!parcelas.length) avisos.push('O relatório veio sem o detalhe das parcelas — marque "Listar lançamentos" antes de gerar.');
    return { ok: true, tipo: 'repasse', operadora, layout: 'ALGORIX_PAGAMENTOS',
      arquivo: nomeArquivo, depositos, parcelas, futuros: [], ajustes: [], avisos };
  }

  return { ok: false, erro: 'Reconheci o Uze, mas não sei ler esse relatório (leio "Movimento de Compras" e "Pagamentos efetuados").' };
}

module.exports = { lerUze, vendasUze, movimentosEmLoja, vendasBracov, repasseUze, textoDoPdf };
