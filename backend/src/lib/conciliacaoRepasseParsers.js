// conciliacaoRepasseParsers.js — lê o relatório de RECEBIMENTOS da credenciadora (o que ela pagou).
// É outro arquivo, com outra pergunta: não é "a venda foi registrada certo?", e sim "a operadora
// pagou tudo o que devia, com a taxa certa, e para qual filial?".
//
// Rede (userede → recebimentos → exportar Excel → "relatório detalhado"), abas usadas:
//   pagamentos        → uma linha por PARCELA paga (NSU, bruto, MDR, líquido, estabelecimento)
//   recebidos         → o depósito consolidado (data + bandeira + modalidade + estabelecimento)
//   pagamentos futuros→ a agenda do que ainda vai cair
//   ajustes / cancelamentos e contestações → o que foi descontado (chargeback, cobrança)
//
// Devolve tudo normalizado: { parcelas[], depositos[], futuros[], ajustes[] }.
const XLSX = require('xlsx');
const { num, pct, dataHora, mapaColunas, chave, txt, soDigitos, vazio } = require('./conciliacaoCartaoParsers');

// modalidade + nº de parcelas → o mesmo grupo usado na conciliação de vendas
function grupoDe(modalidade, parcelas) {
  const m = chave(modalidade);
  if (m.startsWith('pix')) return 'PIX';
  if (m.startsWith('voucher') || m.includes('benefic') || m.includes('aliment') || m.includes('refei')) return 'VOUCHER';
  if (m.startsWith('deb')) return 'DEBITO';
  if (m.startsWith('cred')) return (Number(parcelas) || 1) > 1 ? 'PARCELADO' : 'CREDITO';
  return 'OUTRO';
}

// acha a aba pelo nome (tolerante a acento/caixa)
const acharAba = (wb, ...nomes) => wb.SheetNames.find(s => nomes.some(n => chave(s) === chave(n)))
  || wb.SheetNames.find(s => nomes.some(n => chave(s).includes(chave(n))));

// devolve as linhas da aba com o cabeçalho já localizado
function linhasDaAba(wb, nomeAba, colunaChave) {
  const aba = acharAba(wb, nomeAba);
  if (!aba) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: false, defval: '' });
  const hi = rows.findIndex(r => (r || []).some(c => chave(c) === chave(colunaChave)));
  if (hi < 0) return null;
  return { rows, hi, c: mapaColunas(rows[hi]), dados: rows.slice(hi + 1) };
}

// ── Rede: parcelas pagas ───────────────────────────────────────────────────
function parcelasRede(wb) {
  const a = linhasDaAba(wb, 'pagamentos', 'data do recebimento');
  if (!a) return [];
  const { c, dados } = a;
  const i = {
    receb: c('data do recebimento'), venda: c('data original da venda'), venc: c('data original de vencimento'),
    bruto: c('valor bruto da parcela original'), brutoAtu: c('valor bruto da parcela atualizada'),
    taxa: c('taxa mdr'), mdr: c('valor mdr descontado'), liquido: c('valor liquido da parcela'),
    nsu: c('nsu/cv'), aut: c('numero da autorizacao'), lote: c('resumo de vendas/numero do lote'),
    estab: c('estabelecimento'), estabNome: c('nome do estabelecimento'),
    modalidade: c('modalidade'), bandeira: c('bandeira'),
    parcelas: c('numero de parcelas'), parcela: c('parcela'),
    banco: c('banco'), agencia: c('agencia'), conta: c('conta-corrente'),
    cancel: c('cancelamento/contestacao'), status: c('status'),
  };
  const out = [];
  for (const r of dados) {
    if (vazio(r[i.receb])) continue;
    const dh = dataHora(r[i.receb]); if (!dh.data) continue;
    const parcelas = Math.max(1, Number(soDigitos(r[i.parcelas])) || 1);
    const bruto = num(r[i.bruto]) || num(r[i.brutoAtu]);
    out.push({
      dataRecebimento: dh.data,
      dataVenda: dataHora(r[i.venda]).data,
      dataVencimento: dataHora(r[i.venc]).data,
      nsu: vazio(r[i.nsu]) ? '' : txt(r[i.nsu]),
      autorizacao: vazio(r[i.aut]) ? '' : txt(r[i.aut]),
      lote: vazio(r[i.lote]) ? '' : txt(r[i.lote]),
      estabelecimento: soDigitos(r[i.estab]),
      estabelecimentoNome: txt(r[i.estabNome]),
      modalidade: txt(r[i.modalidade]), bandeira: txt(r[i.bandeira]),
      grupo: grupoDe(r[i.modalidade], parcelas),
      parcelas, parcela: Math.max(1, Number(soDigitos(r[i.parcela])) || 1),
      valorBruto: bruto, taxa: pct(r[i.taxa]), valorTaxa: num(r[i.mdr]), valorLiquido: num(r[i.liquido]),
      banco: txt(r[i.banco]), agencia: txt(r[i.agencia]), conta: txt(r[i.conta]),
      cancelamento: vazio(r[i.cancel]) ? '' : txt(r[i.cancel]),
      status: chave(r[i.status]).startsWith('pag') ? 'PAGA' : txt(r[i.status]).toUpperCase(),
    });
  }
  return out;
}

// ── Rede: depósitos consolidados (o que a conta recebeu) ───────────────────
function depositosRede(wb) {
  const a = linhasDaAba(wb, 'recebidos', 'valor depositado');
  if (!a) return [];
  const { c, dados } = a;
  const i = {
    data: c('data'), bandeira: c('bandeira'), modalidade: c('modalidade'), banco: c('banco domicilio'),
    valor: c('valor depositado'), estabNome: c('nome do estabelecimento'), estab: c('estabelecimento'),
    status: c('status'), negociadas: c('negociadas'),
  };
  const out = [];
  for (const r of dados) {
    if (vazio(r[i.valor])) continue;
    const dh = dataHora(r[i.data]); if (!dh.data) continue;
    out.push({
      data: dh.data, bandeira: txt(r[i.bandeira]), modalidade: txt(r[i.modalidade]),
      grupo: grupoDe(r[i.modalidade], 1), banco: txt(r[i.banco]),
      valor: num(r[i.valor]), estabelecimento: soDigitos(r[i.estab]), estabelecimentoNome: txt(r[i.estabNome]),
      status: txt(r[i.status]).toUpperCase(), observacao: txt(r[i.negociadas]),
    });
  }
  return out;
}

