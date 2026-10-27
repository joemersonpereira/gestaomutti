// conciliacaoCartao.js — confronta a VERDADE DA OPERADORA com o que o ERP registrou.
//
// Por que existe: o PDV não fala com o TEF por DLL. O operador escolhe a forma de pagamento no ERP
// (ex.: "02-CREDITO") e depois escolhe outra na SiTef (ex.: Alelo). O ERP grava a modalidade errada,
// a conciliação não fecha e o dinheiro fica "não conciliado". Aqui o confronto é feito de fora:
//   fonte A (sem upload): os arquivos de conciliação que o próprio ERP já importa (conciliacaocartaoitem);
//   fonte B (upload):     os relatórios que a Tesouraria baixa de cada operadora (conc_item).
//
// Regras de confronto (as duas fontes usam as MESMAS):
//   MODALIDADE    → o grupo real (débito/crédito/parcelado/voucher/pix) não bate com a modalidade do ERP
//   PARCELAMENTO  → nº de parcelas diferente
//   VALOR         → diferença acima da tolerância (R$ 0,02)
//   TAXA          → taxa da operadora diferente da taxa gravada no ERP (> 0,10 p.p.)
//   SO_OPERADORA  → a operadora pagou e o ERP não tem o título (venda fora do sistema / NSU errado)
//   SO_ERP        → o ERP tem o título e a operadora não pagou (risco de perda)
const crypto = require('crypto');
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa, lojasEmpresa, normalizarLojas, filtroLojaPosic } = require('./escopoCompras');
const { lerArquivo } = require('./conciliacaoCartaoParsers');
const { lerUze } = require('./conciliacaoUzeParsers');

const TOL_VALOR = 0.02;   // R$ — arredondamento de parcela
const TOL_TAXA = 0.10;    // pontos percentuais
const GRUPOS = ['DEBITO', 'CREDITO', 'PARCELADO', 'VOUCHER', 'PIX', 'CREDIARIO', 'PREPAGO', 'OUTRO'];
const ROTULO_GRUPO = { DEBITO: 'Débito', CREDITO: 'Crédito à vista', PARCELADO: 'Crédito parcelado', VOUCHER: 'Voucher/benefício', PIX: 'Pix', CREDIARIO: 'Crediário', PREPAGO: 'Pré-pago', OUTRO: 'Outro' };
const TIPOS = {
  MODALIDADE: { rotulo: 'Forma de pagamento errada', cor: '#C0392B', peso: 1 },
  PARCELAMENTO: { rotulo: 'Parcelamento diferente', cor: '#C87A1E', peso: 2 },
  VALOR: { rotulo: 'Valor diferente', cor: '#B7791F', peso: 3 },
  TAXA: { rotulo: 'Taxa diferente do ERP', cor: '#7A4FB0', peso: 4 },
  SO_OPERADORA: { rotulo: 'Operadora pagou, ERP não tem', cor: '#2E5C9E', peso: 5 },
  SO_ERP: { rotulo: 'ERP tem, operadora não pagou', cor: '#8A2E2E', peso: 6 },
};

const round = n => Math.round((Number(n) || 0) * 100) / 100;
// NSU/autorização: zeros à esquerda e separadores variam entre o relatório e o ERP
const norm = v => String(v == null ? '' : v).trim().replace(/\D/g, '').replace(/^0+/, '');
// O ERP às vezes grava o NSU com prefixo próprio (Le Card: relatório 92530852 → ERP 192530852).
// A "cauda" (últimos 8 dígitos) casa os dois lados sem precisar saber o prefixo de cada operadora.
const CAUDA = 8;
const cauda = v => { const n = norm(v); return n.length >= 6 ? n.slice(-CAUDA) : ''; };

// ── De-para 1: modalidade do ERP → grupo real ──────────────────────────────
// Semeia sozinho pelo nome da modalidade; a Tesouraria ajusta na tela quando o palpite estiver errado.
function palpiteGrupo(nome) {
  const n = String(nome || '').toUpperCase();
  if (/PIX/.test(n)) return 'PIX';
  if (/PARCELAD/.test(n)) return 'PARCELADO';
  // voucher ANTES de crédito: "ALELO" contém "ELO" e cairia como bandeira de crédito
  if (/ALELO|SODEXO|TICKET|\bVR\b|NUTRICASH|LE ?CARD|GOODCARD|\bBEN\b|VALE|REFEI|ALIMENT/.test(n)) return 'VOUCHER';
  if (/DEBITO|DÉBITO|MAESTRO|ELECTRON/.test(n)) return 'DEBITO';
  if (/BRASIL ?CARD|BRACOV|CONVENIO|CONVÊNIO|UZE|MULTI MAIS|IQNUS|BANESE|MULVI|ACCORD/.test(n)) return 'CREDIARIO';
  if (/CREDITO|CRÉDITO|VISA|MASTER|\bELO\b|AMERICAN|HIPER|DINERS|SOROCRED|SICREDI|CREDSYSTEM/.test(n)) return 'CREDITO';
  return 'OUTRO';
}

async function modalidadesErp() {
  const rows = await erpQuery(`SELECT m.id, m.nome, m.status FROM modalidadecartao m ORDER BY m.nome`);
  return rows.map(r => ({ id: String(r.id), nome: (r.nome || '').trim(), ativa: r.status === 'A' }));
}

// Lê o de-para completando o que faltar (modalidade nova no ERP entra com o palpite).
async function depara(empresaId) {
  const mods = await modalidadesErp();
  const atuais = new Map(db.prepare('SELECT modalidade_id, grupo, conciliar FROM conc_modalidade_grupo WHERE empresa_id=?')
    .all(empresaId).map(r => [String(r.modalidade_id), r]));
  const ins = db.prepare(`INSERT OR IGNORE INTO conc_modalidade_grupo
    (empresa_id, modalidade_id, modalidade_nome, grupo, conciliar, atualizado_em) VALUES (?,?,?,?,1,datetime('now'))`);
  const novas = mods.filter(m => !atuais.has(m.id));
  if (novas.length) { const tx = db.transaction(() => novas.forEach(m => ins.run(empresaId, m.id, m.nome, palpiteGrupo(m.nome)))); tx(); }
  return mods.map(m => {
    const at = atuais.get(m.id);
    return { ...m, grupo: at ? at.grupo : palpiteGrupo(m.nome), conciliar: at ? at.conciliar !== 0 : true };
  });
}

function salvarDepara(empresaId, itens = []) {
  const up = db.prepare(`INSERT INTO conc_modalidade_grupo (empresa_id, modalidade_id, modalidade_nome, grupo, conciliar, atualizado_em)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, modalidade_id) DO UPDATE SET grupo=excluded.grupo, conciliar=excluded.conciliar, atualizado_em=datetime('now')`);
  const tx = db.transaction(() => itens.forEach(i => up.run(empresaId, String(i.id), i.nome || '', GRUPOS.includes(i.grupo) ? i.grupo : 'OUTRO', i.conciliar === false ? 0 : 1)));
  tx();
  return { ok: true, salvos: itens.length };
}

// ── De-para 2: operadora do relatório → modalidades aceitas no ERP ──────────
const PALPITE_OPERADORA = {
  'Brasil Card': /BRASIL ?CARD/i, 'Le Card': /LE ?CARD/i, 'Nutricash': /NUTRICASH/i,
  'Bracov': /BRACOV|BRASIL CONV/i, 'Alelo': /ALELO/i, 'Banese / Mulvi': /BANESE|MULVI/i,
  // nomes como o ERP grava nos arquivos que ele mesmo importa
  'Bolt (Brasilcard.net)': /BRASIL ?CARD/i, 'Brasil Convênios': /BRACOV|BRASIL CONV/i,
  // Credenciadora multibandeira: débito, crédito, parcelado e voucher da maquininha.
  // Pix fica de FORA do palpite de propósito: a maioria dos Pix da farmácia é do banco, não da
  // maquininha — incluí-lo faria o sistema acusar centenas de "não pagou" que não existem.
  // Quem usa Pix na maquininha marca a modalidade em Ajustes ▸ Operadoras.
  // Voucher fica de FORA do escopo da Rede de propósito: ela CAPTURA Alelo/Le Card na maquininha
  // (a venda aparece no relatório dela), mas quem PAGA é o emissor. Se o voucher entrasse aqui, o
  // sistema acusaria "a Rede não pagou" em toda venda de vale — e ela nunca vai pagar mesmo.
  'Rede': /^0?1-?DEBITO|^0?2-?CREDITO|^0?3-?PARCELADO/i,
  'Cielo': /^0?1-?DEBITO|^0?2-?CREDITO|^0?3-?PARCELADO/i,
  'GetNet': /^0?1-?DEBITO|^0?2-?CREDITO|^0?3-?PARCELADO/i,
  'Stone': /^0?1-?DEBITO|^0?2-?CREDITO|^0?3-?PARCELADO/i,
  // "07-REDE UZE/MULTI MAIS" no ERP — é outra credenciadora, mapeada à parte (não é a Rede normal
  // e não vem no EDI automático dela, então precisa da mesma conferência manual das outras).
  'Multi Mais / Uze': /UZE|MULTI ?MAIS/i,
};
async function deparaOperadora(empresaId, operadora) {
  const linhas = db.prepare('SELECT modalidade_id FROM conc_operadora_modalidade WHERE empresa_id=? AND operadora=?').all(empresaId, operadora);
  if (linhas.length) return linhas.map(l => String(l.modalidade_id));
  const re = PALPITE_OPERADORA[operadora];
  if (!re) return [];
  const mods = await modalidadesErp();
  const ids = mods.filter(m => re.test(m.nome)).map(m => m.id);
  if (ids.length) {
    const ins = db.prepare(`INSERT OR IGNORE INTO conc_operadora_modalidade (empresa_id, operadora, modalidade_id, atualizado_em) VALUES (?,?,?,datetime('now'))`);
    const tx = db.transaction(() => ids.forEach(id => ins.run(empresaId, operadora, id))); tx();
  }
  return ids;
}
function salvarDeparaOperadora(empresaId, operadora, modalidadeIds = []) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM conc_operadora_modalidade WHERE empresa_id=? AND operadora=?').run(empresaId, operadora);
    const ins = db.prepare(`INSERT OR IGNORE INTO conc_operadora_modalidade (empresa_id, operadora, modalidade_id, atualizado_em) VALUES (?,?,?,datetime('now'))`);
    modalidadeIds.forEach(id => ins.run(empresaId, operadora, String(id)));
  });
  tx();
  return { ok: true };
}

