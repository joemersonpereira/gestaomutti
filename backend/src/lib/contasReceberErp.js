// contasReceberErp.js — Contas a Receber (snapshot do que está EM ABERTO no ERP): crediário, cartão e PBM.
// "A receber" = status='A' (aberto) em cada tabela; aging por datavencimento vs hoje.
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');

const round = n => Math.round((Number(n) || 0) * 100) / 100;
// buckets de aging a partir de linhas {venc, dias_atraso, valor}
function agingVazio() { return { aVencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0, vencidoTotal: 0 }; }
function acumulaAging(ag, atraso, valor) {
  const v = Number(valor) || 0; ag.total += v;
  if (atraso <= 0) ag.aVencer += v;
  else { ag.vencidoTotal += v; if (atraso <= 30) ag.d1_30 += v; else if (atraso <= 60) ag.d31_60 += v; else if (atraso <= 90) ag.d61_90 += v; else ag.d90 += v; }
}
function fechaAging(ag) { for (const k in ag) ag[k] = round(ag[k]); return ag; }

// ── Crediário a receber ─────────────────────────────────────────────────────
async function crediario(empresaId, { lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const [tot, porCliente, porMes] = await Promise.all([
    erpQuery(`SELECT (cr.datavencimento::date - CURRENT_DATE) dias, cr.valor::float8 valor FROM crediarioreceber cr
      WHERE cr.status='A' AND cr.unidadenegocioid = ANY($1::bigint[])`, [unis]),
    erpQuery(`SELECT COALESCE(c.nome, p.nome, 'Cliente '||cr.clienteid) cliente,
        count(*) titulos, sum(cr.valor)::float8 total,
        sum(CASE WHEN cr.datavencimento < CURRENT_DATE THEN cr.valor ELSE 0 END)::float8 vencido
      FROM crediarioreceber cr
      LEFT JOIN cliente cl ON cl.id=cr.clienteid LEFT JOIN pessoa c ON c.id=cl.pessoaid
      LEFT JOIN pessoa p ON p.id=cr.pessoaid
      WHERE cr.status='A' AND cr.unidadenegocioid = ANY($1::bigint[])
      GROUP BY 1 ORDER BY total DESC LIMIT 30`, [unis]),
    erpQuery(`SELECT to_char(cr.datavencimento,'YYYY-MM') mes, sum(cr.valor)::float8 total FROM crediarioreceber cr
      WHERE cr.status='A' AND cr.unidadenegocioid = ANY($1::bigint[])
      GROUP BY 1 ORDER BY 1`, [unis]),
  ]);
  const ag = agingVazio();
  for (const r of tot) acumulaAging(ag, -Number(r.dias), r.valor);
  return { ok: true, aging: fechaAging(ag), titulos: tot.length,
    porCliente: porCliente.map(c => ({ cliente: (c.cliente || '').trim(), titulos: Number(c.titulos), total: round(c.total), vencido: round(c.vencido) })),
    porVencimento: porMes.map(m => ({ mes: m.mes, total: round(m.total) })) };
}

// ── Cartão a receber (por bandeira/modalidade) ──────────────────────────────
// diasEmissao: só títulos emitidos nos últimos N dias (0 = todos). Cartão status='A' acumula backlog
// antigo de conciliação (emissão desde 2006); por padrão olhamos os últimos 90 dias (recebível real).
async function cartao(empresaId, { lojaId, diasEmissao = 90 } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const CONC = { A: 'não conciliado', B: 'conciliado', C: 'conciliado/baixa', E: 'erro' };
  const dias = Math.max(0, Number(diasEmissao) || 0);
  const fEmis = dias ? 'AND cr.dataemissao >= CURRENT_DATE - make_interval(days => $2::int)' : '';
  const p = dias ? [unis, dias] : [unis];
  const [tot, porBandeira, porConc, porCred] = await Promise.all([
    erpQuery(`SELECT (cr.datavencimento::date - CURRENT_DATE) dias, cr.valor::float8 valor, cr.taxa::float8 taxa FROM cartaoreceber cr
      WHERE cr.status='A' AND cr.unidadenegocioid = ANY($1::bigint[]) ${fEmis}`, p),
    erpQuery(`SELECT COALESCE(mc.nome,'—') bandeira, count(*) titulos, sum(cr.valor)::float8 total,
        sum(cr.valor*cr.taxa/100.0)::float8 taxa_total,
        sum(CASE WHEN cr.datavencimento < CURRENT_DATE THEN cr.valor ELSE 0 END)::float8 vencido
      FROM cartaoreceber cr LEFT JOIN modalidadecartao mc ON mc.id=cr.modalidadecartaoid
      WHERE cr.status='A' AND cr.unidadenegocioid = ANY($1::bigint[]) ${fEmis}
      GROUP BY 1 ORDER BY total DESC`, p),
    erpQuery(`SELECT COALESCE(cr.statusconciliacao,'?') sc, count(*) titulos, sum(cr.valor)::float8 total
      FROM cartaoreceber cr WHERE cr.status='A' AND cr.unidadenegocioid = ANY($1::bigint[]) ${fEmis}
      GROUP BY 1 ORDER BY total DESC`, p),
    // Por CREDENCIADORA (operadora): resolvida pela última conciliação do título.
    // Não conciliados ainda não têm credenciadora casada → caem em "(não conciliado)".
    erpQuery(`SELECT COALESCE(op.nome,'(não conciliado)') credenciadora, count(*) titulos, sum(cr.valor)::float8 total,
        sum(cr.valor*cr.taxa/100.0)::float8 taxa_total,
        sum(CASE WHEN cr.datavencimento < CURRENT_DATE THEN cr.valor ELSE 0 END)::float8 vencido
      FROM cartaoreceber cr
      LEFT JOIN conciliacaocartaoitem it ON it.id = cr.ultimaconciliacaocartaoitemid
      LEFT JOIN conciliacaocartao cc ON cc.id = it.conciliacaocartaoid
      LEFT JOIN conciliacaocartaooperadora op ON op.id = cc.conciliacaocartaooperadoraid
      WHERE cr.status='A' AND cr.unidadenegocioid = ANY($1::bigint[]) ${fEmis}
      GROUP BY 1 ORDER BY total DESC`, p),
  ]);
  const ag = agingVazio(); let taxaTotal = 0;
  for (const r of tot) { acumulaAging(ag, -Number(r.dias), r.valor); taxaTotal += (Number(r.valor) || 0) * (Number(r.taxa) || 0) / 100; }
  return { ok: true, aging: fechaAging(ag), titulos: tot.length, taxaTotal: round(taxaTotal), diasEmissao: dias,
    porBandeira: porBandeira.map(b => ({ bandeira: (b.bandeira || '').trim(), titulos: Number(b.titulos), total: round(b.total), taxa: round(b.taxa_total), vencido: round(b.vencido) })),
    porCredenciadora: porCred.map(c => ({ credenciadora: (c.credenciadora || '').trim(), titulos: Number(c.titulos), total: round(c.total), taxa: round(c.taxa_total), vencido: round(c.vencido) })),
    porConciliacao: porConc.map(c => ({ status: CONC[c.sc] || c.sc, cod: c.sc, titulos: Number(c.titulos), total: round(c.total) })) };
}

// ── PBM a receber (por programa) + reposição pendente (vencidos) ────────────
async function pbm(empresaId, { lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const [tot, porPbm] = await Promise.all([
    erpQuery(`SELECT (pr.datavencimento::date - CURRENT_DATE) dias, pr.valor::float8 valor FROM pbmreceber pr
      WHERE pr.status='A' AND pr.unidadenegocioid = ANY($1::bigint[])`, [unis]),
    erpQuery(`SELECT COALESCE(pb.nome,'—') pbm, count(*) titulos, sum(pr.valor)::float8 total,
        sum(CASE WHEN pr.datavencimento < CURRENT_DATE THEN pr.valor ELSE 0 END)::float8 vencido,
        min(pr.dataemissao) emissao_mais_antiga
      FROM pbmreceber pr LEFT JOIN pbm pb ON pb.id=pr.pbmid
      WHERE pr.status='A' AND pr.unidadenegocioid = ANY($1::bigint[])
      GROUP BY 1 ORDER BY total DESC`, [unis]),
  ]);
  const ag = agingVazio();
  for (const r of tot) acumulaAging(ag, -Number(r.dias), r.valor);
  return { ok: true, aging: fechaAging(ag), titulos: tot.length,
    porPbm: porPbm.map(p => ({ pbm: (p.pbm || '').trim(), titulos: Number(p.titulos), total: round(p.total), vencido: round(p.vencido), maisAntiga: p.emissao_mais_antiga })) };
}

// Resumo consolidado (cards do topo)
async function resumo(empresaId, { lojaId } = {}) {
  const [c, k, p] = await Promise.all([crediario(empresaId, { lojaId }), cartao(empresaId, { lojaId }), pbm(empresaId, { lojaId })]);
  const val = x => x.ok ? x.aging.total : 0; const venc = x => x.ok ? x.aging.vencidoTotal : 0;
  return {
    ok: true,
    crediario: { total: val(c), vencido: venc(c) }, cartao: { total: val(k), vencido: venc(k) }, pbm: { total: val(p), vencido: venc(p) },
    total: round(val(c) + val(k) + val(p)), vencidoTotal: round(venc(c) + venc(k) + venc(p)),
  };
}

module.exports = { crediario, cartao, pbm, resumo };