// ── Rede: agenda (o que ainda vai cair) ────────────────────────────────────
function futurosRede(wb) {
  const a = linhasDaAba(wb, 'pagamentos futuros', 'data prevista do recebimento');
  if (!a) return [];
  const { c, dados } = a;
  const i = {
    prev: c('data prevista do recebimento'), venda: c('data original da venda'),
    bruto: c('valor bruto da parcela original'), taxa: c('taxa mdr'), liquido: c('valor liquido da parcela'),
    nsu: c('nsu/cv'), aut: c('numero de autorizacao', 'numero da autorizacao'),
    estab: c('estabelecimento'), estabNome: c('nome do estabelecimento'),
    modalidade: c('modalidade'), bandeira: c('bandeira'),
    parcelas: c('numero de parcelas'), parcela: c('parcela'), status: c('status'),
  };
  const out = [];
  for (const r of dados) {
    if (vazio(r[i.prev])) continue;
    const dh = dataHora(r[i.prev]); if (!dh.data) continue;
    const parcelas = Math.max(1, Number(soDigitos(r[i.parcelas])) || 1);
    out.push({
      dataPrevista: dh.data, dataVenda: dataHora(r[i.venda]).data,
      nsu: vazio(r[i.nsu]) ? '' : txt(r[i.nsu]), autorizacao: vazio(r[i.aut]) ? '' : txt(r[i.aut]),
      estabelecimento: soDigitos(r[i.estab]), estabelecimentoNome: txt(r[i.estabNome]),
      modalidade: txt(r[i.modalidade]), bandeira: txt(r[i.bandeira]), grupo: grupoDe(r[i.modalidade], parcelas),
      parcelas, parcela: Math.max(1, Number(soDigitos(r[i.parcela])) || 1),
      valorBruto: num(r[i.bruto]), taxa: pct(r[i.taxa]), valorLiquido: num(r[i.liquido]),
      status: txt(r[i.status]).toUpperCase(),
    });
  }
  return out;
}

// ── Rede: ajustes e cancelamentos (o que foi descontado) ───────────────────
function ajustesRede(wb) {
  const out = [];
  const aj = linhasDaAba(wb, 'ajustes', 'data do ajuste');
  if (aj) {
    const c = aj.c;
    for (const r of aj.dados) {
      if (vazio(r[c('data do ajuste')])) continue;
      const dh = dataHora(r[c('data do ajuste')]); if (!dh.data) continue;
      // A "forma de compensação" diz o rumo do dinheiro: "cobrado nos recebíveis" sai do repasse
      // (aluguel de maquininha, cancelamento) e "adicionado nos recebíveis" entra (comissão de recarga).
      const compensacao = chave(r[c('forma de compensacao')]);
      const cobrado = num(r[c('valor cobrado nesta data')]);
      const creditado = num(r[c('valor creditado nesta data')]);
      // no crédito, o estabelecimento vem na coluna de ORIGEM (a de "cobrado" fica vazia)
      const estab = soDigitos(r[c('numero do estabelecimento cobrado')])
        || soDigitos(r[c('numero do estabelecimento de origem da cobranca')]);
      out.push({ tipo: 'ajuste', data: dh.data, motivo: txt(r[c('motivo')]),
        descricao: txt(r[c('tipo do ajuste')]), compensacao,
        valor: compensacao.includes('cobrado') ? cobrado : 0,
        credito: compensacao.includes('adicionado') ? creditado : 0,
        pendente: num(r[c('valor ainda pendente')]),
        estabelecimento: estab, bandeira: txt(r[c('bandeira ajustada')]) });
    }
  }
  const cc = linhasDaAba(wb, 'cancelamentos e contestações', 'data do debito');
  if (cc) {
    const c = cc.c;
    for (const r of cc.dados) {
      if (vazio(r[c('data do debito')])) continue;
      const dh = dataHora(r[c('data do debito')]); if (!dh.data) continue;
      out.push({ tipo: 'cancelamento', data: dh.data, motivo: txt(r[c('motivo do cancelamento')]),
        descricao: txt(r[c('cancelamento/chargeback')]),
        valor: num(r[c('valor descontado')]), dataVenda: dataHora(r[c('data original da venda')]).data,
        nsu: txt(r[c('nsu/cv')]), estabelecimento: soDigitos(r[c('estabelecimento da venda')]),
        bandeira: txt(r[c('bandeira da venda')]) });
    }
  }
  const cob = linhasDaAba(wb, 'cobranças em aberto', 'valor pendente');
  if (cob) {
    const c = cob.c;
    for (const r of cob.dados) {
      if (vazio(r[c('valor pendente')])) continue;
      out.push({ tipo: 'cobranca_aberta', data: dataHora(r[c('data de criacao do debito')]).data,
        motivo: txt(r[c('motivo')]), valor: num(r[c('valor pendente')]),
        nsu: txt(r[c('nsu')]), estabelecimento: soDigitos(r[c('estabelecimento da cobranca')]) });
    }
  }
  return out;
}