// ── Lado ERP: títulos de cartão agrupados por TRANSAÇÃO ────────────────────
// O ERP quebra o parcelado em N títulos (valor dividido). A operadora reporta a venda inteira —
// por isso agrupamos por (loja + nº da transação) e somamos as parcelas antes de comparar.
async function titulosErp(unis, ini, fim, dias) {
  const rows = await erpQuery(`
    SELECT cr.id, cr.unidadenegocioid uni, cr.numerotransacao nsu, cr.numeroautorizacao aut,
           cr.valor::float8 valor, cr.taxa::float8 taxa, cr.numeroparcela, cr.totalparcela,
           to_char(cr.dataemissao, 'YYYY-MM-DD') data, to_char(cr.dataemissao, 'HH24:MI:SS') hora,
           to_char(cr.datavencimento, 'YYYY-MM-DD') vencimento,
           cr.statusconciliacao, cr.conferido, cr.status, cr.origem,
           cr.modalidadecartaoid mod_id, mc.nome modalidade,
           COALESCE(p.nome, 'usuário ' || cr.usuarioid) operador, cr.usuarioid
      FROM cartaoreceber cr
      LEFT JOIN modalidadecartao mc ON mc.id = cr.modalidadecartaoid
      LEFT JOIN usuario us ON us.id = cr.usuarioid
      LEFT JOIN pessoa p ON p.id = us.pessoaid
     WHERE cr.unidadenegocioid = ANY($1::bigint[])
       AND cr.dataemissao >= $2::date AND cr.dataemissao < ($3::date + 1)
       ${dias && dias.length ? 'AND cr.dataemissao::date = ANY($4::date[])' : ''}
       -- venda CANCELADA no ERP não entra na conciliação (status 'C' = origemcancelamento preenchida)
       AND cr.status <> 'C'
       -- títulos que a Tesouraria JÁ corrigiu no ERP saem da conta (o certo é o substituto)
       AND NOT EXISTS (SELECT 1 FROM correcaocartaoreceberincorreto ci WHERE ci.cartaoreceberid = cr.id)`,
    dias && dias.length ? [unis, ini, fim, dias] : [unis, ini, fim]);
  const mapa = new Map();
  for (const r of rows) {
    // Agrupa as PARCELAS de uma mesma venda. Só o NSU não basta: o ERP reaproveita o número
    // (duas vendas diferentes no mesmo dia com o mesmo NSU) — por isso entram também o total de
    // parcelas, a hora e a origem (V=venda, N=entrega, C=correção, R=crediário, M=manual).
    const chave = [r.uni, norm(r.nsu) || 'A' + norm(r.aut) || 'ID' + r.id, r.totalparcela, r.hora, r.origem].join('|');
    let t = mapa.get(chave);
    if (!t) {
      t = { chave, ids: [], uni: Number(r.uni), nsu: String(r.nsu || '').trim(), aut: String(r.aut || '').trim(),
        valor: 0, taxa: Number(r.taxa) || 0, parcelas: Number(r.totalparcela) || 1, modId: String(r.mod_id),
        modalidade: (r.modalidade || '—').trim(), operador: (r.operador || '').trim(), usuarioId: String(r.usuarioid || ''),
        data: r.data, hora: r.hora, vencimento: r.vencimento || null, origem: r.origem,
        statusConc: r.statusconciliacao, conferido: !!r.conferido, status: r.status, casado: false };
      mapa.set(chave, t);
    }
    t.ids.push(Number(r.id));
    t.valor = round(t.valor + Number(r.valor));
    t.parcelas = Math.max(t.parcelas, Number(r.totalparcela) || 1);
  }
  return [...mapa.values()];
}

