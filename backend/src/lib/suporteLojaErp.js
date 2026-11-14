// suporteLojaErp.js — dados do hub "Suporte Loja" (Joe 2026-11-13). Leitura do A7 (espelho).
// NF × XML (possível erro/pendência de ENTRADA): a SEFAZ distribui o XML da NFe (distribuicaodfe);
// quando a nota NÃO vira entrada no ERP (sem notafiscal de entrada p/ aquela chave), é pendência de
// lançamento — risco fiscal e de estoque. Obs.: quando o XML É usado na entrada, o valor SEMPRE bate
// (validado: 0 divergências), por isso o sinal útil é "recebida sem entrada", não divergência de valor.
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const db = require('../db/connection');

function nomeLoja(uni) { const r = db.prepare('SELECT nome FROM lojas WHERE erp_unidadenegocio_id=?').get(uni); return r ? r.nome : String(uni); }

// Janela de tempo das consultas: por INTERVALO de datas (ini..fim, inclusivo) OU por "últimos N dias".
// `unis` é SEMPRE $1; esta janela usa $2 (e $3 quando por datas). Retorna a cláusula SQL + os params a
// anexar depois de unis. Assim "Mês passado/atual/Hoje/datas específicas" funciona em qualquer consulta.
function janela(campo, { dias = 30, ini = '', fim = '' } = {}) {
  if (ini && fim) return { clause: `${campo} >= $2::timestamp AND ${campo} < ($3::date + interval '1 day')`, extra: [ini, fim] };
  return { clause: `${campo} >= now() - ($2 || ' days')::interval`, extra: [String(dias)] };
}