// ── Alelo: exportação do portal "Meu Estabelecimento" ──────────────────────
// O arquivo tem 4 abas (Instruções, Recebimentos, Outras Transações, Não Exportadas) e as abas de
// dados vêm SEM cabeçalho — os títulos ficam só no PDF equivalente. Por isso aqui é por posição.
//
// Recebimentos:      CNPJ · EC · Nome · EC da transação · data venda · hora · nº transação ·
//                    nº autorização · tipo cartão · nº cartão · PSR · bruto · líquido · status · data pagto
// Outras Transações: CNPJ · EC · Nome · EC da transação · tipo cartão · descrição · valor ·
//                    data débito/crédito · data pagamento
const COL_ALELO_REC = { cnpj: 0, ec: 1, nome: 2, ecTransacao: 3, dataVenda: 4, hora: 5, transacao: 6,
  autorizacao: 7, tipoCartao: 8, cartao: 9, psr: 10, bruto: 11, liquido: 12, status: 13, pagamento: 14 };
const COL_ALELO_OUT = { cnpj: 0, ec: 1, nome: 2, ecTransacao: 3, tipoCartao: 4, descricao: 5, valor: 6,
  dataLancamento: 7, pagamento: 8 };

const abaAlelo = (wb, nome) => {
  const alvo = wb.SheetNames.find(s => chave(s) === chave(nome));
  if (!alvo) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[alvo], { header: 1, raw: false, defval: '' })
    .filter(r => (r || []).some(c => txt(c)));
};

function parcelasAlelo(wb) {
  const c = COL_ALELO_REC;
  const out = [];
  for (const r of abaAlelo(wb, 'Recebimentos')) {
    const pago = dataHora(r[c.pagamento]).data;
    const venda = dataHora(r[c.dataVenda]).data;
    if (!pago && !venda) continue;                       // linha de título ou vazia
    const bruto = num(r[c.bruto]), liquido = num(r[c.liquido]);
    if (!bruto && !liquido) continue;
    out.push({
      dataRecebimento: pago || venda, dataVenda: venda, dataVencimento: pago,
      nsu: txt(r[c.transacao]), autorizacao: txt(r[c.autorizacao]), lote: '',
      estabelecimento: soDigitos(r[c.ec]) || soDigitos(r[c.cnpj]),
      estabelecimentoNome: txt(r[c.nome]), cnpj: soDigitos(r[c.cnpj]),
      modalidade: txt(r[c.tipoCartao]) || 'Voucher', bandeira: 'Alelo', grupo: 'VOUCHER',
      parcelas: 1, parcela: 1,
      valorBruto: bruto, valorLiquido: liquido,
      valorTaxa: round2(bruto - liquido), taxa: bruto ? round2(100 * (bruto - liquido) / bruto) : 0,
      banco: '', agencia: '', conta: '', cancelamento: '',
      status: /aprovad|pag/i.test(txt(r[c.status])) ? 'PAGA' : txt(r[c.status]).toUpperCase(),
    });
  }
  return out;
}

// "Outras Transações" = taxas, compensações e ajustes (o equivalente aos ajustes da Rede)
function ajustesAlelo(wb) {
  const c = COL_ALELO_OUT;
  const out = [];
  for (const r of abaAlelo(wb, 'Outras Transações')) {
    const v = num(r[c.valor]);
    if (!v) continue;
    const data = dataHora(r[c.pagamento]).data || dataHora(r[c.dataLancamento]).data;
    if (!data) continue;
    out.push({ tipo: 'ajuste', data, motivo: txt(r[c.descricao]), descricao: txt(r[c.tipoCartao]),
      compensacao: v < 0 ? 'cobrado nos recebíveis' : 'adicionado nos recebíveis',
      valor: v < 0 ? Math.abs(v) : 0, credito: v > 0 ? v : 0, pendente: 0,
      estabelecimento: soDigitos(r[c.ec]) || soDigitos(r[c.cnpj]), bandeira: 'Alelo' });
  }
  return out;
}

// A Alelo não publica o depósito consolidado — ele é a soma do que cai no mesmo dia, por
// estabelecimento e tipo de cartão. É assim que o crédito aparece no extrato.
function depositosAlelo(parcelas, ajustes) {
  const m = new Map();
  for (const p of parcelas) {
    const k = [p.dataRecebimento, p.estabelecimento, p.modalidade].join('|');
    const a = m.get(k) || { data: p.dataRecebimento, bandeira: 'Alelo', modalidade: p.modalidade,
      grupo: 'VOUCHER', banco: '', valor: 0, estabelecimento: p.estabelecimento,
      estabelecimentoNome: p.estabelecimentoNome, status: 'PAGO', observacao: '' };
    a.valor = round2(a.valor + p.valorLiquido);
    m.set(k, a);
  }
  for (const aj of ajustes) {                              // ajustes entram no mesmo crédito do dia
    for (const [k, d] of m) {
      if (d.data === aj.data && d.estabelecimento === aj.estabelecimento) {
        d.valor = round2(d.valor + (aj.credito || 0) - (aj.valor || 0));
        break;
      }
    }
  }
  return [...m.values()];
}

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

// ── Nutricash: "Consulta fechamentos" do portal do credenciado ─────────────
// Aqui só vem o TOTAL de cada lote (sem transação a transação), então dá para conferir o valor
// e a data de pagamento, mas não dá para casar venda a venda como na Rede e na Alelo.
function fechamentosNutricash(wb) {
  const a = linhasDaAba(wb, wb.SheetNames[0], 'data do fechamento');
  if (!a) return [];
  const { c, dados } = a;
  const i = { id: c('id'), lote: c('lote'), rbase: c('rbase'), credenciado: c('credenciado'),
    contrato: c('contrato'), produto: c('produto'), fechamento: c('data do fechamento'),
    pagamento: c('data de pagamento'), tipo: c('tipo'), liquido: c('valor liquido'), finalizado: c('finalizado') };
  const out = [];
  for (const r of dados) {
    const pago = dataHora(r[i.pagamento]).data;
    const valor = num(r[i.liquido]);
    if (!pago || !valor) continue;
    out.push({
      data: pago, dataFechamento: dataHora(r[i.fechamento]).data,
      bandeira: 'Nutricash', modalidade: txt(r[i.produto]) || 'Benefício', grupo: 'VOUCHER',
      banco: txt(r[i.tipo]), valor,
      estabelecimento: soDigitos(r[i.rbase]) || soDigitos(r[i.contrato]),
      estabelecimentoNome: txt(r[i.credenciado]),
      status: /sim/i.test(txt(r[i.finalizado])) ? 'PAGO' : 'PENDENTE',
      observacao: 'lote ' + txt(r[i.lote]),
    });
  }
  return out;
}