// ── Casamento operadora × ERP ──────────────────────────────────────────────
// Em cascata, cada título casa uma única vez:
//   1. NSU igual  2. NSU pela cauda (prefixo do ERP)  3. nº de autorização  4. mesma loja/dia/valor
// O nível 4 é um palpite — vai marcado como "valor+dia" para a Tesouraria saber que é o mais frágil.
function casar(linhasOp, titulos, grupoDe) {
  const idx = (mapa, k, t) => { if (!k) return; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(t); };
  const porNsu = new Map(), porCauda = new Map(), porAut = new Map(), porValor = new Map();
  for (const t of titulos) {
    idx(porNsu, norm(t.nsu) && t.uni + '|' + norm(t.nsu), t);
    idx(porCauda, cauda(t.nsu) && t.uni + '|' + cauda(t.nsu), t);
    idx(porAut, norm(t.aut) && t.uni + '|' + norm(t.aut), t);
    idx(porValor, t.uni + '|' + t.data + '|' + t.valor.toFixed(2), t);
  }
  const minutos = h => { const m = /(\d{1,2}):(\d{2})/.exec(h || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  // O mesmo NSU pode servir a duas vendas no mesmo dia — entre os candidatos livres, fica com o
  // que mais se parece com a transação da operadora (valor, depois forma de pagamento, depois hora).
  // NSU não é único no tempo: a operadora recicla o número em poucas semanas. Só vale casar
  // transações do mesmo dia (ou da virada da meia-noite).
  const dia = d => Date.parse(String(d || '') + 'T12:00:00') || 0;
  const pertoNoTempo = (t, l) => { const a = dia(t.data), b = dia(l.data); return !a || !b || Math.abs(a - b) <= 36e5 * 30; };
  const melhor = (arr, l) => {
    const abertos = (arr || []).filter(t => !t.casado && pertoNoTempo(t, l));
    if (abertos.length <= 1) return abertos[0];
    const hOp = minutos(l.hora);
    const nota = t => (Math.abs(t.valor - round(l.valor)) <= TOL_VALOR ? 8 : 0)
      + (t.data === l.data ? 4 : 0)
      + (l.grupo && grupoDe(t.modId) === l.grupo ? 2 : 0)
      + (t.parcelas === l.parcelas ? 1 : 0);
    return abertos.slice().sort((a, b) => nota(b) - nota(a)
      || (hOp == null ? 0 : Math.abs((minutos(a.hora) ?? 1e9) - hOp) - Math.abs((minutos(b.hora) ?? 1e9) - hOp)))[0];
  };
  const livre = (arr, l) => melhor(arr, l);
  // Palpite por valor+dia: exige o horário próximo (a emissão do título no ERP fica minutos depois
  // da transação na maquininha) e prefere o título cuja forma de pagamento já bate.
  const JANELA_MIN = 60;
  const livrePref = (arr, l) => {
    const hOp = minutos(l.hora);
    let abertos = (arr || []).filter(t => !t.casado);
    // hora exatamente 00:00 no EDI (Brasil Card/Bolt manda a data sem hora) não é uma venda de
    // meia-noite de verdade — é "hora desconhecida". Tratar como null: senão a janela de 60min
    // rejeita o casamento certo (ex.: venda das 15h57 vira "operadora não pagou" + "ERP não tem",
    // um par falso, porque 15h57 está a quase 16h de distância de um 00:00 que nunca existiu).
    if (hOp) {
      const comHora = abertos.filter(t => minutos(t.hora) != null);
      if (comHora.length) {
        abertos = comHora.filter(t => Math.abs(minutos(t.hora) - hOp) <= JANELA_MIN)
          .sort((a, b) => Math.abs(minutos(a.hora) - hOp) - Math.abs(minutos(b.hora) - hOp));
      }
    }
    return abertos.find(t => grupoDe(t.modId) === l.grupo) || abertos[0];
  };
  const pares = [], soOperadora = [];
  for (const l of linhasOp) {
    let t = null, via = null;
    if (norm(l.nsu)) { t = livre(porNsu.get(l.uni + '|' + norm(l.nsu)), l); via = 'nsu'; }
    if (!t && cauda(l.nsu)) { t = livre(porCauda.get(l.uni + '|' + cauda(l.nsu)), l); via = 'nsu (cauda)'; }
    if (!t && norm(l.autorizacao)) { t = livre(porAut.get(l.uni + '|' + norm(l.autorizacao)), l); via = 'autorização'; }
    if (!t && cauda(l.autorizacao)) { t = livre(porCauda.get(l.uni + '|' + cauda(l.autorizacao)), l); via = 'autorização (cauda)'; }
    if (!t) { t = livrePref(porValor.get(l.uni + '|' + l.data + '|' + round(l.valor).toFixed(2)), l); via = 'valor+dia'; }
    if (!t) { soOperadora.push(l); continue; }
    t.casado = true;
    pares.push({ op: l, erp: t, via });
  }
  return { pares, soOperadora, soErp: titulos.filter(t => !t.casado) };
}

// ── Classificação das divergências ─────────────────────────────────────────
// grupoEsperado: modalidade do ERP → grupo (de-para 1). aceitas: modalidades válidas p/ a operadora (de-para 2).
function classificar({ pares, soOperadora, soErp }, { grupoDe, conciliarMod, aceitas, cobrado, pertence, daBandeira, operadora, nomeLoja, origem, conferirTaxa }) {
  const out = [];
  const ref = (tipo, id) => tipo + '|' + origem + ':' + id;
  for (const { op, erp, via } of pares) {
    const base = {
      origem, operadora, via, loja: nomeLoja(erp.uni), uni: erp.uni, data: op.data, hora: op.hora,
      nsu: op.nsu || erp.nsu, autorizacao: op.autorizacao || erp.aut, bandeira: op.bandeira,
      operador: erp.operador, crIds: erp.ids, modalidadeErp: erp.modalidade, modalidadeId: erp.modId,
      grupoOperadora: op.grupo, tipoOperadora: op.tipoOperadora, cliente: op.cliente,
      valorErp: erp.valor, valorOperadora: round(op.valor), parcelasErp: erp.parcelas, parcelasOperadora: op.parcelas,
      taxaErp: erp.taxa, taxaOperadora: op.taxa, statusConc: erp.statusConc, idOp: op.id || null,
    };
    if (conciliarMod(erp.modId) === false) continue;                     // modalidade marcada p/ não conciliar
    const grupoErp = grupoDe(erp.modId);
    const idRef = op.id != null ? op.id : erp.ids[0];
    // A forma do ERP pertencer à operadora que pagou já basta: o convênio próprio (Brasil Card,
    // Bracov) aparece no arquivo como "crédito" mas no ERP tem forma própria — e está certo.
    const daOperadora = pertence && op.operadora ? pertence(op.operadora, erp.modId) : false;
    const vale = daBandeira ? daBandeira(op.bandeira, erp.modId) : null;
    // 1) forma de pagamento: o erro que motivou o módulo
    if (!daOperadora && op.grupo && grupoErp && op.grupo !== grupoErp) {
      out.push({ ...base, tipo: 'MODALIDADE', ref: ref('MODALIDADE', idRef), valor: round(op.valor),
        detalhe: `ERP lançou "${erp.modalidade}" (${ROTULO_GRUPO[grupoErp] || grupoErp}); a operadora registrou ${ROTULO_GRUPO[op.grupo] || op.grupo}${op.bandeira ? ' ' + op.bandeira : ''}.`
          + (via === 'valor+dia' ? ' (casado por valor e dia — confira a venda antes de corrigir.)' : '') });
    } else if (vale && !vale.ok) {
      // mesmo grupo (voucher), vale errado: passou Nutricash e o ERP diz Alelo
      out.push({ ...base, tipo: 'MODALIDADE', ref: ref('MODALIDADE', idRef), valor: round(op.valor),
        detalhe: `Passou ${vale.nome} na maquininha e o ERP lançou "${erp.modalidade}".`
          + (via === 'valor+dia' ? ' (casado por valor e dia — confira a venda antes de corrigir.)' : '') });
    } else if (!op.grupo && aceitas.length && !aceitas.includes(String(erp.modId))) {
      out.push({ ...base, tipo: 'MODALIDADE', ref: ref('MODALIDADE', idRef), valor: round(op.valor),
        detalhe: `Venda paga por ${operadora}, mas no ERP está em "${erp.modalidade}".` });
    }
    // 2) parcelamento
    if (op.parcelas && erp.parcelas && op.parcelas !== erp.parcelas) {
      out.push({ ...base, tipo: 'PARCELAMENTO', ref: ref('PARCELAMENTO', idRef), valor: round(op.valor),
        detalhe: `ERP: ${erp.parcelas}x · operadora: ${op.parcelas}x.` });
    }
    // 3) valor (soma das parcelas do ERP × venda da operadora)
    const dif = round(erp.valor - op.valor);
    if (Math.abs(dif) > TOL_VALOR) {
      out.push({ ...base, tipo: 'VALOR', ref: ref('VALOR', idRef), valor: Math.abs(dif),
        detalhe: `ERP R$ ${erp.valor.toFixed(2)} × operadora R$ ${round(op.valor).toFixed(2)} (${dif > 0 ? 'sobra' : 'falta'} R$ ${Math.abs(dif).toFixed(2)}).` });
    }
    // 4) taxa (opcional: só quando as duas pontas informam e a Tesouraria pediu p/ conferir)
    if (conferirTaxa && op.taxa > 0 && erp.taxa > 0 && Math.abs(op.taxa - erp.taxa) > TOL_TAXA) {
      out.push({ ...base, tipo: 'TAXA', ref: ref('TAXA', idRef), valor: round(op.valor * Math.abs(op.taxa - erp.taxa) / 100),
        detalhe: `ERP ${erp.taxa.toFixed(2)}% × operadora ${op.taxa.toFixed(2)}%.` });
    }
  }
  for (const l of soOperadora) {
    out.push({ origem, operadora, tipo: 'SO_OPERADORA', ref: ref('SO_OPERADORA', l.id != null ? l.id : l.nsu + l.data),
      loja: nomeLoja(l.uni), uni: l.uni, data: l.data, hora: l.hora, nsu: l.nsu, autorizacao: l.autorizacao,
      bandeira: l.bandeira, grupoOperadora: l.grupo, tipoOperadora: l.tipoOperadora, cliente: l.cliente,
      operador: '', modalidadeErp: '—', valorOperadora: round(l.valor), valorErp: 0, valor: round(l.valor),
      parcelasOperadora: l.parcelas, parcelasErp: 0, taxaOperadora: l.taxa, taxaErp: 0, idOp: l.id || null,
      detalhe: `${operadora} registrou a venda e o ERP não tem título correspondente.` });
  }
  // SO_ERP só faz sentido dentro do ESCOPO da operadora do lote: um relatório do Le Card não
  // pode acusar "não pagou" um título de débito da Rede, nem um dia que ninguém importou.
  for (const t of soErp) {
    if (conciliarMod(t.modId) === false) continue;
    if (!aceitas.length || !aceitas.includes(String(t.modId))) continue;
    if (cobrado && !cobrado(t)) continue;
    out.push({ origem, operadora, tipo: 'SO_ERP', ref: ref('SO_ERP', t.ids[0]),
      loja: nomeLoja(t.uni), uni: t.uni, data: t.data, hora: null, nsu: t.nsu, autorizacao: t.aut,
      bandeira: '', grupoOperadora: null, tipoOperadora: '', cliente: '', operador: t.operador,
      modalidadeErp: t.modalidade, modalidadeId: t.modId, crIds: t.ids, statusConc: t.statusConc,
      valorErp: t.valor, valorOperadora: 0, valor: t.valor, parcelasErp: t.parcelas, parcelasOperadora: 0,
      taxaErp: t.taxa, taxaOperadora: 0,
      detalhe: `O ERP tem o título ("${t.modalidade}") e não achei o pagamento no relatório de ${operadora}.` });
  }
  return out;
}

// ── Tratativas (a decisão humana sobre cada divergência) ───────────────────
function tratativasMapa(empresaId) {
  return new Map(db.prepare('SELECT ref, status, obs, atualizado_em FROM conc_tratativa WHERE empresa_id=?')
    .all(empresaId).map(r => [r.ref, r]));
}
function marcarTratativa(empresaId, { ref, tipo, status, obs, valor, lojaId, operador, usuarioId, refPar }) {
  db.prepare(`INSERT INTO conc_tratativa (empresa_id, ref, tipo, status, valor, loja_id, operador, obs, usuario_id, ref_par, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(empresa_id, ref) DO UPDATE SET status=excluded.status, obs=excluded.obs, loja_id=excluded.loja_id,
      ref_par=excluded.ref_par, usuario_id=excluded.usuario_id, atualizado_em=datetime('now')`)
    .run(empresaId, ref, tipo || '', status || 'aberta', round(valor), lojaId || '', operador || '', obs || '', String(usuarioId || ''), refPar || null);
  return { ok: true };
}

// Remaneja uma transação "Operadora pagou, ERP não tem" (SO_OPERADORA) para a loja onde a venda
// realmente foi lançada: marca as DUAS pontas como 'remanejada' (some da Loja origem E da Loja
// destino, que estava como "ERP tem, operadora não pagou"). refPar = a SO_ERP escolhida (opcional).
function remanejarLoja(empresaId, { ref, tipo, valor, lojaId, lojaNome, refPar, refParValor, obs, usuarioId }) {
  if (!ref) throw new Error('Transação de origem não informada.');
  if (!lojaId && !refPar) throw new Error('Escolha a loja de destino ou a venda correspondente.');
  const destino = lojaNome ? ` p/ ${lojaNome}` : '';
  marcarTratativa(empresaId, { ref, tipo: tipo || 'SO_OPERADORA', status: 'remanejada', valor,
    lojaId: lojaId || '', usuarioId, refPar: refPar || null,
    obs: `Remanejada${destino}${refPar ? ' (casada com a venda da outra loja)' : ''}.${obs ? ' ' + obs : ''}` });
  if (refPar) {
    marcarTratativa(empresaId, { ref: refPar, tipo: 'SO_ERP', status: 'remanejada', valor: refParValor != null ? refParValor : valor,
      lojaId: '', usuarioId, refPar: ref,
      obs: `Conciliada com a transação da outra loja (maquininha em loja diferente).${obs ? ' ' + obs : ''}` });
  }
  return { ok: true };
}

// ── Fonte A: os arquivos que o próprio ERP já importa (sem upload) ─────────
// Cobre as credenciadoras com EDI ligado (hoje Rede, Brasilcard/Bolt, Brasil Convênios).
async function edi(empresaId, { ini, fim, lojaId, conferirTaxa, grupo } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  // Duas coisas aqui:
  // 1) o arquivo vem quebrado por parcela → soma as parcelas da mesma transação (venda inteira);
  // 2) a MESMA venda aparece em mais de um arquivo (o de vendas e o de liquidação) → o DISTINCT ON
  //    fica com um lote só, senão o valor dobraria e tudo viraria "valor diferente".
  const rows = await erpQuery(`
    WITH por_lote AS (
      SELECT i.unidadenegocioid uni, i.numerotransacao nsu, i.totalparcela,
             i.datahoratransacao::date d, i.conciliacaocartaoid lote,
             MIN(i.id) id, MIN(i.cartaoreceberid) cartaoreceberid,
             to_char(MIN(i.datahoratransacao), 'YYYY-MM-DD') data,
             to_char(MIN(i.datahoratransacao), 'HH24:MI:SS') hora,
             SUM(i.valor)::float8 valor, MAX(i.taxa)::float8 taxa, MIN(i.bandeira) bandeira,
             COALESCE(MIN(co.nome), 'operadora') operadora, MIN(t.descricao) tipo_op,
             CASE WHEN MIN(t.codigoagrupamentobaixa) LIKE 'D_bito' THEN 'DEBITO'
                  WHEN MIN(t.codigoagrupamentobaixa) LIKE 'Cr_dito' AND MAX(i.totalparcela) > 1 THEN 'PARCELADO'
                  WHEN MIN(t.codigoagrupamentobaixa) LIKE 'Cr_dito' THEN 'CREDITO'
                  WHEN MIN(t.codigoagrupamentobaixa) = 'Voucher' THEN 'VOUCHER'
                  WHEN MIN(t.codigoagrupamentobaixa) = 'Pix' THEN 'PIX'
                  WHEN MIN(t.codigoagrupamentobaixa) LIKE 'Pr_-pago' THEN 'PREPAGO'
                  WHEN MIN(t.codigoagrupamentobaixa) LIKE 'Credi_rio' THEN 'CREDIARIO' ELSE 'OUTRO' END grupo
        FROM conciliacaocartaoitem i
        JOIN conciliacaocartao cc ON cc.id = i.conciliacaocartaoid
        LEFT JOIN conciliacaocartaooperadora co ON co.id = cc.conciliacaocartaooperadoraid
        LEFT JOIN conciliacaocartaotipoautorizacao t ON t.id = i.conciliacaocartaotipoautorizacaoid
       WHERE i.unidadenegocioid = ANY($1::bigint[])
         AND i.datahoratransacao >= $2::date AND i.datahoratransacao < ($3::date + 1)
       GROUP BY 1,2,3,4,5
      HAVING SUM(i.valor) > 0                       -- exclui ajuste/chargeback (valor negativo)
    )
    SELECT DISTINCT ON (uni, nsu, totalparcela, d) *
      FROM por_lote ORDER BY uni, nsu, totalparcela, d, lote`, [unis, ini, fim]);
  const linhas = rows.map(r => ({
    id: 'edi' + r.id, uni: Number(r.uni), data: r.data, hora: r.hora,
    nsu: String(r.nsu || '').trim(), autorizacao: '',
    valor: round(r.valor), valorLiquido: 0, taxa: Number(r.taxa) || 0, parcelas: Number(r.totalparcela) || 1,
    grupo: r.grupo, bandeira: (r.bandeira || '').trim(), tipoOperadora: (r.tipo_op || '').trim(),
    cliente: '', operadora: (r.operadora || '').trim(), crId: r.cartaoreceberid ? Number(r.cartaoreceberid) : null,
  }));
  const resultado = await montarResultado(empresaId, linhas, { unis, ini, fim, origem: 'edi', operadora: 'ERP (arquivos já importados)', conferirTaxa, grupo });

  // dias com venda de cartão no ERP mas SEM nenhum dado de conciliação recebido ainda (o EDI da
  // credenciadora não chegou pro ERP) — pra não confundir com divergência de verdade: aqui não é
  // "a operadora não pagou", é "ainda não dá pra saber".
  const diasComVenda = new Set((await erpQuery(`
    SELECT DISTINCT cr.dataemissao::date::text data FROM cartaoreceber cr
     WHERE cr.unidadenegocioid = ANY($1::bigint[])
       AND cr.dataemissao >= $2::date AND cr.dataemissao < ($3::date + 1)
       AND NOT EXISTS (SELECT 1 FROM correcaocartaoreceberincorreto ci WHERE ci.cartaoreceberid = cr.id)`,
    [unis, ini, fim])).map(r => r.data));
  const diasComDado = new Set(linhas.map(l => l.data));
  const diasSemDado = [...diasComVenda].filter(d => !diasComDado.has(d)).sort();
  return { ...resultado, diasSemRelatorio: diasSemDado };
}

// ── Vendas do ERP sem NENHUM cruzamento de relatório (nem manual, nem EDI automático) ──────
// Não fica restrito a uma lista de operadoras: varre TODA venda de cartão do ERP no período e
// tenta casar contra os DOIS lados que existem — o relatório importado manualmente (conc_item,
// de qualquer operadora) e o EDI que o próprio ERP já recebe (conciliacaocartaoitem, Rede/Brasil
// Card). O que sobrar sem casar em nenhum dos dois é pendente — pode ser Le Card, Bracov, uma
// bandeira nova que a loja passou a aceitar, não importa: se não tem NENHUM cruzamento de valor,
// ainda não dá pra saber se está certo. Não é erro — é "falta conferir".
function palpiteOperadora(modalidadeNome) {
  for (const [op, re] of Object.entries(PALPITE_OPERADORA)) if (re.test(modalidadeNome)) return op;
  return null;
}

async function pendentesPorOperadora(empresaId, { ini, fim, lojaId, grupo } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const dp = await depara(empresaId);
  const conciliarPor = new Map(dp.map(m => [m.id, m.conciliar]));
  const grupoPor = new Map(dp.map(m => [m.id, m.grupo]));
  const grupoDe = id => grupoPor.get(String(id));

  const titulos = await titulosErp(unis, ini, fim, null);   // toda venda de cartão do período, sem restringir a dias já importados

  // lado A: já cruzou por relatório importado manualmente (qualquer operadora) — usa o mesmo
  // motor de casamento (NSU → cauda → autorização → valor+dia) do resto do sistema.
  const itensManual = db.prepare(`SELECT * FROM conc_item WHERE empresa_id=? AND data BETWEEN ? AND ?`)
    .all(empresaId, ini, fim).filter(i => unis.includes(Number(i.uni_erp)));
  const linhasManual = itensManual.map(i => ({
    id: 'ext' + i.id, uni: Number(i.uni_erp), data: i.data, hora: i.hora, nsu: i.nsu, autorizacao: i.autorizacao,
    valor: i.valor, valorLiquido: i.valor_liquido, taxa: i.taxa, parcelas: i.parcelas, grupo: i.grupo,
    bandeira: i.bandeira, tipoOperadora: i.tipo_operadora, cliente: i.cliente, operadora: i.operadora,
  }));
  if (linhasManual.length) casar(linhasManual, titulos, grupoDe);   // marca t.casado=true nos títulos que bateram

  // lado B: já cruzou pelo EDI automático que o próprio ERP recebe (Rede, Brasil Card)
  const cobertosEdi = new Set((await erpQuery(`
      SELECT DISTINCT i.cartaoreceberid id FROM conciliacaocartaoitem i
       WHERE i.unidadenegocioid = ANY($1::bigint[])
         AND i.datahoratransacao >= $2::date AND i.datahoratransacao < ($3::date + 1)
         AND i.cartaoreceberid IS NOT NULL`, [unis, ini, fim])).map(r => Number(r.id)));

  const lojas = lojasEmpresa(empresaId);
  const nomeLoja = uni => (lojas.find(l => Number(l.erp_unidadenegocio_id) === Number(uni)) || {}).nome || ('unidade ' + uni);

  // Pix normalmente é do banco, não da maquininha — não é "cartão" pra fins desta tela. Só entra
  // se a loja marcou explicitamente aquela modalidade como de uma operadora (Ajustes ▸ Operadoras),
  // sinal de que passa pela maquininha de verdade.
  const modsDeOperadora = new Set(db.prepare('SELECT DISTINCT modalidade_id FROM conc_operadora_modalidade WHERE empresa_id=?')
    .all(empresaId).map(r => String(r.modalidade_id)));

  const pendentes = [];
  for (const t of titulos) {
    if (conciliarPor.get(String(t.modId)) === false) continue;             // modalidade marcada p/ não conciliar
    if (grupo && grupoDe(t.modId) !== grupo) continue;                     // filtro por forma de pagamento
    if (grupoDe(t.modId) === 'PIX' && !modsDeOperadora.has(String(t.modId))) continue;   // Pix do banco, não da maquininha
    if (t.casado) continue;                                                // já cruzou com relatório manual
    if (t.ids.some(id => cobertosEdi.has(id))) continue;                   // já cruzou com o EDI automático
    const operadora = palpiteOperadora(t.modalidade) || t.modalidade;      // nome conhecido, ou a própria modalidade se for bandeira nova
    pendentes.push({ operadora, loja: nomeLoja(t.uni), uni: t.uni, data: t.data, hora: t.hora,
      vencimento: t.vencimento, conferidoErp: t.conferido, modalidade: t.modalidade, valor: t.valor,
      nsu: t.nsu, autorizacao: t.aut, operador: t.operador, crIds: t.ids });
  }
  pendentes.sort((a, b) => a.operadora.localeCompare(b.operadora) || String(b.data).localeCompare(String(a.data)));

  const porOperadora = new Map();
  for (const p of pendentes) {
    const a = porOperadora.get(p.operadora) || { operadora: p.operadora, n: 0, valor: 0 };
    a.n++; a.valor = round(a.valor + p.valor); porOperadora.set(p.operadora, a);
  }
  return { ok: true, pendentes, resumo: { total: pendentes.length, valor: round(pendentes.reduce((s, p) => s + p.valor, 0)),
    porOperadora: [...porOperadora.values()].sort((a, b) => b.valor - a.valor) } };
}

// ── Modalidades do ERP sem NENHUMA operadora conhecida ──────────────────────
// Diferente do "aguardando relatório" (que é sobre CRUZAMENTO de valor) — isto é sobre CADASTRO:
// venda de cartão cuja modalidade não bate em nenhum palpite (PALPITE_OPERADORA) nem tem de-para
// manual salvo (conc_operadora_modalidade). O sistema nem sabe a quem perguntar se pagou — é
// bandeira/credenciadora nova que ainda não foi mapeada em Ajustes ▸ Operadoras.
async function semOperadoraIdentificada(empresaId, { ini, fim, lojaId, grupo } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const dp = await depara(empresaId);
  const conciliarPor = new Map(dp.map(m => [m.id, m.conciliar]));
  const grupoPor = new Map(dp.map(m => [m.id, m.grupo]));

  const modsMapeadas = new Set(db.prepare('SELECT DISTINCT modalidade_id FROM conc_operadora_modalidade WHERE empresa_id=?')
    .all(empresaId).map(r => String(r.modalidade_id)));

  const titulos = await titulosErp(unis, ini, fim, null);
  const lojas = lojasEmpresa(empresaId);
  const nomeLoja = uni => (lojas.find(l => Number(l.erp_unidadenegocio_id) === Number(uni)) || {}).nome || ('unidade ' + uni);

  const semOperadora = [];
  for (const t of titulos) {
    if (conciliarPor.get(String(t.modId)) === false) continue;              // modalidade marcada p/ não conciliar
    if (grupo && grupoPor.get(String(t.modId)) !== grupo) continue;         // filtro por forma de pagamento
    if (grupoPor.get(String(t.modId)) === 'PIX') continue;                  // Pix do banco não é operadora de cartão
    if (palpiteOperadora(t.modalidade)) continue;                           // reconhecida por palpite
    if (modsMapeadas.has(String(t.modId))) continue;                        // já mapeada manualmente
    semOperadora.push({ loja: nomeLoja(t.uni), uni: t.uni, data: t.data, hora: t.hora,
      modalidade: t.modalidade, modalidadeId: t.modId, valor: t.valor, nsu: t.nsu, autorizacao: t.aut,
      operador: t.operador, crIds: t.ids });
  }
  semOperadora.sort((a, b) => a.modalidade.localeCompare(b.modalidade) || String(b.data).localeCompare(String(a.data)));

  const porModalidade = new Map();
  for (const p of semOperadora) {
    const a = porModalidade.get(p.modalidade) || { modalidade: p.modalidade, modalidadeId: p.modalidadeId, n: 0, valor: 0 };
    a.n++; a.valor = round(a.valor + p.valor); porModalidade.set(p.modalidade, a);
  }
  return { ok: true, semOperadora, resumo: { total: semOperadora.length, valor: round(semOperadora.reduce((s, p) => s + p.valor, 0)),
    porModalidade: [...porModalidade.values()].sort((a, b) => b.valor - a.valor) } };
}

// texto livre → chave comparável (minúsculo, sem acento, espaços normalizados)
const chaveTexto = v => String(v || '').trim().toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/\s+/g, ' ');

function lojaTextoMapa(empresaId, operadora) {
  const rows = db.prepare('SELECT texto, uni_erp FROM conc_loja_texto WHERE empresa_id=? AND operadora=?').all(empresaId, operadora);
  return new Map(rows.map(r => [r.texto, Number(r.uni_erp)]));
}
function lojasTexto(empresaId) {
  return db.prepare('SELECT * FROM conc_loja_texto WHERE empresa_id=? ORDER BY operadora, texto_original').all(empresaId);
}
function salvarLojaTexto(empresaId, { operadora, texto, lojaId }) {
  const uni = unisEmpresa(empresaId, lojaId)[0] || null;
  if (!uni) return { ok: false, erro: 'Loja inválida.' };
  db.prepare(`INSERT INTO conc_loja_texto (empresa_id, operadora, texto, texto_original, uni_erp, loja_id, atualizado_em)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, operadora, texto) DO UPDATE SET
      texto_original=excluded.texto_original, uni_erp=excluded.uni_erp, loja_id=excluded.loja_id, atualizado_em=datetime('now')`)
    .run(empresaId, operadora, chaveTexto(texto), texto, uni, lojaId);
  return { ok: true };
}

// ── Fonte B: relatório baixado da operadora ────────────────────────────────
async function importar(empresaId, { conteudoBase64, nomeArquivo, lojaId, usuarioId }) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const buf = Buffer.from(String(conteudoBase64 || '').replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length) return { ok: false, erro: 'Arquivo vazio.' };
  const lido = buf.slice(0, 4).toString() === '%PDF'
    ? await lerUze(buf, { nomeArquivo })
    : lerArquivo(buf, { nomeArquivo });
  if (!lido.ok) return lido;
  if (!lido.linhas.length) return { ok: false, erro: 'Nenhuma transação aprovada no arquivo.' };

  // loja: pelo CNPJ do arquivo (Rede/Bracov), ou pelo nome da loja que o PRÓPRIO arquivo traz por
  // linha (Le Card mistura várias lojas num arquivo só — usar a loja do upload pra tudo botava
  // venda de uma loja na conta de outra, e quebrava o casamento por NSU/valor+dia). Só cai na loja
  // escolhida no upload quando o arquivo não diz, de jeito nenhum, a qual loja a linha pertence.
  const unisCad = await erpQuery('SELECT id, cnpj, nome FROM unidadenegocio WHERE cnpj IS NOT NULL');
  const porCnpj = new Map(unisCad.map(u => [String(u.cnpj).replace(/\D/g, ''), Number(u.id)]));
  const unisDaEmpresa = new Set(unisEmpresa(empresaId, null));
  // Só existe "loja escolhida" quando o usuário ESCOLHEU uma no upload. lojaId vazio significa
  // "identificar pelo arquivo" — não pode virar "a primeira loja da lista sem filtro nenhum"
  // (unisEmpresa(empresaId,'') devolve TODAS as lojas; pegar a [0] silenciosamente jogava toda
  // linha sem CNPJ pra loja errada — foi o que corrompeu o de-para de estabelecimento da Rede).
  const uniEscolhida = lojaId ? (unisEmpresa(empresaId, lojaId)[0] || null) : null;
  const porTexto = lojaTextoMapa(empresaId, lido.operadora);
  const porEstab = new Map(require('./repasseCartao').estabelecimentos(empresaId)
    .filter(e => e.operadora === lido.operadora).map(e => [e.estabelecimento, Number(e.uni_erp)]));
  const naoMapeadas = new Map();   // texto original → quantas linhas
  const semLoja = [];
  const linhas = lido.linhas.map(l => {
    if (l.cnpj && porCnpj.has(l.cnpj)) return { ...l, uni: porCnpj.get(l.cnpj) };
    if (l.lojaArquivo) {
      const uni = porTexto.get(chaveTexto(l.lojaArquivo));
      if (uni) return { ...l, uni };
      naoMapeadas.set(l.lojaArquivo, (naoMapeadas.get(l.lojaArquivo) || 0) + 1);
      semLoja.push(l); return null;
    }
    if (l.estabelecimento && porEstab.has(l.estabelecimento)) return { ...l, uni: porEstab.get(l.estabelecimento) };
    const uni = uniEscolhida;
    if (!uni || !unisDaEmpresa.has(uni)) { semLoja.push(l); return null; }
    return { ...l, uni };
  }).filter(Boolean);
  if (!linhas.length && !naoMapeadas.size) return { ok: false, erro: 'Não consegui identificar a loja das transações. Escolha a loja no upload (o arquivo não traz o CNPJ) ou confira se o CNPJ do arquivo é de uma loja cadastrada.' };
  if (!linhas.length) return { ok: false, erro: 'Faltou mapear a loja de todas as linhas — veja abaixo.',
    lojasParaMapear: [...naoMapeadas.entries()].map(([texto, n]) => ({ operadora: lido.operadora, texto, n })) };

  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  const datas = linhas.map(l => l.data).sort();
  const valorTotal = round(linhas.reduce((s, l) => s + l.valor, 0));
  const jaTem = db.prepare('SELECT id FROM conc_arquivo WHERE empresa_id=? AND hash=?').get(empresaId, hash);
  let arquivoId;
  const tx = db.transaction(() => {
    if (jaTem) { arquivoId = jaTem.id; db.prepare('DELETE FROM conc_item WHERE arquivo_id=?').run(arquivoId);
      db.prepare('UPDATE conc_arquivo SET linhas=?, valor_total=?, importado_em=datetime(\'now\') WHERE id=?').run(linhas.length, valorTotal, arquivoId);
    } else {
      arquivoId = db.prepare(`INSERT INTO conc_arquivo (empresa_id, operadora, layout, loja_id, nome_arquivo, hash, data_ini, data_fim, linhas, valor_total, usuario_id, importado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
        .run(empresaId, lido.operadora, lido.layout, String(lojaId || ''), nomeArquivo || '', hash, datas[0], datas[datas.length - 1], linhas.length, valorTotal, String(usuarioId || '')).lastInsertRowid;
    }
    const ins = db.prepare(`INSERT INTO conc_item (arquivo_id, empresa_id, operadora, uni_erp, loja_id, data, hora, nsu, autorizacao,
      cartao, cliente, bandeira, grupo, tipo_operadora, parcelas, valor, valor_liquido, taxa, estabelecimento, prazo_texto, loja_arquivo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    linhas.forEach(l => ins.run(arquivoId, empresaId, lido.operadora, l.uni, String(lojaId || ''), l.data, l.hora || '',
      l.nsu || '', l.autorizacao || '', l.cartao || '', l.cliente || '', l.bandeira || '', l.grupo || '',
      l.tipoOperadora || '', l.parcelas, round(l.valor), round(l.valorLiquido), Number(l.taxa) || 0,
      l.estabelecimento || '', l.prazo || '', l.lojaArquivo || ''));
  });
  tx();

  // o relatório de vendas traz estabelecimento + CNPJ: é daqui que sai, sozinho, o de-para que
  // permite abrir o repasse por filial depois (o relatório de recebimentos só traz o número).
  try {
    const lojasEmp = lojasEmpresa(empresaId);
    require('./repasseCartao').aprenderEstabelecimentos(empresaId, lido.operadora, linhas,
      new Map(lojasEmp.map(l => [Number(l.erp_unidadenegocio_id), l.id])));
  } catch (e) { /* o de-para é um bônus do import; não pode derrubar a importação */ }

  const avisos = [...(lido.avisos || [])];
  const lojasParaMapear = [...naoMapeadas.entries()].map(([texto, n]) => ({ operadora: lido.operadora, texto, n }));
  if (lojasParaMapear.length) avisos.push(`${semLoja.length} linha(s) de loja(s) ainda não mapeada(s) ficaram de fora — mapeie abaixo e suba o arquivo de novo.`);
  else if (semLoja.length) avisos.push(`${semLoja.length} linha(s) sem loja identificada foram ignoradas.`);
  if (jaTem) avisos.push('Este arquivo já tinha sido importado — reprocessei por cima (sem duplicar).');
  const conf = await confrontarArquivo(empresaId, arquivoId);
  return { ok: true, arquivoId, operadora: lido.operadora, layout: lido.layout, linhas: linhas.length,
    valorTotal, periodo: { ini: datas[0], fim: datas[datas.length - 1] }, lojasParaMapear,
    ...conf, avisos: [...avisos, ...(conf.avisos || [])] };
}

// Confronta UM lote importado (ou todos os lotes de um período) contra o ERP.
async function confrontarArquivo(empresaId, arquivoId, { conferirTaxa } = {}) {
  const arq = db.prepare('SELECT * FROM conc_arquivo WHERE id=? AND empresa_id=?').get(arquivoId, empresaId);
  if (!arq) return { ok: false, erro: 'Lote não encontrado.' };
  const itens = db.prepare('SELECT * FROM conc_item WHERE arquivo_id=?').all(arquivoId);
  const linhas = itens.map(i => ({
    id: 'ext' + i.id, uni: Number(i.uni_erp), data: i.data, hora: i.hora, nsu: i.nsu, autorizacao: i.autorizacao,
    valor: i.valor, valorLiquido: i.valor_liquido, taxa: i.taxa, parcelas: i.parcelas, grupo: i.grupo,
    bandeira: i.bandeira, tipoOperadora: i.tipo_operadora, cliente: i.cliente, operadora: i.operadora,
  }));
  const unis = [...new Set(linhas.map(l => l.uni))];
  return montarResultado(empresaId, linhas, { unis, ini: arq.data_ini, fim: arq.data_fim, origem: 'ext',
    operadora: arq.operadora, arquivo: arq, conferirTaxa });
}

// Confronta tudo que foi importado num período (todas as operadoras).
async function confrontarPeriodo(empresaId, { ini, fim, lojaId, operadora, conferirTaxa, grupo } = {}) {
  const unisFiltro = unisEmpresa(empresaId, lojaId);
  const filtros = ['empresa_id=?', 'data >= ?', 'data <= ?'];
  const params = [empresaId, ini, fim];
  if (operadora) { filtros.push('operadora=?'); params.push(operadora); }
  const itens = db.prepare(`SELECT * FROM conc_item WHERE ${filtros.join(' AND ')}`).all(...params)
    .filter(i => unisFiltro.includes(Number(i.uni_erp)));
  if (!itens.length) return { ok: true, vazio: true, divergencias: [], resumo: resumoVazio(), operadoras: [] };
  const linhas = itens.map(i => ({
    id: 'ext' + i.id, uni: Number(i.uni_erp), data: i.data, hora: i.hora, nsu: i.nsu, autorizacao: i.autorizacao,
    valor: i.valor, valorLiquido: i.valor_liquido, taxa: i.taxa, parcelas: i.parcelas, grupo: i.grupo,
    bandeira: i.bandeira, tipoOperadora: i.tipo_operadora, cliente: i.cliente, operadora: i.operadora,
  }));
  const unis = [...new Set(linhas.map(l => l.uni))];
  return montarResultado(empresaId, linhas, { unis, ini, fim, origem: 'ext',
    operadora: operadora || 'relatórios importados', conferirTaxa, grupo });
}

// ── Núcleo: casa, classifica, aplica tratativas e resume ───────────────────
function resumoVazio() {
  return { linhasOperadora: 0, titulosErp: 0, casados: 0, divergencias: 0, valorDivergente: 0, porTipo: {}, porLoja: [], porOperador: [] };
}

async function montarResultado(empresaId, linhas, { unis, ini, fim, origem, operadora, arquivo, conferirTaxa, grupo }) {
  const [dp, lojas] = [await depara(empresaId), lojasEmpresa(empresaId)];
  const grupoPor = new Map(dp.map(m => [m.id, m.grupo]));
  const conciliarPor = new Map(dp.map(m => [m.id, m.conciliar]));
  const nomePorUni = new Map(lojas.map(l => [Number(l.erp_unidadenegocio_id), l.nome]));
  const lojaIdPorUni = new Map(lojas.map(l => [Number(l.erp_unidadenegocio_id), l.id]));
  const nomeLoja = uni => nomePorUni.get(Number(uni)) || ('unidade ' + uni);

  const grupoDe = id => grupoPor.get(String(id));
  // O ERP só entra na conta nos DIAS que têm relatório — senão todo título de um dia sem
  // arquivo viraria "a operadora não pagou". É o que mantém o painel do mês honesto.
  const dias = [...new Set(linhas.map(l => l.data))].sort();
  const titulos = await titulosErp(unis, ini, fim, dias);
  const casamento = casar(linhas, titulos, grupoDe);

  // operadoras presentes (o arquivo pode misturar; o EDI mistura sempre).
  // "aceitas" = modalidades do ERP que pertencem a essas operadoras — é o escopo do confronto.
  const operadoras = [...new Set(linhas.map(l => l.operadora).filter(Boolean))];
  const aceitas = new Set();
  const escopoOp = new Map();     // operadora → { mods:Set, cobertura:Set('uni|data') }
  for (const op of operadoras) {
    const mods = (await deparaOperadora(empresaId, op)).map(String);
    mods.forEach(id => aceitas.add(id));
    escopoOp.set(op, { mods: new Set(mods), cobertura: new Set() });
  }
  for (const l of linhas) { const e = escopoOp.get(l.operadora); if (e) e.cobertura.add(l.uni + '|' + l.data); }
  const pertence = (op, modId) => { const e = escopoOp.get(op); return !!e && e.mods.has(String(modId)); };

  // A credenciadora captura vários vales e chama todos de "voucher" — quem distingue é a BANDEIRA
  // (Alelo, Nutricash, Lecard). Sem isto, marcar 11-ALELO e passar Nutricash passaria batido,
  // porque os dois são voucher. Aqui a bandeira vira a forma esperada no ERP.
  const APELIDO = { lecard: 'Le Card', 'le card': 'Le Card', alelo: 'Alelo', nutricash: 'Nutricash',
    sodexo: 'Sodexo', ticket: 'Ticket', vr: 'VR', 'brasil card': 'Brasil Card', bolt: 'Brasil Card' };
  const bandeiras = [...new Set(linhas.map(l => String(l.bandeira || '').trim()).filter(Boolean))];
  const modsPorBandeira = new Map();
  for (const b of bandeiras) {
    const nome = APELIDO[b.toLowerCase()];
    if (!nome) continue;
    const ids = (await deparaOperadora(empresaId, nome)).map(String);
    if (ids.length) modsPorBandeira.set(b.toLowerCase(), { nome, ids: new Set(ids) });
  }
  const daBandeira = (bandeira, modId) => {
    const e = modsPorBandeira.get(String(bandeira || '').toLowerCase());
    if (!e) return null;                                  // bandeira sem forma própria no ERP
    return { ok: e.ids.has(String(modId)), nome: e.nome };
  };
  // um título só pode ser cobrado se ALGUMA operadora do período cobre aquela loja+dia E aquela forma
  const cobrado = t => [...escopoOp.values()].some(e => e.mods.has(String(t.modId)) && e.cobertura.has(t.uni + '|' + t.data));

  const divs = classificar(casamento, {
    grupoDe,
    conciliarMod: id => conciliarPor.get(String(id)) !== false,
    aceitas: [...aceitas], cobrado, pertence, daBandeira,
    operadora, nomeLoja, origem, conferirTaxa: !!conferirTaxa,
  });

  const trat = tratativasMapa(empresaId);
  let comTrat = divs.map(d => {
    const t = trat.get(d.ref);
    return { ...d, lojaId: lojaIdPorUni.get(Number(d.uni)) || '', status: t ? t.status : 'aberta', obs: t ? t.obs : '',
      rotulo: TIPOS[d.tipo].rotulo, cor: TIPOS[d.tipo].cor, peso: TIPOS[d.tipo].peso };
  }).sort((a, b) => a.peso - b.peso || b.valor - a.valor);
  // filtro por forma de pagamento (débito, crédito, pix...) — pelo lado do ERP, que é a referência
  if (grupo) comTrat = comTrat.filter(d => grupoDe(d.modalidadeId) === grupo);

  const abertas = comTrat.filter(d => d.status === 'aberta' || d.status === 'procede');
  const porTipo = {};
  for (const d of comTrat) {
    const t = porTipo[d.tipo] || (porTipo[d.tipo] = { tipo: d.tipo, rotulo: TIPOS[d.tipo].rotulo, cor: TIPOS[d.tipo].cor, n: 0, valor: 0, abertas: 0 });
    t.n++; t.valor = round(t.valor + d.valor); if (d.status === 'aberta' || d.status === 'procede') t.abertas++;
  }
  const agrupa = (chave, filtro) => {
    const m = new Map();
    for (const d of comTrat.filter(filtro || (() => true))) {
      const k = d[chave] || '—';
      const a = m.get(k) || { nome: k, n: 0, valor: 0 };
      a.n++; a.valor = round(a.valor + d.valor); m.set(k, a);
    }
    return [...m.values()].sort((x, y) => y.n - x.n);
  };
  // filtro por forma de pagamento nos números do resumo também — senão o card mostra "total do
  // relatório" incluindo Pix/voucher passado na maquininha mesmo quando o usuário filtrou só Débito.
  const linhasResumo = grupo ? linhas.filter(l => l.grupo === grupo) : linhas;
  const paresResumo = grupo ? casamento.pares.filter(p => grupoDe(p.erp.modId) === grupo) : casamento.pares;
  const titulosResumo = grupo ? titulos.filter(t => grupoDe(t.modId) === grupo) : titulos;

  // diferença de taxa do período (fica no resumo mesmo quando não vira divergência linha a linha)
  const comTaxa = paresResumo.filter(p => p.op.taxa > 0 && p.erp.taxa > 0);
  const difTaxa = round(comTaxa.reduce((s, p) => s + p.op.valor * (p.op.taxa - p.erp.taxa) / 100, 0));
  const avisos = [];
  if (!aceitas.size) avisos.push(`Nenhuma modalidade do ERP está ligada a ${operadoras.join(', ') || operadora} — sem isso não dá pra apontar "operadora não pagou". Ajuste em Ajustes ▸ Operadoras.`);

  return {
    ok: true, origem, operadora, operadoras, periodo: { ini, fim }, arquivo: arquivo || null, avisos,
    divergencias: comTrat,
    resumo: {
      linhasOperadora: linhasResumo.length, titulosErp: titulosResumo.length, casados: paresResumo.length,
      pctCasado: linhasResumo.length ? Math.round(1000 * paresResumo.length / linhasResumo.length) / 10 : 0,
      valorOperadora: round(linhasResumo.reduce((s, l) => s + l.valor, 0)),
      divergencias: comTrat.length, abertas: abertas.length,
      valorDivergente: round(abertas.reduce((s, d) => s + d.valor, 0)),
      taxa: { comparados: comTaxa.length, diferenca: difTaxa },
      porTipo: Object.values(porTipo).sort((a, b) => TIPOS[a.tipo].peso - TIPOS[b.tipo].peso),
      porLoja: agrupa('loja'),
      porDia: agrupa('data').sort((a, b) => String(a.nome).localeCompare(String(b.nome))),
      // Ranking de operadores: erro absoluto E índice (erro a cada 100 vendas). Quem vende mais
      // erra mais em número absoluto — o índice é o que mostra quem realmente precisa de treino.
      porOperador: rankingOperador(comTrat, titulosResumo),
    },
  };
}

// erros do operador × quantas vendas de cartão ele fez no período
function rankingOperador(divs, titulos, minVendas = 20) {
  const vendas = new Map();
  for (const t of titulos) if (t.operador) vendas.set(t.operador, (vendas.get(t.operador) || 0) + 1);
  const m = new Map();
  const conta = ['MODALIDADE', 'PARCELAMENTO', 'VALOR'];      // erros de digitação do operador
  for (const d of divs) {
    if (!d.operador || !conta.includes(d.tipo)) continue;
    const a = m.get(d.operador) || { nome: d.operador, n: 0, valor: 0, forma: 0, parcelas: 0, valorDif: 0, loja: d.loja };
    a.n++; a.valor = round(a.valor + d.valor);
    if (d.tipo === 'MODALIDADE') a.forma++;
    if (d.tipo === 'PARCELAMENTO') a.parcelas++;
    if (d.tipo === 'VALOR') a.valorDif++;
    m.set(d.operador, a);
  }
  return [...m.values()].map(o => {
    const v = vendas.get(o.nome) || 0;
    return { ...o, vendas: v, indice: v >= minVendas ? Math.round(1000 * o.n / v) / 10 : null };
  }).sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1) || b.n - a.n);
}

// ── Painel (BI) do período ─────────────────────────────────────────────────
// Junta as duas leituras do mesmo problema:
//   • o que ainda está errado  → confronto dos relatórios importados no período
//   • o que já foi consertado  → correções feitas no ERP (mede o retrabalho)
// É o acumulado do mês, com ranking de operadores e evolução dia a dia.
async function painel(empresaId, { ini, fim, lojaId, conferirTaxa, grupo } = {}) {
  const [conf, corr] = await Promise.all([
    confrontarPeriodo(empresaId, { ini, fim, lojaId, conferirTaxa, grupo }).catch(e => ({ ok: false, erro: e.message })),
    correcoes(empresaId, { ini, fim, lojaId }).catch(e => ({ ok: false, erro: e.message })),
  ]);
  const lotesPeriodo = db.prepare(`SELECT operadora, COUNT(*) lotes, SUM(linhas) linhas, SUM(valor_total) valor,
      MAX(importado_em) ultimo FROM conc_arquivo
     WHERE empresa_id=? AND data_fim >= ? AND data_ini <= ? GROUP BY operadora ORDER BY operadora`)
    .all(empresaId, ini, fim);
  // dias do período que ainda não têm nenhum relatório importado (o que falta alimentar)
  const cobertos = new Set(db.prepare('SELECT DISTINCT data FROM conc_item WHERE empresa_id=? AND data BETWEEN ? AND ?')
    .all(empresaId, ini, fim).map(r => r.data));
  const faltando = [];
  for (let d = new Date(ini + 'T12:00:00'); d <= new Date(fim + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!cobertos.has(iso)) faltando.push(iso);
  }
  return {
    ok: true, periodo: { ini, fim },
    confronto: conf.ok ? { resumo: conf.resumo, avisos: conf.avisos || [], vazio: !!conf.vazio } : { erro: conf.erro },
    correcoes: corr.ok ? corr : { erro: corr.erro },
    lotes: lotesPeriodo, diasSemRelatorio: faltando,
  };
}

// ── Correções que a Tesouraria já fez no ERP ───────────────────────────────
// Mede o tamanho real do problema sem depender de arquivo nenhum: cada correção é um caso em que
// alguém teve que consertar à mão a forma de pagamento (ou o parcelamento/NSU) de uma venda.
async function correcoes(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const rows = await erpQuery(`
    SELECT to_char(cc.datahora, 'YYYY-MM-DD') data, cc.valortotal::float8 valor, cc.motivo, cc.observacao,
           cri.unidadenegocioid uni, mci.nome mod_errada, mcc.nome mod_correta,
           cri.totalparcela parc_errada, cc.totalparcela parc_correta,
           COALESCE(p.nome, 'usuário ' || cc.usuarioid) quem,
           COALESCE(pv.nome, '') operador
      FROM correcaocartaoreceber cc
      JOIN correcaocartaoreceberincorreto i ON i.correcaocartaoreceberid = cc.id
      JOIN cartaoreceber cri ON cri.id = i.cartaoreceberid
      LEFT JOIN modalidadecartao mci ON mci.id = cri.modalidadecartaoid
      LEFT JOIN modalidadecartao mcc ON mcc.id = cc.modalidadecartaoid
      LEFT JOIN usuario u ON u.id = cc.usuarioid LEFT JOIN pessoa p ON p.id = u.pessoaid
      LEFT JOIN usuario uv ON uv.id = cri.usuarioid LEFT JOIN pessoa pv ON pv.id = uv.pessoaid
     WHERE cri.unidadenegocioid = ANY($1::bigint[])
       AND cc.datahora >= $2::date AND cc.datahora < ($3::date + 1)`, [unis, ini, fim]);
  const lojas = lojasEmpresa(empresaId);
  const nomeLoja = uni => (lojas.find(l => Number(l.erp_unidadenegocio_id) === Number(uni)) || {}).nome || ('unidade ' + uni);
  const agrupa = (chaveFn, filtro) => {
    const m = new Map();
    for (const r of rows.filter(filtro || (() => true))) {
      const k = chaveFn(r);
      const a = m.get(k) || { nome: k, n: 0, valor: 0 };
      a.n++; a.valor = round(a.valor + Number(r.valor)); m.set(k, a);
    }
    return [...m.values()].sort((x, y) => y.n - x.n);
  };
  const trocouForma = r => (r.mod_errada || '') !== (r.mod_correta || '');
  return {
    ok: true, periodo: { ini, fim },
    total: rows.length, valor: round(rows.reduce((s, r) => s + Number(r.valor), 0)),
    trocaDeForma: rows.filter(trocouForma).length,
    porTroca: agrupa(r => `${r.mod_errada || '—'} → ${r.mod_correta || '—'}`, trocouForma).slice(0, 20),
    porLoja: agrupa(r => nomeLoja(r.uni)),
    porOperador: agrupa(r => (r.operador || '').trim() || '—', r => trocouForma(r) && r.operador).slice(0, 20),
    porQuemCorrigiu: agrupa(r => r.quem).slice(0, 15),
    porDia: agrupa(r => r.data).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

// ── Lotes já importados (histórico) ────────────────────────────────────────
function lotes(empresaId, { limite = 60 } = {}) {
  return db.prepare(`SELECT id, operadora, layout, loja_id, nome_arquivo, data_ini, data_fim, linhas, valor_total, importado_em
    FROM conc_arquivo WHERE empresa_id=? ORDER BY id DESC LIMIT ?`).all(empresaId, limite);
}
function apagarLote(empresaId, id) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM conc_item WHERE arquivo_id=? AND empresa_id=?').run(id, empresaId);
    db.prepare('DELETE FROM conc_arquivo WHERE id=? AND empresa_id=?').run(id, empresaId);
  });
  tx();
  return { ok: true };
}

