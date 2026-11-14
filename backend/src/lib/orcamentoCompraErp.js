// orcamentoErp.js — Orçamento de compra = projeção de vendas × CMV%.
// Projeção: ano passado × crescimento acumulado (quando há histórico); senão, tendência do próprio ano.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { metaVals } = require('./metasCompra');
const { unisEmpresa, planoCmvIds } = require('./escopoCompras');
const { filtroProdutosComprador, clausulaProdutos } = require('./comprasErp');

// Produtos de um comprador (via vínculo de grupos/classificações) → lista de produtoids do ERP.
async function produtosComprador(empresaId, compradorId) {
  if (!compradorId) return null;
  const filtro = await filtroProdutosComprador(empresaId, compradorId);
  if (!filtro) return [];
  const { expr, params } = clausulaProdutos(filtro, 'p');
  const rows = await erpQuery(`SELECT p.id FROM produto p WHERE p.status='A' AND ${expr}`, params);
  return rows.map(r => Number(r.id));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function getConfig(empresaId) {
  return db.prepare('SELECT * FROM compras_config WHERE empresa_id=?').get(empresaId) || {};
}

// Vendas mensais (status F) da rede, deste ano e do anterior. Se prodIds, só os produtos do comprador.
async function vendasMensais(unis, ano, prodIds) {
  const rows = prodIds
    ? await erpQuery(`
        SELECT extract(year from v.datahorafechamento)::int ano, extract(month from v.datahorafechamento)::int mes, sum(iv.valortotal) t
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN embalagem em ON em.id=iv.embalagemid
        WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[])
          AND v.datahorafechamento >= make_date($2,1,1) AND v.datahorafechamento < make_date($3,1,1)
          AND em.produtoid = ANY($4::bigint[])
        GROUP BY 1,2`, [unis, ano - 1, ano + 1, prodIds])
    : await erpQuery(`
        SELECT extract(year from datahorafechamento)::int ano, extract(month from datahorafechamento)::int mes, sum(valortotal) t
        FROM venda WHERE status='F' AND unidadenegocioid = ANY($1::bigint[])
          AND datahorafechamento >= make_date($2,1,1) AND datahorafechamento < make_date($3,1,1)
        GROUP BY 1,2`, [unis, ano - 1, ano + 1]);
  const cur = Array(12).fill(0), prev = Array(12).fill(0);
  for (const r of rows) {
    const arr = Number(r.ano) === ano ? cur : Number(r.ano) === ano - 1 ? prev : null;
    if (arr) arr[Number(r.mes) - 1] = Number(r.t) || 0;
  }
  return { cur, prev };
}

// CMV% real consolidado (YTD do ano) — custo (movimentacaoestoque) sobre venda. Opcional: produtos do comprador.
async function cmvRealYTD(unis, ano, prodIds) {
  const pf = prodIds ? 'JOIN embalagem em ON em.id=iv.embalagemid' : '';
  const pw = prodIds ? 'AND em.produtoid = ANY($3::bigint[])' : '';
  const params = prodIds ? [unis, ano, prodIds] : [unis, ano];
  const r = (await erpQuery(`
    WITH b AS (
      SELECT iv.valortotal vt, me.custo cu, abs(me.quantidade) q
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
        JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid ${pf}
      WHERE v.status IN ('F','D') AND iv.status='F'
        AND v.datahorafechamento >= make_date($2,1,1) AND v.unidadenegocioid = ANY($1::bigint[]) ${pw})
    SELECT 100*sum(cu*q)/nullif(sum(vt),0) cmv FROM b`, params))[0];
  return r && r.cmv != null ? Math.round(Number(r.cmv) * 100) / 100 : null;
}

// Já comprado (NF de entrada) no ano e no mês corrente. Opcional: produtos do comprador.
async function jaComprado(unis, ano, mesAtual, prodIds) {
  const r = prodIds
    ? (await erpQuery(`
        SELECT sum(ii.valortotal) ytd,
          sum(ii.valortotal) FILTER (WHERE extract(month from nf.datahoraentrada)=$3) mes
        FROM notafiscal nf JOIN itemnotafiscal ii ON ii.notafiscalid=nf.id JOIN embalagem em ON em.id=ii.embalagemid
        WHERE nf.unidadenegocioid = ANY($1::bigint[]) AND nf.datahoraentrada >= make_date($2,1,1)
          AND nf.status NOT IN ('X','E') AND em.produtoid = ANY($4::bigint[])`, [unis, ano, mesAtual, prodIds]))[0] || {}
    : (await erpQuery(`
        SELECT sum(valortotal) ytd,
          sum(valortotal) FILTER (WHERE extract(month from datahoraentrada)=$3) mes
        FROM notafiscal
        WHERE unidadenegocioid = ANY($1::bigint[]) AND datahoraentrada >= make_date($2,1,1)
          AND status NOT IN ('X','E')`, [unis, ano, mesAtual]))[0] || {};
  return { ytd: Number(r.ytd) || 0, mes: Number(r.mes) || 0 };
}

// Pedidos de compra em aberto (compromisso a chegar). aberto = A/H/J/D; 30 dias. Opcional: produtos do comprador.
async function pedidosPendentes(unis, prodIds) {
  const pf = prodIds ? 'JOIN embalagem em ON em.id=ip.embalagemid' : '';
  const pw = prodIds ? 'AND em.produtoid = ANY($2::bigint[])' : '';
  const params = prodIds ? [unis, prodIds] : [unis];
  const r = (await erpQuery(`
    SELECT sum(ip.valortotal) t, count(DISTINCT pc.id) n
    FROM pedidocompra pc JOIN itempedidocompra ip ON ip.pedidocompraid = pc.id ${pf}
    WHERE pc.unidadenegocioid = ANY($1::bigint[])
      AND pc.status IN ('A','H','J','D')
      AND pc.datahora >= now() - interval '30 days' ${pw}`, params))[0] || {};
  return { valor: Number(r.t) || 0, qtd: Number(r.n) || 0 };
}

// Contas a pagar de COMPRA (plano de contas CMV) em aberto (status A) vencendo nos próximos 6 meses.
async function comprometidoPorMes(unis, ano, mesIdx, cmvIds) {
  const filtroPlano = cmvIds && cmvIds.length ? 'AND planocontasid = ANY($4::bigint[])' : '';
  const params = [unis, ano, mesIdx + 1]; if (filtroPlano) params.push(cmvIds);
  const rows = await erpQuery(`
    SELECT extract(year from datavencimento)::int a, extract(month from datavencimento)::int m, sum(valor) v, count(*) n
    FROM contapagar
    WHERE unidadenegocioid = ANY($1::bigint[]) AND status='A' ${filtroPlano}
      AND datavencimento >= make_date($2,$3,1)
      AND datavencimento < (make_date($2,$3,1) + interval '6 months')
    GROUP BY 1,2`, params);
  const map = new Map();
  for (const r of rows) map.set(`${r.a}-${r.m}`, { valor: Number(r.v) || 0, contas: Number(r.n) || 0 });
  return map;
}

// Comprometido do COMPRADOR: rateia cada boleto (contapagar) pela fração dos itens da sua NF
// que pertencem aos produtos do comprador (uma mesma NF pode ter itens de vários compradores).
async function comprometidoPorMesComprador(unis, ano, mesIdx, cmvIds, prodIds) {
  const rows = await erpQuery(`
    WITH contas AS (
      SELECT cp.id, cp.valor, cp.datavencimento
      FROM contapagar cp
      WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status='A'
        ${cmvIds.length ? 'AND cp.planocontasid = ANY($4::bigint[])' : ''}
        AND cp.datavencimento >= make_date($2,$3,1)
        AND cp.datavencimento < (make_date($2,$3,1) + interval '6 months')
    ),
    nf AS (
      SELECT ncp.contapagarid,
        sum(ii.valortotal) total,
        sum(ii.valortotal) FILTER (WHERE em.produtoid = ANY($5::bigint[])) comp
      FROM notafiscalcontapagar ncp
      JOIN contas c ON c.id = ncp.contapagarid
      JOIN itemnotafiscal ii ON ii.notafiscalid = ncp.notafiscalid
      JOIN embalagem em ON em.id = ii.embalagemid
      GROUP BY ncp.contapagarid
    )
    SELECT extract(year from c.datavencimento)::int a, extract(month from c.datavencimento)::int m,
      sum(c.valor * COALESCE(nf.comp,0) / NULLIF(nf.total,0)) v,
      count(*) FILTER (WHERE COALESCE(nf.comp,0) > 0) n
    FROM contas c LEFT JOIN nf ON nf.contapagarid = c.id
    GROUP BY 1,2`, [unis, ano, mesIdx + 1, cmvIds.length ? cmvIds : [0], prodIds]);
  const map = new Map();
  for (const r of rows) map.set(`${r.a}-${r.m}`, { valor: Number(r.v) || 0, contas: Number(r.n) || 0 });
  return map;
}

// Monta a projeção dos próximos `n` meses.
// runRate = { aplica, mesCal, dia, dias } → o MÊS CORRENTE é projetado pela tendência do que
// já vendeu (venda até hoje ÷ dias decorridos × dias do mês), não por um valor cheio de tabela.
function projetar(cur, prev, mesAtualIdx, crescimentoMeta, runRate) {
  const temHistorico = prev.some(v => v > 0);
  // Crescimento acumulado YTD (ano atual vs mesmo período do ano anterior).
  let fator = null, base = 'historico';
  if (temHistorico) {
    let a = 0, b = 0;
    for (let i = 0; i <= mesAtualIdx; i++) { a += cur[i]; b += prev[i]; }
    fator = b > 0 ? a / b : 1;
  }
  // Sem histórico: usa a média dos últimos meses fechados + crescimento-meta opcional.
  const fechados = cur.slice(0, mesAtualIdx).filter(v => v > 0); // meses completos
  const mediaRecente = fechados.length ? fechados.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, fechados.length) : 0;
  const g = crescimentoMeta != null ? crescimentoMeta / 100 : 0;
  const rr = runRate || {};

  const proj = [];
  for (let k = 0; k < 12; k++) {
    // Meses já fechados (anteriores ao corrente) = realizado.
    if (k < mesAtualIdx && cur[k] > 0) { proj.push({ mes: k, valor: cur[k], real: true }); continue; }
    // Mês CORRENTE em andamento → tendência do próprio mês (run-rate do que já vendeu).
    if (rr.aplica && k === rr.mesCal && rr.dia > 0 && rr.dias > 0 && cur[k] > 0) {
      proj.push({ mes: k, valor: cur[k] / rr.dia * rr.dias, real: false, parcial: true, realizado: cur[k], dia: rr.dia, dias: rr.dias });
      continue;
    }
    if (temHistorico && prev[k] > 0) proj.push({ mes: k, valor: prev[k] * fator, real: false });
    else if (mediaRecente > 0) proj.push({ mes: k, valor: mediaRecente * Math.pow(1 + g, Math.max(0, k - mesAtualIdx + 1)), real: false });
    else proj.push({ mes: k, valor: 0, real: false });
  }
  if (!temHistorico) base = 'tendencia';
  return { proj, base, fator, mediaRecente };
}