// ── Mulvi Pay / Banese Card: "Movimento Financeiro Analítico" ──────────────
// Minhas vendas ▸ Meus recebimentos ▸ Detalhado ▸ Excel. Uma linha por PARCELA creditada, com o
// NSU da venda original — dá para casar venda a venda, como na Rede. A loja NÃO vem no arquivo:
// o portal já filtra pelo CNPJ escolhido no topo, então ela vem do upload.
// O único arquivo real visto com essa assinatura de colunas é o "Movimento Futuro do Lojista"
// (a agenda do que ainda vai cair, não o que já caiu) — Data_Lancamento nele é sempre uma data
// FUTURA. Antes o código tratava tudo como já pago (status 'PAGA'); virou parcelas fantasma no
// "recebido". Devolve { parcelas, futuros } e decide pela própria data: se Data_Lancamento é
// passado/hoje, é uma parcela paga de verdade; se é futuro, vai pra agenda (futuros).
function parcelasMulvi(wb) {
  const a = linhasDaAba(wb, wb.SheetNames[0], 'data_lancamento');
  if (!a) return { parcelas: [], futuros: [] };
  const { c, dados } = a;
  const i = { lanc: c('data_lancamento'), venda: c('data_transacao'), band: c('bandeira'),
    tipo: c('tipo_transacao'), nsu: c('nsu'), parc: c('parcela'),
    bruto: c('valor_bruto', 'valorbruto'), liquido: c('valor_liquido', 'valorliquido') };
  const hoje = new Date().toISOString().slice(0, 10);
  const parcelas = [], futuros = [];
  for (const r of dados) {
    const lanc = dataHora(r[i.lanc]).data;
    if (!lanc) continue;
    const bruto = num(r[i.bruto]), liquido = num(r[i.liquido]);
    if (!bruto && !liquido) continue;
    // "4/6" = parcela 4 de 6
    const mp = /(\d+)\s*\/\s*(\d+)/.exec(txt(r[i.parc]));
    const parcela = mp ? Number(mp[1]) : 1, parcelasN = mp ? Number(mp[2]) : 1;
    const tipo = chave(r[i.tipo]);
    const grupo = tipo.includes('deb') ? 'DEBITO' : (parcelasN > 1 ? 'PARCELADO' : 'CREDITO');
    const base = {
      dataVenda: dataHora(r[i.venda]).data, nsu: txt(r[i.nsu]), autorizacao: '',
      estabelecimento: '', estabelecimentoNome: '', cnpj: '',
      modalidade: txt(r[i.tipo]).trim(), bandeira: txt(r[i.band]) || 'Banese Card', grupo,
      parcelas: parcelasN, parcela, valorBruto: bruto,
      taxa: bruto ? round2(100 * (bruto - liquido) / bruto) : 0,
    };
    if (lanc <= hoje) {
      parcelas.push({ ...base, dataRecebimento: lanc, dataVencimento: lanc, lote: '', valorLiquido: liquido,
        valorTaxa: round2(bruto - liquido), banco: '', agencia: '', conta: '', cancelamento: '', status: 'PAGA' });
    } else {
      futuros.push({ ...base, dataPrevista: lanc, valorLiquido: liquido, status: 'A RECEBER' });
    }
  }
  return { parcelas, futuros };
}

// o crédito da Mulvi cai um por dia de lançamento
function depositosMulvi(parcelas) {
  const m = new Map();
  for (const p of parcelas) {
    const a = m.get(p.dataRecebimento) || { data: p.dataRecebimento, bandeira: 'Banese Card',
      modalidade: 'Cartão', grupo: 'CREDITO', banco: '', valor: 0, valorBruto: 0,
      estabelecimento: '', estabelecimentoNome: '', status: 'PAGO', observacao: '' };
    a.valor = round2(a.valor + p.valorLiquido);
    a.valorBruto = round2(a.valorBruto + p.valorBruto);
    m.set(p.dataRecebimento, a);
  }
  return [...m.values()];
}

// ── Bracov: "Movimento de lotes fechados" (planilha) ───────────────────────
// VALOR · QUANT · TAXA · VALTAXA · VAL_LIQ · INICIO · FIM · N_FEC · DT_FECH · DT_PGTO ·
// CREDENCIADO · NOME_CREDENCIADO · CNPJ — uma linha por lote e por credenciado (loja).
// Como a Nutricash, traz só o total do lote: dá para conferir valor, taxa e data de pagamento.
// o Bracov escreve a data com ano de 2 dígitos (17/08/26) — dataHora() não pega
function dataCurta(v) {
  const t = txt(v);
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(t);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return dataHora(v).data;
}