// Taxas cobradas pelas máquinas (ERP) no período, por operadora/bandeira/modalidade.
// taxa = tarifa cobrada; líquido = valor; bruto ≈ líquido + taxa; taxa efetiva = taxa/bruto.
async function taxasCobradas(empresaId, { ini, fim, lojaId } = {}) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { ok: true, linhas: [], total: {}, periodo: { ini, fim } };
  const mapLoja = {}; lojasEmpresa(empresaId).forEach(l => { if (l.erp_unidadenegocio_id != null) mapLoja[Number(l.erp_unidadenegocio_id)] = l.nome; });
  const rows = await erpQuery(`
    SELECT i.unidadenegocioid AS loja_erp,
      COALESCE(op.nome,'—') AS operadora,
      COALESCE(NULLIF(trim(i.bandeira),''),'—') AS bandeira,
      COALESCE(ta.descricao,'—') AS modalidade,
      COUNT(*) AS n,
      COALESCE(SUM(i.valor),0) AS liquido,
      COALESCE(SUM(i.taxa),0) AS taxa,
      COALESCE(SUM(i.taxaantecipacao),0) AS taxa_antecip
    FROM conciliacaocartaoitem i
    JOIN conciliacaocartao c ON c.id = i.conciliacaocartaoid
    LEFT JOIN conciliacaocartaooperadora op ON op.id = c.conciliacaocartaooperadoraid
    LEFT JOIN conciliacaocartaotipoautorizacao ta ON ta.id = i.conciliacaocartaotipoautorizacaoid
    WHERE i.unidadenegocioid = ANY($1::bigint[]) AND i.datavencimento >= $2::date AND i.datavencimento < ($3::date + interval '1 day')
    GROUP BY i.unidadenegocioid, op.nome, i.bandeira, ta.descricao
    ORDER BY taxa DESC`, [unis, ini, fim]);
  const linhas = rows.map(r => {
    const liquido = Number(r.liquido) || 0, taxa = Number(r.taxa) || 0, antecip = Number(r.taxa_antecip) || 0;
    const bruto = liquido + taxa + antecip;
    return { loja: mapLoja[Number(r.loja_erp)] || ('Unid. ' + r.loja_erp), operadora: r.operadora, bandeira: r.bandeira, modalidade: r.modalidade, n: Number(r.n) || 0, liquido, taxa, taxa_antecip: antecip, bruto,
      pct: bruto > 0 ? Math.round((taxa + antecip) / bruto * 10000) / 100 : null };
  });
  // Resumo por loja (pra ver a taxa de cada filial de relance)
  const porLojaMap = {};
  for (const l of linhas) { const k = l.loja; (porLojaMap[k] = porLojaMap[k] || { loja: k, liquido: 0, taxa: 0, taxa_antecip: 0, bruto: 0, n: 0 }); const b = porLojaMap[k]; b.liquido += l.liquido; b.taxa += l.taxa; b.taxa_antecip += l.taxa_antecip; b.bruto += l.bruto; b.n += l.n; }
  const porLoja = Object.values(porLojaMap).map(b => ({ ...b, pct: b.bruto > 0 ? Math.round((b.taxa + b.taxa_antecip) / b.bruto * 10000) / 100 : null })).sort((a, b) => b.taxa - a.taxa);
  const tot = linhas.reduce((a, l) => ({ liquido: a.liquido + l.liquido, taxa: a.taxa + l.taxa, taxa_antecip: a.taxa_antecip + l.taxa_antecip, bruto: a.bruto + l.bruto, n: a.n + l.n }), { liquido: 0, taxa: 0, taxa_antecip: 0, bruto: 0, n: 0 });
  tot.pct = tot.bruto > 0 ? Math.round((tot.taxa + tot.taxa_antecip) / tot.bruto * 10000) / 100 : null;
  return { ok: true, linhas, porLoja, total: tot, periodo: { ini, fim } };
}