// NFe recebidas da SEFAZ (tipoxml A=completo/B=resumo, situacao 1=autorizada) SEM entrada no ERP.
async function nfXmlSemEntrada(empresaId, { lojaId = '', dias = 60, ini = '', fim = '', limite = 500 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  const w = janela('d.datahora', { dias, ini, fim });
  const rows = await erpQuery(`
    WITH dfe AS (
      SELECT DISTINCT ON (d.chaveacessonfe) d.chaveacessonfe, d.unidadenegocioid uni,
        d.emitentenome, d.emitentecnpj, d.valortotal,
        to_char(d.datahoraemissao,'YYYY-MM-DD') emissao,
        GREATEST(0, date_part('day', now() - d.datahoraemissao))::int dias
      FROM distribuicaodfe d
      WHERE d.unidadenegocioid = ANY($1::bigint[]) AND d.tipoxml IN ('A','B') AND d.situacaonfe='1'
        AND d.valortotal IS NOT NULL AND ${w.clause}
      ORDER BY d.chaveacessonfe, d.tipoxml) -- 'A' (completo) antes de 'B' (resumo)
    SELECT dfe.* FROM dfe
    WHERE NOT EXISTS (SELECT 1 FROM notafiscal n
      WHERE n.chaveacesso = dfe.chaveacessonfe AND n.tipooperacao='1' AND n.status NOT IN ('X','E'))
    ORDER BY dfe.dias DESC, dfe.valortotal DESC
    LIMIT ${Number(limite) || 500}`, [unis, ...w.extra]);
  const itens = rows.map(r => ({
    chave: r.chaveacessonfe, uni: Number(r.uni), loja: nomeLoja(Number(r.uni)),
    fornecedor: (r.emitentenome || '').trim() || null, cnpj: r.emitentecnpj || null,
    valor: Math.round((Number(r.valortotal) || 0) * 100) / 100, emissao: r.emissao, dias: Number(r.dias) || 0,
  }));
  const valorTotal = Math.round(itens.reduce((a, i) => a + i.valor, 0) * 100) / 100;
  const criticos = itens.filter(i => i.dias > 7).length; // +7 dias sem lançar = risco (prazo de manifestação)
  return { erp: true, dias, resumo: { total: itens.length, valorTotal, criticos }, itens };
}

// Correções de estoque = ajustes de INVENTÁRIO feitos no Alpha 7: Inventário Entrada (INE, id 19) e
// Saída (INS, id 20) da movimentacaoestoque. Visão de auditoria: produto, qtd, valor, quem, quando.
async function ajustesEstoque(empresaId, { lojaId = '', dias = 30, ini = '', fim = '', limite = 500 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  const w = janela('m.datahora', { dias, ini, fim });
  const rows = await erpQuery(`
    SELECT m.unidadenegocioid uni, t.codigo tipo, m.quantidade qtd,
      pr.descricao produto, em.codigobarras ean,
      round((m.custo*abs(m.quantidade))::numeric,2) valor,
      to_char(m.datahora,'YYYY-MM-DD"T"HH24:MI') quando,
      COALESCE(u.apelido, p.nome, u.login) quem
    FROM movimentacaoestoque m
      JOIN tipomovimentacaoestoque t ON t.id=m.tipomovimentacaoestoqueid
      JOIN embalagem em ON em.id=m.embalagemid
      JOIN produto pr ON pr.id=em.produtoid
      LEFT JOIN usuario u ON u.id=m.usuarioid
      LEFT JOIN pessoa p ON p.id=u.pessoaid
    WHERE m.tipomovimentacaoestoqueid IN (19,20)
      AND m.unidadenegocioid = ANY($1::bigint[]) AND ${w.clause}
    ORDER BY m.datahora DESC
    LIMIT ${Number(limite) || 500}`, [unis, ...w.extra]);
  const itens = rows.map(r => {
    const qtd = Number(r.qtd) || 0; const valor = Math.round((Number(r.valor) || 0) * 100) / 100;
    return { uni: Number(r.uni), loja: nomeLoja(Number(r.uni)), tipo: r.tipo, entrada: r.tipo === 'INE',
      produto: (r.produto || '').trim(), ean: r.ean || null, qtd, valor, quando: r.quando, quem: (r.quem || '').trim() || null };
  });
  const entradaVal = itens.filter(i => i.entrada).reduce((a, i) => a + i.valor, 0);
  const saidaVal = itens.filter(i => !i.entrada).reduce((a, i) => a + i.valor, 0);
  return { erp: true, dias, resumo: {
    total: itens.length, entradas: itens.filter(i => i.entrada).length, saidas: itens.filter(i => !i.entrada).length,
    valorEntrada: Math.round(entradaVal * 100) / 100, valorSaida: Math.round(saidaVal * 100) / 100,
    valorLiquido: Math.round((entradaVal - saidaVal) * 100) / 100 }, itens };
}

// Acuracidade de Estoque (IRA — Inventory Record Accuracy): valida a CONTAGEM (física × sistema).
// Fonte: inventario + iteminventario (estoquecontado × estoqueteorico). `precisao` = o % que o A7 já
// calcula (= SKUs OK ÷ SKUs). Benchmark de mercado: ≥95% bom, 90-95% atenção, <90% ruim.
async function acuracidadeEstoque(empresaId, { lojaId = '', dias = 365, ini = '', fim = '', limite = 200 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  const w = janela('COALESCE(i.datahorafinal,i.datahorainicial)', { dias, ini, fim });
  const rows = await erpQuery(`
    WITH cp AS (
      SELECT DISTINCT ON (produtoid, unidadenegocioid) produtoid, unidadenegocioid, customedio
      FROM custoproduto WHERE unidadenegocioid = ANY($1::bigint[])
      ORDER BY produtoid, unidadenegocioid, datahorainiciocalculocustomedio DESC NULLS LAST)
    SELECT i.id, i.codigo, i.titulo, i.unidadenegocioid uni, i.precisao, i.status,
      to_char(COALESCE(i.datahorafinal,i.datahorainicial),'YYYY-MM-DD') data,
      count(ii.id) skus,
      count(*) FILTER (WHERE ii.estoquecontado = ii.estoqueteorico) ok,
      count(*) FILTER (WHERE ii.estoquecontado <> ii.estoqueteorico) diverg,
      round(sum(abs(COALESCE(ii.estoquecontado,0) - COALESCE(ii.estoqueteorico,0)))::numeric,2) un_diverg,
      round(sum(COALESCE(ii.estoqueteorico,0) * COALESCE(cp.customedio,0))::numeric,2) valor_teorico,
      round(sum(abs(COALESCE(ii.estoquecontado,0)-COALESCE(ii.estoqueteorico,0)) * COALESCE(cp.customedio,0))::numeric,2) valor_diverg
    FROM inventario i
    LEFT JOIN iteminventario ii ON ii.inventarioid=i.id
    LEFT JOIN embalagem em ON em.id=ii.embalagemid
    LEFT JOIN cp ON cp.produtoid=em.produtoid AND cp.unidadenegocioid=i.unidadenegocioid
    WHERE i.unidadenegocioid = ANY($1::bigint[])
      AND ${w.clause}
    GROUP BY i.id, i.codigo, i.titulo, i.unidadenegocioid, i.precisao, i.status
    ORDER BY COALESCE(i.datahorafinal,i.datahorainicial) DESC
    LIMIT ${Number(limite) || 200}`, [unis, ...w.extra]);
  const itens = rows.map(r => {
    const skus = Number(r.skus) || 0, ok = Number(r.ok) || 0;
    const acur = r.precisao != null ? Math.round(Number(r.precisao) * 100) / 100 : (skus ? Math.round(ok / skus * 10000) / 100 : null);
    const vTeorico = Math.round((Number(r.valor_teorico) || 0) * 100) / 100;
    const vCorrecao = Math.round((Number(r.valor_diverg) || 0) * 100) / 100; // valor da divergência (correção)
    const acurFin = vTeorico > 0 ? Math.max(0, Math.round((1 - vCorrecao / vTeorico) * 10000) / 100) : null;
    return { id: String(r.id), codigo: r.codigo, titulo: (r.titulo || '').trim() || '—', uni: Number(r.uni), loja: nomeLoja(Number(r.uni)),
      data: r.data, status: r.status, skus, ok, divergentes: Number(r.diverg) || 0, unDivergentes: Number(r.un_diverg) || 0,
      valorTeorico: vTeorico, valorCorrecao: vCorrecao, acuracidadeFin: acurFin,
      acuracidade: acur, farol: acur == null ? 'sem' : acur >= 95 ? 'verde' : acur >= 90 ? 'amarelo' : 'vermelho' };
  });
  // Acuracidade média ponderada por SKUs contados no período.
  const totSku = itens.reduce((a, i) => a + i.skus, 0);
  const totOk = itens.reduce((a, i) => a + i.ok, 0);
  const media = totSku ? Math.round(totOk / totSku * 10000) / 100 : null;
  // Por loja (p/ o gráfico): acuracidade ponderada por SKU de cada loja.
  const porLojaMap = {};
  itens.forEach(i => { const k = i.loja || i.uni; (porLojaMap[k] = porLojaMap[k] || { loja: k, skus: 0, ok: 0, contagens: 0 }); porLojaMap[k].skus += i.skus; porLojaMap[k].ok += i.ok; porLojaMap[k].contagens++; });
  const porLoja = Object.values(porLojaMap).map(l => ({ loja: l.loja, contagens: l.contagens, skus: l.skus,
    acuracidade: l.skus ? Math.round(l.ok / l.skus * 10000) / 100 : null,
    farol: !l.skus ? 'sem' : (l.ok / l.skus * 100) >= 95 ? 'verde' : (l.ok / l.skus * 100) >= 90 ? 'amarelo' : 'vermelho' }))
    .sort((a, b) => (b.acuracidade || 0) - (a.acuracidade || 0));
  // Acuracidade FINANCEIRA (sobre o contado): 1 − (valor corrigido ÷ valor teórico contado).
  const totTeorico = itens.reduce((a, i) => a + (i.valorTeorico || 0), 0);
  const totCorrecao = itens.reduce((a, i) => a + (i.valorCorrecao || 0), 0);
  const mediaFin = totTeorico > 0 ? Math.max(0, Math.round((1 - totCorrecao / totTeorico) * 10000) / 100) : null;
  // Lentes complementares: o mesmo valor de divergência expresso sobre o ESTOQUE total e sobre a VENDA.
  let valorEstoque = 0, vendaTotal = 0;
  try {
    const e = await erpQuery(`WITH cp AS (SELECT DISTINCT ON (produtoid,unidadenegocioid) produtoid,unidadenegocioid,customedio FROM custoproduto WHERE unidadenegocioid=ANY($1::bigint[]) ORDER BY produtoid,unidadenegocioid,datahorainiciocalculocustomedio DESC NULLS LAST)
      SELECT round(sum(e.estoque*COALESCE(cp.customedio,0))::numeric,2) v FROM estoque e JOIN embalagem em ON em.id=e.embalagemid
      LEFT JOIN cp ON cp.produtoid=em.produtoid AND cp.unidadenegocioid=e.unidadenegocioid WHERE e.unidadenegocioid=ANY($1::bigint[]) AND e.estoque>0`, [unis]);
    valorEstoque = Number(e[0] && e[0].v) || 0;
  } catch (er) { }
  try {
    const wv = janela('vd.datahorafechamento', { dias, ini, fim });
    const v = await erpQuery(`SELECT round(sum(iv.valortotal)::numeric,2) v FROM itemvenda iv JOIN venda vd ON vd.id=iv.vendaid
      WHERE vd.unidadenegocioid=ANY($1::bigint[]) AND vd.status IN ('F','D') AND iv.status='F' AND ${wv.clause}`, [unis, ...wv.extra]);
    vendaTotal = Number(v[0] && v[0].v) || 0;
  } catch (er) { }
  return { erp: true, dias, benchmark: { bom: 95, atencao: 90 },
    resumo: { contagens: itens.length, skus: totSku, acuracidadeMedia: media,
      acuracidadeFinMedia: mediaFin, valorCorrecao: Math.round(totCorrecao * 100) / 100, valorTeorico: Math.round(totTeorico * 100) / 100,
      valorEstoque: Math.round(valorEstoque * 100) / 100, vendaTotal: Math.round(vendaTotal * 100) / 100,
      erroVsEstoque: valorEstoque > 0 ? Math.round(totCorrecao / valorEstoque * 10000) / 100 : null,
      erroVsVenda: vendaTotal > 0 ? Math.round(totCorrecao / vendaTotal * 10000) / 100 : null },
    porLoja, itens };
}

// Entrada SEM recepção: NF de entrada (notafiscal tipooperacao='1') que NÃO tem recebimento físico
// vinculado (recebimentofisiconotafiscal) — ou seja, deu entrada no sistema sem conferir a mercadoria.
// É o INVERSO do "recebido sem entrada" (que recebeu e não deu entrada).
async function entradaSemRecepcao(empresaId, { lojaId = '', dias = 30, ini = '', fim = '', limite = 500 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  const w = janela('nf.datahoraentrada', { dias, ini, fim });
  const rows = await erpQuery(`
    SELECT nf.unidadenegocioid uni, nf.numero, nf.valortotal,
      to_char(nf.datahoraentrada,'YYYY-MM-DD') entrada,
      EXTRACT(day FROM now()-nf.datahoraentrada)::int dias,
      COALESCE(p.razaosocial, p.nome) fornecedor,
      COALESCE(uc.apelido, pc.nome, uc.login) conferente
    FROM notafiscal nf
    LEFT JOIN fornecedor f ON f.id = nf.fornecedorid
    LEFT JOIN pessoa p ON p.id = f.pessoaid
    LEFT JOIN usuario uc ON uc.id = nf.usuarioinclusaoid
    LEFT JOIN pessoa pc ON pc.id = uc.pessoaid
    WHERE nf.tipooperacao='1' AND nf.status NOT IN ('X','E')
      AND nf.unidadenegocioid = ANY($1::bigint[]) AND ${w.clause}
      AND NOT EXISTS (SELECT 1 FROM recebimentofisiconotafiscal rfn WHERE rfn.notafiscalid = nf.id)
      -- NÃO conta TRANSFERÊNCIA entre lojas do grupo (emitente é uma unidade de negócio própria)
      AND NOT EXISTS (SELECT 1 FROM unidadenegocio un WHERE un.cnpj = p.cnpj AND p.cnpj IS NOT NULL)
      -- NÃO conta entradas automáticas do "sistema" (integração) — só interessa o que pessoa lançou
      AND lower(COALESCE(uc.apelido, pc.nome, uc.login, '')) <> 'sistema'
    ORDER BY nf.datahoraentrada DESC
    LIMIT ${Number(limite) || 500}`, [unis, ...w.extra]);
  const itens = rows.map(r => ({ uni: Number(r.uni), loja: nomeLoja(Number(r.uni)), numero: r.numero,
    fornecedor: (r.fornecedor || '').trim() || null, conferente: (r.conferente || '').trim() || null,
    valor: Math.round((Number(r.valortotal) || 0) * 100) / 100, entrada: r.entrada, dias: Number(r.dias) || 0 }));
  const valorTotal = Math.round(itens.reduce((a, i) => a + i.valor, 0) * 100) / 100;
  // Aging por dias sem conferência (grid): 0–6, 7–14, 15–29, 30+.
  const faixa = (lo, hi) => { const g = itens.filter(i => i.dias >= lo && (hi == null || i.dias <= hi)); return { qtd: g.length, valor: Math.round(g.reduce((a, i) => a + i.valor, 0) * 100) / 100 }; };
  const buckets = { ate6: faixa(0, 6), d7_14: faixa(7, 14), d15_29: faixa(15, 29), m30: faixa(30, null) };
  // Ranking por CONFERENTE (quem deu entrada sem a recepção): qtd + valor.
  const cm = {};
  itens.forEach(i => { const k = i.conferente || '—'; (cm[k] = cm[k] || { conferente: k, qtd: 0, valor: 0 }); cm[k].qtd++; cm[k].valor += i.valor; });
  const porConferente = Object.values(cm).map(c => ({ ...c, valor: Math.round(c.valor * 100) / 100 })).sort((a, b) => b.qtd - a.qtd);
  return { erp: true, dias, resumo: { total: itens.length, valorTotal, buckets, porConferente }, itens };
}

// NOTAS PENDENTES DE ENTRADA: a nota é "liberada" quando o PEDIDO é conciliado (conciliacaocompra).
// Pendente = conciliada (liberada) mas SEM recepção física (recebimentofisiconotafiscal). Quando também
// está `conferida=false`, é o caso crítico "liberada sem recepção E sem conferência" (pendente de dar entrada).
async function notasLiberadasPendentes(empresaId, { lojaId = '', dias = 90, ini = '', fim = '', limite = 500 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  const w = janela('cc.datahora', { dias, ini, fim });
  const rows = await erpQuery(`
    SELECT cc.codigo AS concil, nf.unidadenegocioid uni, nf.numero AS nf, pc.codigo AS pedido,
      to_char(cc.datahora,'YYYY-MM-DD') conciliada, (now()::date - cc.datahora::date)::int dias,
      COALESCE(cc.conferida, false) conferida, nf.valortotal valor,
      COALESCE(p.razaosocial, p.nome) fornecedor
    FROM conciliacaocompra cc
    JOIN notafiscal nf ON nf.id = cc.notafiscalprincipalid
    LEFT JOIN fornecedor f ON f.id = nf.fornecedorid
    LEFT JOIN pessoa p ON p.id = f.pessoaid
    LEFT JOIN pedidocompra pc ON pc.id = cc.pedidocompraprincipalid
    WHERE nf.tipooperacao='1' AND nf.status NOT IN ('X','E')
      AND nf.unidadenegocioid = ANY($1::bigint[]) AND ${w.clause}
      AND NOT EXISTS (SELECT 1 FROM recebimentofisiconotafiscal rfn WHERE rfn.notafiscalid = nf.id)
    ORDER BY cc.datahora ASC
    LIMIT ${Number(limite) || 500}`, [unis, ...w.extra]);
  const itens = rows.map(r => ({
    concil: r.concil, uni: Number(r.uni), loja: nomeLoja(Number(r.uni)), nf: r.nf, pedido: r.pedido,
    fornecedor: (r.fornecedor || '').trim() || null, conciliada: r.conciliada, dias: Number(r.dias) || 0,
    conferida: r.conferida === true || r.conferida === 't',
    valor: Math.round((Number(r.valor) || 0) * 100) / 100,
  }));
  const soma = arr => Math.round(arr.reduce((a, i) => a + i.valor, 0) * 100) / 100;
  const semConf = itens.filter(i => !i.conferida); // liberada SEM recepção E SEM conferência (crítico)
  const faixa = (lo, hi) => { const g = itens.filter(i => i.dias >= lo && (hi == null || i.dias <= hi)); return { qtd: g.length, valor: soma(g) }; };
  const buckets = { ate6: faixa(0, 6), d7_14: faixa(7, 14), d15_29: faixa(15, 29), m30: faixa(30, null) };
  const lm = {};
  itens.forEach(i => { const k = i.loja || i.uni; (lm[k] = lm[k] || { loja: k, qtd: 0, valor: 0 }); lm[k].qtd++; lm[k].valor += i.valor; });
  const porLoja = Object.values(lm).map(l => ({ ...l, valor: Math.round(l.valor * 100) / 100 })).sort((a, b) => b.qtd - a.qtd);
  return {
    erp: true, dias,
    resumo: { total: itens.length, valorTotal: soma(itens), semConferencia: semConf.length, valorSemConferencia: soma(semConf),
      criticos: itens.filter(i => i.dias > 7).length, buckets, porLoja },
    itens,
  };
}

// "Minha área" do Suporte: resumo das PENDÊNCIAS acionáveis do responsável (contagens + valor) para o
// painel lateral. Reusa as funções já existentes; cada bloco clica e abre a aba correspondente.
async function minhaAreaResumo(empresaId, { lojaId = '', dias = 90 } = {}) {
  if (!habilitado()) return { erp: false };
  const [np, sr, xml, acur] = await Promise.all([
    notasLiberadasPendentes(empresaId, { lojaId, dias, limite: 500 }).catch(() => ({})),
    entradaSemRecepcao(empresaId, { lojaId, dias: 30, limite: 500 }).catch(() => ({})),
    nfXmlSemEntrada(empresaId, { lojaId, dias: 60, limite: 500 }).catch(() => ({})),
    acuracidadeEstoque(empresaId, { lojaId, dias: 180, limite: 60 }).catch(() => ({})),
  ]);
  return {
    erp: true,
    notasPendentes: { qtd: (np.resumo && np.resumo.semConferencia) || 0, valor: (np.resumo && np.resumo.valorSemConferencia) || 0 },
    semRecepcao: { qtd: (sr.resumo && sr.resumo.total) || 0, valor: (sr.resumo && sr.resumo.valorTotal) || 0 },
    xmlNaoLancado: { qtd: (xml.resumo && xml.resumo.total) || 0, valor: (xml.resumo && xml.resumo.valorTotal) || 0 },
    acuracidade: (acur.resumo && acur.resumo.acuracidadeMedia != null) ? acur.resumo.acuracidadeMedia : null,
  };
}

// Recepção de transporte feita JUNTO com a conferência (processo errado): o correto é registrar a
// recepção na CHEGADA da mercadoria e conferir depois. Quando o gap (datahora→datahorafinal) é curto,
// a pessoa só registrou a recepção na hora de conferir. limiteMin = quanto conta como "feito junto".
async function recepcaoJuntoConferencia(empresaId, { lojaId = '', dias = 30, ini = '', fim = '', limiteMin = 15, limite = 800 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  const w = janela('rf.datahora', { dias, ini, fim });
  const rows = await erpQuery(`
    SELECT rf.unidadenegocioid uni, rf.codigo,
      round((EXTRACT(EPOCH FROM (rf.datahorafinal - rf.datahora))/60.0)::numeric,1) gap_min,
      to_char(rf.datahora,'YYYY-MM-DD"T"HH24:MI') recepcao, to_char(rf.datahorafinal,'YYYY-MM-DD"T"HH24:MI') conferencia,
      COALESCE(ui.apelido, pi.nome, ui.login) recebeu
    FROM recebimentofisico rf
    LEFT JOIN usuario ui ON ui.id = rf.usuarioinicialid
    LEFT JOIN pessoa pi ON pi.id = ui.pessoaid
    WHERE rf.unidadenegocioid = ANY($1::bigint[]) AND rf.status <> 'A'
      AND rf.datahorafinal IS NOT NULL AND rf.datahora IS NOT NULL AND rf.datahorafinal >= rf.datahora
      AND ${w.clause}
    ORDER BY rf.datahora DESC
    LIMIT 8000`, [unis, ...w.extra]);
  const lim = Number(limiteMin) || 15;
  const todos = rows.map(r => ({ uni: Number(r.uni), loja: nomeLoja(Number(r.uni)), codigo: r.codigo,
    gapMin: Number(r.gap_min) || 0, recepcao: r.recepcao, conferencia: r.conferencia,
    recebeu: (r.recebeu || '').trim() || null, junto: (Number(r.gap_min) || 0) < lim }));
  const total = todos.length; const juntoN = todos.filter(i => i.junto).length;
  // Por loja: % feito junto (quanto maior, pior) — sobre TODOS os recebimentos concluídos.
  const porLojaMap = {};
  todos.forEach(i => { const k = i.loja; (porLojaMap[k] = porLojaMap[k] || { loja: k, total: 0, junto: 0 }); porLojaMap[k].total++; if (i.junto) porLojaMap[k].junto++; });
  const porLoja = Object.values(porLojaMap).map(l => ({ loja: l.loja, total: l.total, junto: l.junto, pct: l.total ? Math.round(l.junto / l.total * 1000) / 10 : 0 })).sort((a, b) => b.pct - a.pct);
  // Por pessoa (quem recebeu) — ranking dos que mais fazem "junto".
  const pm = {};
  todos.filter(i => i.junto).forEach(i => { const k = i.recebeu || '—'; (pm[k] = pm[k] || { nome: k, qtd: 0 }); pm[k].qtd++; });
  const porPessoa = Object.values(pm).sort((a, b) => b.qtd - a.qtd);
  return { erp: true, dias, limiteMin: lim,
    resumo: { total, junto: juntoN, pct: total ? Math.round(juntoN / total * 1000) / 10 : null, gapMedio: total ? Math.round(todos.reduce((a, i) => a + i.gapMin, 0) / total * 10) / 10 : null },
    porLoja, porPessoa, itens: todos.filter(i => i.junto).slice(0, 500) };
}

// Erros de entrada (divergência de QUANTIDADE): o que o conferente bipou (itemnotafiscal.quantidade)
// difere do que veio no XML/NF (itemnotafiscal.quantidadeoriginal). Ranking por conferente.
async function errosEntrada(empresaId, { lojaId = '', dias = 30, ini = '', fim = '', limite = 1000 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  const w = janela('nf.datahoraentrada', { dias, ini, fim });
  const rows = await erpQuery(`
    SELECT nf.unidadenegocioid uni, nf.numero, to_char(nf.datahoraentrada,'YYYY-MM-DD') entrada,
      pr.descricao produto, em.codigobarras ean,
      ii.quantidadeoriginal qtd_xml, ii.quantidade qtd_conf,
      COALESCE(fp.razaosocial, fp.nome) fornecedor,
      COALESCE(uc.apelido, pc.nome, uc.login) conferente
    FROM itemnotafiscal ii
    JOIN notafiscal nf ON nf.id = ii.notafiscalid
    JOIN embalagem em ON em.id = ii.embalagemid
    JOIN produto pr ON pr.id = em.produtoid
    LEFT JOIN fornecedor f ON f.id = nf.fornecedorid
    LEFT JOIN pessoa fp ON fp.id = f.pessoaid
    LEFT JOIN usuario uc ON uc.id = nf.usuarioinclusaoid
    LEFT JOIN pessoa pc ON pc.id = uc.pessoaid
    WHERE nf.tipooperacao='1' AND nf.status NOT IN ('X','E')
      AND nf.unidadenegocioid = ANY($1::bigint[]) AND ${w.clause}
      AND ii.quantidadeoriginal IS NOT NULL AND ii.quantidade <> ii.quantidadeoriginal
      AND lower(COALESCE(uc.apelido, pc.nome, uc.login, '')) <> 'sistema'
    ORDER BY nf.datahoraentrada DESC
    LIMIT ${Number(limite) || 1000}`, [unis, ...w.extra]);
  const itens = rows.map(r => {
    const xml = Number(r.qtd_xml) || 0, conf = Number(r.qtd_conf) || 0;
    return { uni: Number(r.uni), loja: nomeLoja(Number(r.uni)), numero: r.numero, entrada: r.entrada,
      produto: (r.produto || '').trim(), ean: r.ean || null, fornecedor: (r.fornecedor || '').trim() || null,
      conferente: (r.conferente || '').trim() || null, qtdXml: xml, qtdConf: conf, diferenca: Math.round((conf - xml) * 1000) / 1000 };
  });
  const nfs = new Set(itens.map(i => i.numero)).size;
  // Ranking por conferente (quem mais erra): nº de itens divergentes.
  const cm = {};
  itens.forEach(i => { const k = i.conferente || '—'; (cm[k] = cm[k] || { nome: k, qtd: 0 }); cm[k].qtd++; });
  const porConferente = Object.values(cm).sort((a, b) => b.qtd - a.qtd);
  return { erp: true, dias, resumo: { itens: itens.length, nfs }, porConferente, itens };
}

module.exports = { nfXmlSemEntrada, ajustesEstoque, acuracidadeEstoque, entradaSemRecepcao, recepcaoJuntoConferencia, errosEntrada, notasLiberadasPendentes, minhaAreaResumo };