function lotesBracov(wb) {
  const a = linhasDaAba(wb, wb.SheetNames[0], 'val_liq');
  if (!a) return [];
  const { c, dados } = a;
  const i = { valor: c('valor'), quant: c('quant'), taxa: c('taxa'), valtaxa: c('valtaxa'),
    liquido: c('val_liq'), ini: c('inicio'), fim: c('fim'), lote: c('n_fec'),
    fechamento: c('dt_fech'), pagamento: c('dt_pgto'), cred: c('credenciado'),
    nome: c('nome_credenciado'), cnpj: c('cnpj') };
  const out = [];
  for (const r of dados) {
    const pago = dataCurta(r[i.pagamento]);
    const bruto = num(r[i.valor]);
    if (!pago) continue;
    if (!bruto && !num(r[i.liquido])) continue;          // lote sem movimento nessa loja
    out.push({
      data: pago, dataFechamento: dataCurta(r[i.fechamento]),
      bandeira: 'Bracov', modalidade: 'Convênio', grupo: 'CREDIARIO', banco: '',
      valor: num(r[i.liquido]), valorBruto: bruto, taxa: pct(r[i.taxa]),
      estabelecimento: soDigitos(r[i.cred]), estabelecimentoNome: txt(r[i.nome]),
      cnpj: soDigitos(r[i.cnpj]), status: 'PAGO',
      // período do lote + quantidade de vendas que ele diz conter → o import usa isso para
      // COMPOR o lote a partir das vendas já importadas (o arquivo não lista venda a venda).
      lote: txt(r[i.lote]), periodoIni: dataCurta(r[i.ini]), periodoFim: dataCurta(r[i.fim]),
      quant: Math.round(num(r[i.quant])),
      observacao: `lote ${txt(r[i.lote])} · ${txt(r[i.ini])} a ${txt(r[i.fim])} · ${txt(r[i.quant])} venda(s) · taxa fixa R$ ${txt(r[i.valtaxa])}`,
    });
  }
  return out;
}

// ── Multi Mais / Uze: "Pagamentos efetuados / previsão" (planilha) ──────────
// Layout posicional, agrupado por loja: um cabeçalho com nome+CNPJ e, abaixo, uma linha por
// REPASSE — col2 Data do Crédito · col3 Vencimento Repasse · col5 Compras (bruto) · col6 Comissão ·
// col22 Valor pago (líquido) · col23 Status ("Confirmado (R)"). As parcelas detalhadas abaixo não
// trazem NSU, então aqui dá para conferir o LOTE (valor/data), não venda a venda.
// IMPORTANTE (regra do Joe): "Confirmado" é a operadora dizendo que PAGOU — isso é PREVISÃO; só o
// extrato do banco (ERP) confirma que o dinheiro CAIU. Por isso o reconhecimento é lote × extrato.
function dataBR(v) { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(txt(v)); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; }
function previsaoUze(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const topo = rows.slice(0, 8).map(r => (r || []).map(txt).join(' ')).join(' ').toLowerCase();
  if (!/uze|multmais|multi ?mais/.test(topo)) return [];
  const out = [];
  let cnpj = '', nome = '';
  for (const r of rows) {
    const c24 = txt(r[24]);
    if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(c24)) { cnpj = soDigitos(c24); nome = txt(r[22]) || nome; }
    if (!/\d{2}\/\d{2}\/\d{4}\s*::/.test(txt(r[2]))) continue;   // só as linhas de crédito (repasse)
    const dc = dataBR(r[2]);
    if (!dc) continue;
    const bruto = num(r[5]), comissao = num(r[6]), liquido = num(r[22]);
    if (!liquido && !bruto) continue;
    const status = txt(r[23]);
    const confirmado = /confirm/i.test(status);
    out.push({
      data: dc, dataFechamento: dataBR(r[3]) || dc,
      bandeira: 'Multi Mais / Uze', modalidade: 'Convênio', grupo: 'CREDIARIO', banco: '',
      valor: liquido, valorBruto: bruto, taxa: bruto ? Math.round(comissao / bruto * 10000) / 100 : 0,
      estabelecimento: cnpj, estabelecimentoNome: nome, cnpj,
      status: confirmado ? 'PAGO' : (status || 'PREVISTO').toUpperCase(),
      observacao: `repasse Uze · crédito ${txt(r[2]).replace('::', '').trim()} · venc. ${txt(r[3])} · ${status}`,
    });
  }
  return out;
}

// ── Brasil Card: "Relatorio de vendas completos" ───────────────────────────
// Data da venda · Data de vencimento · Número autorização · Parcela(s) ("5/5") · Cartão · Nome ·
// PDV · CNPJ · Valor Bruto · Valor Líquido · Data de pagamento · Modalidade — uma linha por
// PARCELA, com vencimento e NSU/autorização. Bem mais rico que o "sintético" (dá pra casar
// venda a venda e conferir vencimento contra o ERP) — prioridade sobre o sintético quando os dois
// baterem no mesmo arquivo (não deveria bater, mas por via das dúvidas o dispatcher testa este primeiro).
// devolve { parcelas, futuros } — "Data de pagamento" vem em branco pra parcela que ainda não caiu
// (é a agenda do que vai receber, não um erro/linha vazia).
function parcelasBrasilCardDetalhado(wb) {
  const a = linhasDaAba(wb, wb.SheetNames[0], 'numero autorizacao');
  if (!a) return { parcelas: [], futuros: [] };
  if (a.c('data de vencimento') < 0 || a.c('data de pagamento') < 0) return { parcelas: [], futuros: [] };
  const { c, dados } = a;
  const i = { venda: c('data da venda'), vencimento: c('data de vencimento'), aut: c('numero autorizacao'),
    parc: c('parcela(s)', 'parcelas'), pdv: c('pdv'), cnpj: c('cnpj'),
    bruto: c('valor bruto'), liquido: c('valor liquido'), pagamento: c('data de pagamento'),
    modalidade: c('modalidade') };
  const parcelas = [], futuros = [];
  for (const r of dados) {
    const bruto = num(r[i.bruto]), liquido = num(r[i.liquido]);
    if (!bruto && !liquido) continue;
    const [parcAtual, parcTotal] = String(r[i.parc] || '1/1').split('/').map(n => Number(n) || 1);
    const pago = dataHora(r[i.pagamento]).data;
    const base = {
      dataVenda: dataHora(r[i.venda]).data, dataVencimento: dataHora(r[i.vencimento]).data,
      autorizacao: txt(r[i.aut]), estabelecimento: soDigitos(r[i.pdv]), estabelecimentoNome: '',
      cnpj: soDigitos(r[i.cnpj]), modalidade: txt(r[i.modalidade]) || 'Convênio',
      bandeira: 'Brasil Card', grupo: 'CREDIARIO', parcelas: parcTotal, parcela: parcAtual,
      valorBruto: bruto, taxa: bruto ? round2(100 * (bruto - liquido) / bruto) : 0,
    };
    if (pago) {
      parcelas.push({ ...base, dataRecebimento: pago, nsu: '', lote: '', valorLiquido: liquido,
        valorTaxa: round2(bruto - liquido), banco: '', agencia: '', conta: '', cancelamento: '', status: 'PAGA' });
    } else {
      futuros.push({ ...base, dataPrevista: base.dataVencimento, nsu: '', valorLiquido: liquido, status: 'A RECEBER' });
    }
  }
  return { parcelas, futuros };
}