// BI "o combinado está sendo cumprido?" — taxa COMBINADA (cadastro conc_taxa_contratada) × taxa
// PRATICADA (o que a operadora realmente descontou no ERP). Mostra, por operadora/bandeira/grupo,
// a diferença em pontos e quanto foi cobrado A MAIS — é o relatório pra levar à credenciadora.
async function biTaxaCombinada(empresaId, { ini, fim, lojaId } = {}) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { ok: true, linhas: [], porOperadora: [], total: {}, periodo: { ini, fim } };
  const rp = require('./repasseCartao');
  const taxas = rp.taxasContratadas(empresaId);
  const lojas = lojasEmpresa(empresaId);
  const mapLojaNome = {}; const mapLojaApp = {};
  lojas.forEach(l => { if (l.erp_unidadenegocio_id != null) { mapLojaNome[Number(l.erp_unidadenegocio_id)] = l.nome; mapLojaApp[Number(l.erp_unidadenegocio_id)] = l.id; } });
  const rows = await erpQuery(`
    SELECT i.unidadenegocioid AS loja_erp,
      COALESCE(op.nome,'—') AS operadora,
      COALESCE(NULLIF(trim(i.bandeira),''),'—') AS bandeira,
      COALESCE(ta.descricao,'—') AS modalidade,
      COALESCE(NULLIF(i.totalparcela,0),1) AS parcelas,
      COUNT(*) AS n, COALESCE(SUM(i.valor),0) AS liquido,
      COALESCE(SUM(i.taxa),0) AS taxa, COALESCE(SUM(i.taxaantecipacao),0) AS taxa_antecip
    FROM conciliacaocartaoitem i
    JOIN conciliacaocartao c ON c.id = i.conciliacaocartaoid
    LEFT JOIN conciliacaocartaooperadora op ON op.id = c.conciliacaocartaooperadoraid
    LEFT JOIN conciliacaocartaotipoautorizacao ta ON ta.id = i.conciliacaocartaotipoautorizacaoid
    WHERE i.unidadenegocioid = ANY($1::bigint[]) AND i.datavencimento >= $2::date AND i.datavencimento < ($3::date + interval '1 day')
    GROUP BY i.unidadenegocioid, op.nome, i.bandeira, ta.descricao, COALESCE(NULLIF(i.totalparcela,0),1)`, [unis, ini, fim]);
  // agrega por loja × operadora × bandeira × GRUPO × faixa de parcelas (só PARCELADO abre por faixa)
  const g = {};
  for (const r of rows) {
    const grupo = palpiteGrupo(r.modalidade);
    const parc = grupo === 'PARCELADO' ? (Number(r.parcelas) || 2) : 0; // débito/à vista não abrem por faixa
    const liquido = Number(r.liquido) || 0, taxa = Number(r.taxa) || 0, antecip = Number(r.taxa_antecip) || 0;
    const k = r.loja_erp + '|' + r.operadora + '|' + r.bandeira + '|' + grupo + '|' + parc;
    const o = g[k] || (g[k] = { loja_erp: Number(r.loja_erp), operadora: r.operadora, bandeira: r.bandeira, grupo, parcelas: parc, n: 0, liquido: 0, taxa: 0, antecip: 0 });
    o.n += Number(r.n) || 0; o.liquido += liquido; o.taxa += taxa; o.antecip += antecip;
  }
  const linhas = Object.values(g).map(o => {
    const bruto = o.liquido + o.taxa + o.antecip;
    const praticado = bruto > 0 ? Math.round((o.taxa + o.antecip) / bruto * 10000) / 100 : null;
    const lojaApp = mapLojaApp[o.loja_erp] || '';
    const comb = rp.taxaEsperada(taxas, { operadora: o.operadora, lojaId: lojaApp, bandeira: o.bandeira, grupo: o.grupo, parcelas: o.parcelas });
    const combinado = comb ? Number(comb.taxa) : null;
    const diff = (praticado != null && combinado != null) ? round(praticado - combinado) : null;
    const cobradoAMais = (diff != null && diff > 0) ? round(bruto * diff / 100) : 0;
    const rotulo = (ROTULO_GRUPO[o.grupo] || o.grupo) + (o.grupo === 'PARCELADO' && o.parcelas > 1 ? ` ${o.parcelas}x` : '');
    return {
      loja: mapLojaNome[o.loja_erp] || ('Unid. ' + o.loja_erp), operadora: o.operadora, bandeira: o.bandeira,
      grupo: o.grupo, parcelas: o.parcelas, grupoRotulo: rotulo, n: o.n, bruto: round(bruto),
      combinado, praticado, diff, cobradoAMais, semCombinado: combinado == null,
    };
  }).sort((a, b) => b.cobradoAMais - a.cobradoAMais || b.bruto - a.bruto);
  // resumo por operadora
  const porOp = {};
  for (const l of linhas) {
    const o = porOp[l.operadora] || (porOp[l.operadora] = { operadora: l.operadora, bruto: 0, cobradoAMais: 0, n: 0, semCombinado: 0, acima: 0 });
    o.bruto += l.bruto; o.cobradoAMais += l.cobradoAMais; o.n += l.n;
    if (l.semCombinado) o.semCombinado++; if (l.diff != null && l.diff > 0.01) o.acima++;
  }
  const porOperadora = Object.values(porOp).map(o => ({ ...o, bruto: round(o.bruto), cobradoAMais: round(o.cobradoAMais) })).sort((a, b) => b.cobradoAMais - a.cobradoAMais);
  const total = linhas.reduce((a, l) => ({ bruto: a.bruto + l.bruto, cobradoAMais: a.cobradoAMais + l.cobradoAMais, n: a.n + l.n,
    semCombinado: a.semCombinado + (l.semCombinado ? 1 : 0), acima: a.acima + (l.diff != null && l.diff > 0.01 ? 1 : 0) }), { bruto: 0, cobradoAMais: 0, n: 0, semCombinado: 0, acima: 0 });
  total.bruto = round(total.bruto); total.cobradoAMais = round(total.cobradoAMais);
  return { ok: true, linhas, porOperadora, total, periodo: { ini, fim } };
}