async function orcamentoCompra(empresaId, { ano, mes, lojaId, compradorId } = {}) {
  if (!habilitado()) return { erp: false };
  const hoje = new Date();
  ano = ano || hoje.getFullYear();
  mes = mes || (hoje.getMonth() + 1); // 1..12
  const mesIdx = mes - 1;
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const mv = metaVals(empresaId);
  const cfg = { cmv_meta: mv.cmv_meta ?? null, crescimento_meta: mv.crescimento_meta ?? null };
  const cmvIds = await planoCmvIds();

  // Escopo do comprador (opcional): filtra vendas/compras pelos produtos dos grupos/classificações dele.
  const prodIds = await produtosComprador(empresaId, compradorId);
  if (compradorId && (!prodIds || !prodIds.length)) return { erp: true, semComprador: true, erro: 'Comprador sem grupos/classificações vinculados.' };
  const escopoComprador = !!(prodIds && prodIds.length);

  const [{ cur, prev }, cmvReal, comprado, pendentes, comprometido] = await Promise.all([
    vendasMensais(unis, ano, prodIds), cmvRealYTD(unis, ano, prodIds), jaComprado(unis, ano, mes, prodIds), pedidosPendentes(unis, prodIds),
    comprometidoPorMes(unis, ano, mesIdx, cmvIds),
  ]);
  // Comprometido (boletos) do comprador: rateia CADA boleto pela fração dos itens da sua NF que são
  // dos produtos do comprador (uma NF pode ter itens de vários compradores).
  let rateio = null;
  if (escopoComprador) {
    const compradorComp = await comprometidoPorMesComprador(unis, ano, mesIdx, cmvIds, prodIds);
    let somaRede = 0, somaComp = 0;
    for (const [, v] of comprometido) somaRede += v.valor;
    for (const [, v] of compradorComp) somaComp += v.valor;
    rateio = somaRede > 0 ? somaComp / somaRede : 0;
    comprometido.clear();
    for (const [k, v] of compradorComp) comprometido.set(k, v);
  }
  const cmvUsado = cfg.cmv_meta != null ? cfg.cmv_meta : cmvReal;
  // Run-rate do mês corrente: só aplica se o mês pedido é o mês/ano de calendário de hoje.
  const runRate = {
    aplica: ano === hoje.getFullYear(),
    mesCal: hoje.getMonth(),
    dia: hoje.getDate(),
    dias: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate(),
  };
  const { proj, base, fator, mediaRecente } = projetar(cur, prev, mesIdx, cfg.crescimento_meta, runRate);
  const gMeta = cfg.crescimento_meta != null ? cfg.crescimento_meta / 100 : 0;

  // Metas de VENDA já projetadas (Faturamento → Metas, escopo REDE). Quando existem, a projeção do
  // orçamento usa a META do mês no lugar da tendência — e estende para os próximos meses (vira o ano).
  // Só na REDE: o comprador não tem meta de venda própria (as metas de venda são da rede/loja/vendedor).
  const metaVenda = {};
  if (!escopoComprador) {
    try { for (const r of db.prepare(`SELECT competencia, meta FROM faturamento_meta WHERE empresa_id=? AND canal='todos' AND escopo='rede' AND alvo='' AND indicador='venda' AND meta IS NOT NULL`).all(empresaId)) metaVenda[r.competencia] = Number(r.meta); }
    catch { /* tabela pode não existir ainda */ }
  }
  const pad2 = n => String(n).padStart(2, '0');

  // Aprovações de carry do Diretor (por mês do ano).
  const aprovMap = {};
  try { for (const a of db.prepare('SELECT mes, valor, aprovado, aprovado_por, aprovado_em FROM compras_carry_aprovacao WHERE empresa_id=? AND ano=?').all(empresaId, ano)) aprovMap[a.mes] = a; } catch { /* tabela pode não existir ainda */ }

  // FEIRAS do ano: a compra da feira ANTECIPA compra futura. A verba é APORTADA no mês da feira
  // (o comprador compra muito ali, sem estourar) e ABATIDA dos meses SEGUINTES que a feira abastece
  // (meses_cobertura, informado na feira). Total anual do orçamento constante. Padrão = 3 meses.
  const feiraMap = {}; const feiraNomes = {};
  const aporteMap = Array(12).fill(0); // + no mês da feira
  const abateMap = Array(12).fill(0);  // − nos meses de cobertura seguintes
  try {
    for (const f of db.prepare('SELECT nome, data_ini, verba_planejada, meses_cobertura FROM feiras WHERE empresa_id=? AND verba_planejada IS NOT NULL').all(empresaId)) {
      const dt = String(f.data_ini || '');
      if (Number(dt.slice(0, 4)) !== ano) continue;
      const m = Number(dt.slice(5, 7)) - 1; // 0-11
      const V = Number(f.verba_planejada) || 0; if (V <= 0) continue;
      feiraMap[m + 1] = (feiraMap[m + 1] || 0) + V;
      feiraNomes[m + 1] = feiraNomes[m + 1] ? feiraNomes[m + 1] + ', ' + f.nome : f.nome;
      const N = Math.max(2, Number(f.meses_cobertura) || 3); // nº meses que a feira abastece (inclui o mês da feira)
      const seguintes = []; for (let j = 1; j < N; j++) { const mm = m + j; if (mm < 12) seguintes.push(mm); }
      if (seguintes.length) { aporteMap[m] += V; const parte = V / seguintes.length; seguintes.forEach(mm => { abateMap[mm] += parte; }); }
      // sem meses seguintes no ano: não há como amortizar neste ano → não aporta (evita inflar o ano).
    }
  } catch { /* tabela feiras pode não existir ainda */ }
  const orcMesAno = proj.map(p => (cmvUsado != null ? Math.round(p.valor * cmvUsado / 100) : 0)); // 12 meses
  const reservaFeira = Object.values(feiraMap).reduce((s, v) => s + (Number(v) || 0), 0);
  const abateFeiraMes = k => Math.round(abateMap[k] || 0);
  const aporteFeiraMes = k => Math.round(aporteMap[k] || 0);

  // Tabela dos próximos 6 meses + fluxo de compra.
  // SALDO = orçamento de compra AJUSTADO pela feira (+ arrasto) − comprometido (boletos CMV a pagar no mês).
  // Positivo = ainda há espaço no orçamento para comprar; negativo = os compromissos já
  // superam o orçamento do mês → o excedente empurra para o mês seguinte (aprovação do Diretor).
  const linhas = []; const fluxo = [];
  let carry = 0;
  for (let off = 0; off < 6; off++) {
    const dt = new Date(ano, mesIdx + off, 1);
    const ano2 = dt.getFullYear(), k = dt.getMonth(), mesNum = k + 1;   // k = mês (0..11) do ano2
    const sameYear = ano2 === ano;
    const metaV = metaVenda[`${ano2}-${pad2(mesNum)}`];
    // venda projetada do mês: META da rede (se houver) → projeção do próprio ano → 0 (ano futuro sem meta)
    let venda = 0, real = false, parcial = false, realizadoParcial = null, diaParcial = null, diasMes = null;
    if (metaV != null) { venda = metaV; }
    else if (sameYear) { const p = proj[k]; venda = p.valor; real = p.real; parcial = !!p.parcial; realizadoParcial = p.parcial ? Math.round(p.realizado) : null; diaParcial = p.parcial ? p.dia : null; diasMes = p.parcial ? p.dias : null; }
    // Ano seguinte sem meta (ex.: comprador, que não tem meta de venda própria): projeta pelo MESMO mês
    // do ano atual (ano passado × crescimento) ou, na falta, pela média recente — para não zerar o mês.
    else { const anoAnt = cur[k] > 0 ? cur[k] : mediaRecente; venda = anoAnt * Math.pow(1 + gMeta, ano2 - ano); }
    const orc = cmvUsado != null ? Math.round(venda * cmvUsado / 100) : 0;
    linhas.push({
      mes: MESES[k], mesNum, ano: ano2, real, parcial, realizadoParcial, diaParcial, diasMes,
      anoPassado: sameYear ? (prev[k] || 0) : 0, projecao: Math.round(venda),
      orcamento: cmvUsado != null ? orc : null, viaMeta: metaV != null,
    });
    const comp = comprometido.get(`${ano2}-${mesNum}`) || { valor: 0, contas: 0 };
    const aporteFeira = sameYear ? aporteFeiraMes(k) : 0;                   // verba da feira aportada NESTE mês (compra antecipada)
    const abateFeira = sameYear ? abateFeiraMes(k) : 0;                     // parte abatida deste mês (já foi comprada na feira)
    const orcAjustado = orc - abateFeira + aporteFeira;                     // orçamento do mês após a redistribuição da feira
    const carryEntrada = carry;
    const desejado = orcAjustado + carryEntrada;                           // orçamento de compra ajustado do mês + arrasto
    const saldoM = desejado - comp.valor;                                  // sobra após comprometido
    const cabe = Math.max(0, saldoM);
    const excedente = Math.max(0, -saldoM);
    const sem = orcAjustado <= 0 ? 'cinza' : saldoM < 0 ? 'vermelho' : saldoM < desejado * 0.15 ? 'amarelo' : 'verde';
    const ap = sameYear ? aprovMap[mesNum] : null;
    fluxo.push({
      mes: MESES[k], mesNum, ano: ano2,
      projecao: Math.round(venda), viaMeta: metaV != null,
      orcamento: orc, orcamentoAjustado: Math.round(orcAjustado),
      carryEntrada: Math.round(carryEntrada), desejado: Math.round(desejado),
      comprometido: comp.valor, contas: comp.contas,
      aporteFeira, abateFeira: Math.round(abateFeira),
      feiraVerba: aporteFeira, feiraNomes: sameYear ? (feiraNomes[mesNum] || null) : null,
      saldo: Math.round(saldoM), cabe: Math.round(cabe),
      excedente: Math.round(excedente), semaforo: sem,
      carrySaida: Math.round(excedente),
      carryAprovado: excedente > 0 ? !!(ap && ap.aprovado) : null,
      carryAprovadoEm: ap && ap.aprovado ? ap.aprovado_em : null,
    });
    carry = excedente;
  }
  // Semáforo 1 (mês corrente): orçamento do mês (ajustado pela feira) − comprado no mês − pedidos pendentes.
  const orcMes = (cmvUsado != null ? orcMesAno[mesIdx] : 0) - abateFeiraMes(mesIdx) + aporteFeiraMes(mesIdx);
  const saldo = orcMes - comprado.mes - pendentes.valor;
  const semaforo = orcMes <= 0 ? 'cinza' : saldo < 0 ? 'vermelho' : saldo < orcMes * 0.15 ? 'amarelo' : 'verde';
  // ALERTA: estourou o orçamento do mês SEM ter feira para justificar (a feira antecipa compra e é esperada).
  const temFeiraMes = (feiraMap[mesIdx + 1] || 0) > 0;
  const estourouSemFeira = saldo < 0 && !temFeiraMes;

  return {
    erp: true, ano, mes, mesNome: MESES[mesIdx],
    cmv: { real: cmvReal, meta: cfg.cmv_meta ?? null, usado: cmvUsado },
    projecaoBase: base, crescimentoYTD: fator != null ? Math.round((fator - 1) * 1000) / 10 : null,
    linhas, fluxo,
    mesCorrente: {
      orcamento: Math.round(orcMes), comprado: Math.round(comprado.mes),
      pendentes: pendentes.valor, pendentesQtd: pendentes.qtd,
      saldo: Math.round(saldo), semaforo,
      temFeira: temFeiraMes, aporteFeira: aporteFeiraMes(mesIdx), estourouSemFeira,
    },
    compradoYTD: Math.round(comprado.ytd),
    escopoComprador, rateioComprometido: escopoComprador ? Math.round(rateio * 1000) / 10 : null,
    reservaFeira: Math.round(reservaFeira), // total anual de verba de feira redistribuída
  };
}

function salvarConfig(empresaId, { cmv_meta, crescimento_meta, dias_transf_aceitavel }) {
  const at = getConfig(empresaId);
  db.prepare(`INSERT INTO compras_config (empresa_id, cmv_meta, crescimento_meta, dias_transf_aceitavel, atualizado_em)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id) DO UPDATE SET cmv_meta=excluded.cmv_meta, crescimento_meta=excluded.crescimento_meta,
      dias_transf_aceitavel=excluded.dias_transf_aceitavel, atualizado_em=excluded.atualizado_em`)
    .run(empresaId,
      cmv_meta === '' || cmv_meta == null ? null : Number(cmv_meta),
      crescimento_meta === '' || crescimento_meta == null ? (at.crescimento_meta ?? null) : Number(crescimento_meta),
      dias_transf_aceitavel == null ? (at.dias_transf_aceitavel ?? 7) : Number(dias_transf_aceitavel));
  return getConfig(empresaId);
}

module.exports = { orcamentoCompra, getConfig, salvarConfig };