// mesma lógica da Alelo: soma as parcelas por dia+PDV pra formar o "depósito" equivalente
function depositosBrasilCardDetalhado(parcelas) {
  const m = new Map();
  for (const p of parcelas) {
    const k = [p.dataRecebimento, p.estabelecimento].join('|');
    const a = m.get(k) || { data: p.dataRecebimento, bandeira: 'Brasil Card', modalidade: 'Convênio',
      grupo: 'CREDIARIO', banco: '', valor: 0, valorBruto: 0, estabelecimento: p.estabelecimento,
      estabelecimentoNome: '', cnpj: p.cnpj, status: 'PAGO', observacao: '' };
    a.valor = round2(a.valor + p.valorLiquido);
    a.valorBruto = round2(a.valorBruto + p.valorBruto);
    m.set(k, a);
  }
  return [...m.values()];
}

// ── Le Card: export do "Repasse > Pagamentos Efetuados" (RelRepassePagamentosEfetuados) ────
// Não é uma tabela simples — é o mesmo layout do PDF que o portal mostra, achatado em linhas:
// - cabeçalho de loja: "Nome Ltda (Grupo - CNPJ) (Dep: Banco Ag: X C/C: Y)" — muda o CNPJ atual
// - linha "DD/MM/AAAA :: "  (col0) = um pagamento de verdade: col1 vencimento original, col2
//   compras(bruto), col6 créditos admin, col12 valor pago líquido, col13 status
// - "N Conectividade TEF/POS...", "Tarifa de Repasse", "Taxa de Adesão", "Taxa Anual" = ajustes
//   (taxas descontadas) referentes ao pagamento anterior
// - "Compras" = uma venda que compôs aquele pagamento (col1 data venda, col2 valor, col3 cartão,
//   col4 cliente, col5 código de autorização/PAT)
// - "Totais ...:" / "Página X de Y" / o parágrafo do Decreto PAT = rodapé, ignora
// Achado em dados reais: a "Data do Crédito" (col0) é sempre a MESMA em todo o arquivo — é quando
// o lote foi processado, não quando a venda ocorreu. Uma pilha de débitos antigos (vencimento em
// 2023) pode ser toda creditada num único dia dentro do período pedido — é assim mesmo, não é bug.
function repasseLeCard(wb) {
  const nomeAba = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, raw: false, defval: '' });
  // confirma que é este layout antes de gastar tempo processando 5 mil linhas à toa
  const pareceLeCard = rows.slice(0, 30).some(r => /\(.*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}.*\)/.test(String(r[0] || '')))
    && rows.some(r => /^\s*\d{2}\/\d{2}\/\d{4}\s*::/.test(String(r[0] || '')));
  if (!pareceLeCard) return { parcelas: [], depositos: [], ajustes: [] };

  const parcelas = [], depositos = [], ajustes = [];
  let cnpjAtual = '', dataAtual = '', vencimentoAtual = '';
  const reCnpjEmParenteses = /\(.*?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}).*?\)/;
  const reDataCredito = /^\s*(\d{2}\/\d{2}\/\d{4})\s*::/;
  const reAjuste = /^(\d+\s+Conectividade TEF\/POS|Tarifa de Repasse|Taxa de Ades[aã]o|Taxa Anual)/i;

  for (const r of rows) {
    const c0 = String(r[0] || '').trim();
    if (!c0) continue;
    const mCnpj = reCnpjEmParenteses.exec(c0);
    if (mCnpj && c0.length > 40) { cnpjAtual = soDigitos(mCnpj[1]); continue; }
    const mData = reDataCredito.exec(c0);
    if (mData) {
      dataAtual = dataHora(mData[1]).data; vencimentoAtual = dataHora(txt(r[1])).data;
      const pago = num(r[12]);
      if (dataAtual) {
        depositos.push({ data: dataAtual, bandeira: 'Le Card', modalidade: 'Convênio', grupo: 'CREDIARIO',
          banco: '', valor: pago, valorBruto: num(r[2]), estabelecimento: cnpjAtual, estabelecimentoNome: '',
          cnpj: cnpjAtual, status: /confirmad/i.test(txt(r[13])) ? 'PAGO' : txt(r[13]).toUpperCase() || 'PAGO' });
      }
      continue;
    }
    if (reAjuste.test(c0)) {
      const valor = num(r[2]);
      if (valor && dataAtual) ajustes.push({ tipo: 'ajuste', data: dataAtual, dataVenda: vencimentoAtual, nsu: '',
        estabelecimento: cnpjAtual, cnpj: cnpjAtual, bandeira: 'Le Card', motivo: c0, descricao: c0,
        valor: Math.abs(valor), credito: valor > 0 ? valor : 0, pendente: 0 });
      continue;
    }
    if (c0 === 'Compras') {
      const bruto = num(r[2]);
      if (bruto && dataAtual) parcelas.push({
        dataRecebimento: dataAtual, dataVenda: dataHora(txt(r[1])).data, dataVencimento: vencimentoAtual,
        nsu: '', autorizacao: txt(r[5]), lote: '', estabelecimento: cnpjAtual, estabelecimentoNome: '',
        cnpj: cnpjAtual, modalidade: 'Convênio', bandeira: 'Le Card', grupo: 'CREDIARIO',
        parcelas: 1, parcela: 1, valorBruto: bruto, valorLiquido: bruto, valorTaxa: 0, taxa: 0,
        banco: '', agencia: '', conta: '', cancelamento: '', status: 'PAGA',
      });
      continue;
    }
    // "Totais ...:", "Página X de Y", o parágrafo do Decreto PAT, ou qualquer outra coisa — ignora
  }
  return { parcelas, depositos, ajustes };
}