// Aluguel / mensalidade / cobranças de máquina: o que a credenciadora DESCONTOU no repasse
// (tabela local conc_repasse_ajuste, alimentada pelos relatórios de repasse importados).
// Agrupado por operadora + descrição + loja. Filtro por período (data do ajuste) e loja.
function custoMaquinas(empresaId, { ini, fim, lojaId } = {}) {
  const params = [empresaId]; let w = 'empresa_id = ?';
  const flj = filtroLojaPosic('loja_id', lojaId);   // multi-loja (CSV/array)
  if (flj.sql) { w += flj.sql; params.push(...flj.params); }
  if (ini) { params.push(ini); w += " AND (data IS NULL OR data >= ?)"; }
  if (fim) { params.push(fim); w += " AND (data IS NULL OR data <= ?)"; }
  const rows = db.prepare(`SELECT operadora, COALESCE(NULLIF(TRIM(descricao),''), tipo) AS descricao, loja_id,
      COUNT(*) AS n, COALESCE(SUM(valor),0) AS valor
    FROM conc_repasse_ajuste WHERE ${w}
    GROUP BY operadora, COALESCE(NULLIF(TRIM(descricao),''), tipo), loja_id
    ORDER BY valor DESC`).all(...params);
  const mapLoja = {}; lojasEmpresa(empresaId).forEach(l => { mapLoja[l.id] = l.nome; });
  const linhas = rows.map(r => ({ operadora: r.operadora || '—', descricao: r.descricao || '—', loja: mapLoja[r.loja_id] || r.loja_id || '—', n: r.n, valor: Number(r.valor) || 0 }));
  const porLoja = {}; const porDescricao = {};
  for (const l of linhas) {
    (porLoja[l.loja] = porLoja[l.loja] || { loja: l.loja, valor: 0, n: 0 }); porLoja[l.loja].valor += l.valor; porLoja[l.loja].n += l.n;
    (porDescricao[l.descricao] = porDescricao[l.descricao] || { descricao: l.descricao, valor: 0, n: 0 }); porDescricao[l.descricao].valor += l.valor; porDescricao[l.descricao].n += l.n;
  }
  const total = linhas.reduce((a, l) => ({ valor: a.valor + l.valor, n: a.n + l.n }), { valor: 0, n: 0 });
  return { ok: true, linhas, porLoja: Object.values(porLoja).sort((a, b) => b.valor - a.valor), porDescricao: Object.values(porDescricao).sort((a, b) => b.valor - a.valor), total };
}

// Recebimentos futuros: vendas de cartão com vencimento a partir de HOJE e ainda sem baixa —
// é o que vai ENTRAR na conta nos próximos dias (líquido). Agrupado por data e por operadora.
// Monta o filtro de janela: período personalizado (ini/fim) OU próximos N dias a partir de hoje.
function janelaRecebimento(ini, fim, dias, idxBase) {
  if (ini && fim) return { cond: `AND i.datavencimento::date >= $${idxBase}::date AND i.datavencimento::date <= $${idxBase + 1}::date`, params: [ini, fim], dias: null, ini, fim };
  const d = Math.min(365, Math.max(7, Number(dias) || 90));
  return { cond: `AND i.datavencimento::date >= CURRENT_DATE AND i.datavencimento::date < (CURRENT_DATE + ($${idxBase} || ' days')::interval)`, params: [String(d)], dias: d, ini: null, fim: null };
}
async function recebimentosFuturos(empresaId, { lojaId, dias, ini, fim } = {}) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { ok: true, porData: [], porOperadora: [], total: {} };
  const jan = janelaRecebimento(ini, fim, dias, 2);
  const rows = await erpQuery(`
    SELECT to_char(i.datavencimento,'YYYY-MM-DD') AS data, COALESCE(op.nome,'—') AS operadora,
      COUNT(*) AS n, COALESCE(SUM(i.valor),0) AS valor
    FROM conciliacaocartaoitem i
    JOIN conciliacaocartao c ON c.id = i.conciliacaocartaoid
    LEFT JOIN conciliacaocartaooperadora op ON op.id = c.conciliacaocartaooperadoraid
    WHERE i.unidadenegocioid = ANY($1::bigint[]) AND i.baixadata IS NULL
      ${jan.cond}
    GROUP BY i.datavencimento, op.nome
    ORDER BY i.datavencimento`, [unis, ...jan.params]);
  const porDataMap = {}; const porOpMap = {};
  for (const r of rows) {
    const v = Number(r.valor) || 0, n = Number(r.n) || 0;
    (porDataMap[r.data] = porDataMap[r.data] || { data: r.data, valor: 0, n: 0, operadoras: [] });
    porDataMap[r.data].valor += v; porDataMap[r.data].n += n;
    porDataMap[r.data].operadoras.push({ operadora: r.operadora, valor: v, n });
    (porOpMap[r.operadora] = porOpMap[r.operadora] || { operadora: r.operadora, valor: 0, n: 0 });
    porOpMap[r.operadora].valor += v; porOpMap[r.operadora].n += n;
  }
  const porData = Object.values(porDataMap);
  const porOperadora = Object.values(porOpMap).sort((a, b) => b.valor - a.valor);
  const total = porData.reduce((a, d) => ({ valor: a.valor + d.valor, n: a.n + d.n }), { valor: 0, n: 0 });
  // próximos 7 dias (soma rápida)
  const hoje = new Date(); const em7 = new Date(hoje.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  total.proximos7 = porData.filter(d => d.data < em7).reduce((a, d) => a + d.valor, 0);
  return { ok: true, porData, porOperadora, total, dias: jan.dias, ini: jan.ini, fim: jan.fim };
}