// ── Banese/Mulvi: "Movimento Financeiro Sintetico" ─────────────────────────
// DataLancamento · ContaCorrente · ValorMovimento — um total por dia, sem PDV nem detalhe de
// venda (só o extrato da conta). Não tem como separar por loja: cai tudo como um único depósito
// por dia; quem importa escolhe a loja na tela (igual à Nutricash/Le Card quando não tem CNPJ).
function lotesMulviSintetico(wb) {
  const a = linhasDaAba(wb, wb.SheetNames[0], 'valormovimento');
  if (!a) return [];
  const { c, dados } = a;
  const i = { data: c('datalancamento'), conta: c('contacorrente'), valor: c('valormovimento') };
  const out = [];
  for (const r of dados) {
    const dh = dataHora(r[i.data]); if (!dh.data) continue;
    const valor = num(r[i.valor]);
    if (!valor) continue;
    out.push({ data: dh.data, bandeira: 'Banese Card', modalidade: 'Convênio', grupo: 'CREDIARIO',
      banco: '', conta: txt(r[i.conta]), valor, valorBruto: valor, taxa: 0,
      estabelecimento: '', estabelecimentoNome: '', cnpj: '', status: 'PAGO', observacao: '' });
  }
  return out;
}

// ── Brasil Card: "Relatorio de vendas sintetico" ───────────────────────────
// Data de Pagamento · Quantidade de tickets · Valor da venda · Valor líquido · PDV · CNPJ —
// uma linha por dia e por PDV/loja. Igual ao Bracov: só o total do lote, sem NSU por venda.
function lotesBrasilCard(wb) {
  const a = linhasDaAba(wb, wb.SheetNames[0], 'valor da venda');
  if (!a) return [];
  // essa assinatura de coluna ("valor da venda" + "pdv") também bate com o layout de VENDAS
  // (conciliacaoCartaoParsers BRASILCARD) — só confirma como repasse se tiver "data de pagamento"
  // E "quantidade de tickets" (o de vendas tem "número autorização"/"cartão" em vez disso).
  // ATENÇÃO: mapaColunas devolve -1 quando não acha — "data de pagamento" cai na coluna 0 aqui,
  // e `!0` é true em JS, então a checagem tem que ser "< 0", não "falsy".
  if (a.c('data de pagamento') < 0 || a.c('quantidade de tickets') < 0) return [];
  const { c, dados } = a;
  const i = { pagamento: c('data de pagamento'), qtd: c('quantidade de tickets'),
    bruto: c('valor da venda'), liquido: c('valor liquido'), pdv: c('pdv'), cnpj: c('cnpj') };
  const out = [];
  for (const r of dados) {
    const dh = dataHora(r[i.pagamento]); if (!dh.data) continue;
    const bruto = num(r[i.bruto]), liquido = num(r[i.liquido]);
    if (!bruto && !liquido) continue;
    out.push({
      data: dh.data, bandeira: 'Brasil Card', modalidade: 'Convênio', grupo: 'CREDIARIO', banco: '',
      valor: liquido, valorBruto: bruto, taxa: bruto ? round2(100 * (bruto - liquido) / bruto) : 0,
      estabelecimento: soDigitos(r[i.pdv]), estabelecimentoNome: '',
      cnpj: soDigitos(r[i.cnpj]), status: 'PAGO',
      observacao: `${txt(r[i.qtd])} ticket(s)`,
    });
  }
  return out;
}

// ── entrada única ──────────────────────────────────────────────────────────
function lerRepasse(buffer, { nomeArquivo = '' } = {}) {
  let wb;
  try { wb = XLSX.read(buffer, { cellDates: true, raw: false }); }
  catch (e) { return { ok: false, erro: 'Não consegui abrir o arquivo (' + e.message + ').' }; }

  // MULTI MAIS / UZE: "Pagamentos efetuados / previsão" — só o total do lote por crédito.
  // Previsão não é dinheiro que caiu: o reconhecimento é o LOTE × EXTRATO do banco (auto-conferência).
  const prevUze = previsaoUze(wb);
  if (prevUze.length) {
    const previstos = prevUze.filter(d => d.status !== 'PAGO').length;
    const avisos = ['Esta é a PREVISÃO de repasse da Uze/Multi Mais — a operadora confirma o pagamento, mas só o extrato do banco diz que caiu. Vou tentar reconhecer cada lote no extrato do ERP; o que não bater fica como "a conferir".'];
    if (previstos) avisos.push(`${previstos} lote(s) ainda não confirmados pela operadora (previstos).`);
    return { ok: true, operadora: 'Multi Mais / Uze', layout: 'UZE_PREVISAO', arquivo: nomeArquivo,
      avisos, parcelas: [], depositos: prevUze, futuros: [], ajustes: [], semDetalhe: true };
  }

  // ALELO: abas "Recebimentos" + "Outras Transações" (o arquivo do portal Meu Estabelecimento)
  const ehAlelo = wb.SheetNames.some(s => chave(s) === 'recebimentos')
    && wb.SheetNames.some(s => chave(s) === 'outras transacoes');
  if (ehAlelo) {
    const parcelas = parcelasAlelo(wb);
    const ajustes = ajustesAlelo(wb);
    if (!parcelas.length) return { ok: false, erro: 'O arquivo da Alelo abriu, mas não tem nenhum recebimento no período escolhido.' };
    const avisos = [];
    if (ajustes.length) avisos.push(`${ajustes.length} taxa(s)/ajuste(s) em "Outras Transações" — entram no crédito do dia.`);
    return { ok: true, operadora: 'Alelo', layout: 'ALELO_RECEBIMENTOS', arquivo: nomeArquivo, avisos,
      parcelas, depositos: depositosAlelo(parcelas, ajustes), futuros: [], ajustes };
  }

  // MULVI PAY / BANESE: "Movimento Futuro do Lojista" (parcela a parcela — paga ou a receber,
  // decide pela própria data de lançamento)
  const mulvi = parcelasMulvi(wb);
  if (mulvi.parcelas.length || mulvi.futuros.length) {
    const avisos = ['A Mulvi não traz a loja no arquivo — o CNPJ é o que estava selecionado no portal.'];
    if (!mulvi.parcelas.length) avisos.push('Esse arquivo só tem parcelas a receber (datas futuras) — nada caiu na conta ainda.');
    return { ok: true, operadora: 'Banese / Mulvi', layout: 'MULVI_RECEBIMENTOS', arquivo: nomeArquivo,
      avisos, parcelas: mulvi.parcelas, depositos: depositosMulvi(mulvi.parcelas), futuros: mulvi.futuros, ajustes: [] };
  }

  // MULVI PAY / BANESE: "Movimento Financeiro Sintetico" (extrato por dia, sem detalhe de venda)
  const lotesMulviS = lotesMulviSintetico(wb);
  if (lotesMulviS.length) {
    return { ok: true, operadora: 'Banese / Mulvi', layout: 'MULVI_SINTETICO', arquivo: nomeArquivo,
      avisos: ['Esse relatório só traz o extrato por dia — sem separar por loja nem por venda.'],
      parcelas: [], depositos: lotesMulviS, futuros: [], ajustes: [], semDetalhe: true };
  }

  // LE CARD: export do "Repasse > Pagamentos Efetuados" (achatado do mesmo layout do PDF)
  const leCard = repasseLeCard(wb);
  if (leCard.depositos.length) {
    return { ok: true, operadora: 'Le Card', layout: 'LECARD_REPASSE', arquivo: nomeArquivo, avisos: [],
      parcelas: leCard.parcelas, depositos: leCard.depositos, futuros: [], ajustes: leCard.ajustes };
  }

  // BRACOV: planilha de lotes fechados
  const lotesBrac = lotesBracov(wb);
  if (lotesBrac.length) {
    return { ok: true, operadora: 'Bracov', layout: 'BRACOV_LOTES', arquivo: nomeArquivo,
      avisos: ['O Bracov fecha o lote do pagamento (período + total). Casei as vendas desse período já importadas para mostrar quais compõem o lote — suba o relatório de VENDAS do Bracov do mesmo período para o lote fechar venda a venda.'],
      parcelas: [], depositos: lotesBrac, futuros: [], ajustes: [], semDetalhe: true, comporPorPeriodo: true };
  }

  // BRASIL CARD: "Relatorio de vendas completos" (parcela a parcela, com vencimento e autorização)
  const bcDet = parcelasBrasilCardDetalhado(wb);
  if (bcDet.parcelas.length || bcDet.futuros.length) {
    const avisos = [];
    if (!bcDet.parcelas.length) avisos.push('Esse arquivo só tem parcelas ainda a receber (Data de pagamento em branco) — nada caiu na conta ainda nesse período.');
    return { ok: true, operadora: 'Brasil Card', layout: 'BRASILCARD_COMPLETO', arquivo: nomeArquivo,
      avisos, parcelas: bcDet.parcelas, depositos: depositosBrasilCardDetalhado(bcDet.parcelas), futuros: bcDet.futuros, ajustes: [] };
  }

  // BRASIL CARD: "Relatorio de vendas sintetico" (repasse por PDV/dia, sem detalhe de parcela)
  const lotesBC = lotesBrasilCard(wb);
  if (lotesBC.length) {
    return { ok: true, operadora: 'Brasil Card', layout: 'BRASILCARD_SINTETICO', arquivo: nomeArquivo,
      avisos: ['O Brasil Card entrega só o total do dia por PDV — dá para conferir valor e taxa, mas não venda a venda.'],
      parcelas: [], depositos: lotesBC, futuros: [], ajustes: [], semDetalhe: true };
  }

  // NUTRICASH: planilha única com "Data do fechamento" e "Valor Líquido"
  const fechNutri = fechamentosNutricash(wb);
  if (fechNutri.length) {
    return { ok: true, operadora: 'Nutricash', layout: 'NUTRICASH_FECHAMENTO', arquivo: nomeArquivo,
      avisos: ['A Nutricash entrega só o total do lote — dá para conferir o valor e a data de pagamento, mas não venda a venda.'],
      parcelas: [], depositos: fechNutri, futuros: [], ajustes: [], semDetalhe: true };
  }

  // REDE: a assinatura é a aba "pagamentos" com "data do recebimento"
  const ehRede = !!linhasDaAba(wb, 'pagamentos', 'data do recebimento') || !!linhasDaAba(wb, 'recebidos', 'valor depositado');
  if (!ehRede) {
    return { ok: false, erro: 'Não reconheci o relatório de recebimentos. Hoje leio Rede e Alelo.' };
  }
  const parcelas = parcelasRede(wb);
  const depositos = depositosRede(wb);
  const futuros = futurosRede(wb);
  const ajustes = ajustesRede(wb);
  if (!parcelas.length && !depositos.length) {
    return { ok: false, erro: 'O arquivo abriu, mas não tem pagamento nenhum no período escolhido.' };
  }
  const avisos = [];
  if (!parcelas.length) avisos.push('Sem a aba "pagamentos" — exporte como "relatório detalhado" para eu casar venda a venda.');
  if (ajustes.length) avisos.push(`${ajustes.length} ajuste(s)/cancelamento(s) no período — conferir na aba Repasses.`);
  return { ok: true, operadora: 'Rede', layout: 'REDE_RECEBIMENTOS', arquivo: nomeArquivo,
    parcelas, depositos, futuros, ajustes, avisos };
}

module.exports = { lerRepasse, grupoDe };