// Detalhe (lançamento a lançamento) dos recebimentos futuros — p/ exportar: NSU, data venda,
// data recebimento, CNPJ, loja, operadora, valor.
async function recebimentosFuturosItens(empresaId, { lojaId, dias, ini, fim } = {}) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { ok: true, itens: [] };
  const jan = janelaRecebimento(ini, fim, dias, 2);
  const rows = await erpQuery(`
    SELECT i.unidadenegocioid AS loja_erp, COALESCE(op.nome,'—') AS operadora,
      COALESCE(NULLIF(trim(i.bandeira),''),'—') AS bandeira,
      to_char(i.datahoratransacao,'YYYY-MM-DD') AS data_venda,
      to_char(i.datavencimento,'YYYY-MM-DD') AS data_recebimento,
      COALESCE(NULLIF(i.numerotransacao,''), NULLIF(i.numeroresumovenda,'')) AS nsu,
      i.preenchidonumeroautorizacao AS autorizacao, i.codigoestabelecimento AS estabelecimento,
      i.valor
    FROM conciliacaocartaoitem i
    JOIN conciliacaocartao c ON c.id = i.conciliacaocartaoid
    LEFT JOIN conciliacaocartaooperadora op ON op.id = c.conciliacaocartaooperadoraid
    WHERE i.unidadenegocioid = ANY($1::bigint[]) AND i.baixadata IS NULL
      ${jan.cond}
    ORDER BY i.datavencimento, op.nome LIMIT 20000`, [unis, ...jan.params]);
  const mapNome = {}, mapCnpj = {};
  db.prepare(`SELECT erp_unidadenegocio_id eu, nome, cnpj FROM lojas WHERE empresa_id=? AND erp_unidadenegocio_id IS NOT NULL`).all(empresaId)
    .forEach(l => { mapNome[Number(l.eu)] = l.nome; mapCnpj[Number(l.eu)] = l.cnpj || ''; });
  const itens = rows.map(r => ({
    loja: mapNome[Number(r.loja_erp)] || ('Unid. ' + r.loja_erp), cnpj: mapCnpj[Number(r.loja_erp)] || '',
    operadora: r.operadora, bandeira: r.bandeira, data_venda: r.data_venda, data_recebimento: r.data_recebimento,
    nsu: r.nsu || '', autorizacao: r.autorizacao || '', estabelecimento: r.estabelecimento || '', valor: Number(r.valor) || 0,
  }));
  return { ok: true, itens, total: itens.reduce((a, x) => a + x.valor, 0) };
}

module.exports = {
  depara, salvarDepara, deparaOperadora, salvarDeparaOperadora, modalidadesErp,
  edi, importar, confrontarArquivo, confrontarPeriodo, painel, pendentesPorOperadora, semOperadoraIdentificada, correcoes, lotes, apagarLote,
  marcarTratativa, remanejarLoja, taxasCobradas, biTaxaCombinada, recebimentosFuturos, recebimentosFuturosItens, custoMaquinas, GRUPOS, ROTULO_GRUPO, TIPOS, lojasTexto, salvarLojaTexto,
};
