// dlpDfc.js — DLP (Demonstrativo de Lucros e Perdas / DRE gerencial por margem de contribuição)
// e DFC (Fluxo de Caixa) em % sobre venda bruta, mês a mês. Planos de contas configuráveis por eixo.
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const db = require('../db/connection');

const CLASSES = ['variavel', 'fixa', 'despesa_nao_op', 'receita_nao_op', 'ignorar'];
const zeros = () => Array(12).fill(0);

// Classificação padrão p/ farmácia (custeio variável). O Joe ajusta depois no ⚙️ (é ele quem escolhe os planos).
function classeDefault(grupo) {
  const g = (grupo || '').toLowerCase();
  if (g.includes('fornecedor')) return 'ignorar';               // é CMV/compras — CMV vem do estoque
  // Variáveis: variam direto com a venda (impostos s/ venda, cartão/comissão, entrega/frete, embalagens)
  if (g.includes('imposto') || g.includes('tribut') || g.includes('entrega') || g.includes('frete') || g.includes('cart') || g.includes('comiss') || g.includes('embalag')) return 'variavel';
  // Não operacional: fora da operação (indenizações, investimentos/benfeitorias, sócios/pró-labore, "não operacional")
  if (g.includes('operacional') || g.includes('indeniza') || g.includes('benfeitoria') || g.includes('investimento') || g.includes('socios') || g.includes('sócios')) return 'despesa_nao_op';
  return 'fixa'; // resto: pessoal, funcionamento, terceiros, informática, telefone, limpeza, manutenção, propaganda, taxas…
}

function getConfig(empresaId) {
  const rows = db.prepare('SELECT grupo, classe FROM dre_config WHERE empresa_id=?').all(empresaId);
  const map = {}; rows.forEach(r => map[r.grupo] = r.classe);
  return map;
}
function setConfig(empresaId, itens) {
  const up = db.prepare(`INSERT INTO dre_config (empresa_id,grupo,classe,atualizado_em) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,grupo) DO UPDATE SET classe=excluded.classe, atualizado_em=excluded.atualizado_em`);
  const tx = db.transaction(() => { (itens || []).forEach(i => { if (i.grupo && CLASSES.includes(i.classe)) up.run(empresaId, i.grupo, i.classe); }); });
  tx();
  return { ok: true, salvos: (itens || []).length };
}

// Lista os grupos de despesa (nível 2) do ano com valor e a classe atual (config ou default).
async function grupos(empresaId, { ano, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const y = Number(ano) || new Date().getFullYear();
  const rows = await erpQuery(`SELECT split_part(pl.caminho,' > ',2) grupo, round(sum(cp.valor)) v
    FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C' AND pl.caminho LIKE '2 -%'
      AND cp.dataemissao >= make_date($2,1,1) AND cp.dataemissao < make_date($2+1,1,1) GROUP BY 1 ORDER BY 2 DESC`, [unis, y]);
  const cfg = getConfig(empresaId);
  return { ok: true, grupos: rows.map(r => ({ grupo: r.grupo, valor: Number(r.v) || 0, classe: cfg[r.grupo] || classeDefault(r.grupo) })) };
}

async function demonstrativos(empresaId, { ano, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const y = Number(ano) || new Date().getFullYear();
  const [vend, cmvR, caixaIn, despComp, despPago] = await Promise.all([
    // Venda por item: líquida = valortotal; desconto = valordesconto; bruta = líquida + desconto.
    erpQuery(`SELECT extract(month from v.datahorafechamento)::int m, sum(iv.valortotal) liq, sum(iv.valordesconto) descv
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
      WHERE v.status='F' AND iv.status<>'C' AND v.unidadenegocioid = ANY($1::bigint[]) AND v.datahorafechamento >= make_date($2,1,1) AND v.datahorafechamento < make_date($2+1,1,1) GROUP BY 1`, [unis, y]),
    erpQuery(`SELECT extract(month from v.datahorafechamento)::int m, sum(me.customedio*iv.quantidade) v
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND iv.status<>'C' AND v.datahorafechamento >= make_date($2,1,1) AND v.datahorafechamento < make_date($2+1,1,1) GROUP BY 1`, [unis, y]),
    erpQuery(`SELECT extract(month from pv.datahora)::int m, sum(pv.valor) v FROM pagamentovenda pv JOIN venda v ON v.id=pv.vendaid
      WHERE v.unidadenegocioid = ANY($1::bigint[]) AND v.status='F' AND pv.datahora >= make_date($2,1,1) AND pv.datahora < make_date($2+1,1,1) GROUP BY 1`, [unis, y]),
    erpQuery(`SELECT extract(month from cp.dataemissao)::int m, split_part(pl.caminho,' > ',2) grupo,
        (pl.caminho ILIKE '%IRPJ%' OR pl.caminho ILIKE '%CSLL%') is_ircsll, (pl.caminho ILIKE '%ICMS%') is_icms, sum(cp.valor) v
      FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
      WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C' AND pl.caminho LIKE '2 -%'
        AND cp.dataemissao >= make_date($2,1,1) AND cp.dataemissao < make_date($2+1,1,1) GROUP BY 1,2,3,4`, [unis, y]),
    erpQuery(`SELECT extract(month from cp.datavencimento)::int m, split_part(pl.caminho,' > ',2) grupo,
        (pl.caminho ILIKE '%IRPJ%' OR pl.caminho ILIKE '%CSLL%') is_ircsll, sum(cp.valor) v
      FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
      WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status='B' AND pl.caminho LIKE '2 -%'
        AND cp.datavencimento >= make_date($2,1,1) AND cp.datavencimento < make_date($2+1,1,1) GROUP BY 1,2,3`, [unis, y]),
  ]);
  const cfg = getConfig(empresaId);
  const classe = g => cfg[g] || classeDefault(g);

  const vendaLiquida = zeros(), descontos = zeros(), cmv = zeros(), caixaReceita = zeros();
  vend.forEach(r => { vendaLiquida[r.m - 1] = Math.round(Number(r.liq) || 0); descontos[r.m - 1] = Math.round(Number(r.descv) || 0); });
  cmvR.forEach(r => cmv[r.m - 1] = Math.round(Number(r.v) || 0));
  caixaIn.forEach(r => caixaReceita[r.m - 1] = Math.round(Number(r.v) || 0));
  const vendaBruta = vendaLiquida.map((v, i) => v + descontos[i]); // bruta = líquida + desconto concedido

  // Soma despesas por classe (competência p/ DLP, pago p/ DFC). "ignorar" (fornecedores) e IRPJ/CSLL à parte.
  const somaClasse = (rows, cl) => { const out = zeros(); rows.forEach(r => { if (r.is_ircsll) return; if (classe(r.grupo) === cl) out[r.m - 1] += Math.round(Number(r.v) || 0); }); return out; };
  const fornecedores = (rows) => { const out = zeros(); rows.forEach(r => { if ((r.grupo || '').toLowerCase().includes('fornecedor')) out[r.m - 1] += Math.round(Number(r.v) || 0); }); return out; };
  const somaIrCsll = (rows) => { const out = zeros(); rows.forEach(r => { if (r.is_ircsll) out[r.m - 1] += Math.round(Number(r.v) || 0); }); return out; };

  // ── DLP (competência) ──
  const dlpVar = somaClasse(despComp, 'variavel'), dlpFix = somaClasse(despComp, 'fixa');
  const dlpDespNaoOp = somaClasse(despComp, 'despesa_nao_op'), dlpRecNaoOp = somaClasse(despComp, 'receita_nao_op');
  const dlpIrCsll = somaIrCsll(despComp); // IRPJ+CSLL: imposto sobre o LUCRO, separado no fim
  // Impostos VARIÁVEIS (exclui IRPJ/CSLL) por VENCIMENTO — a emissão do ICMS vem em bloco num mês (ex.: fev),
  // então usamos vencimento, que é mensal e real (bate com o drill). Previsão: ICMS = média dos meses realizados;
  // PIS/COFINS/ISS/Simples = alíquota efetiva × venda.
  const impVenc = await erpQuery(`SELECT extract(month from cp.datavencimento)::int m,
      (pl.caminho ILIKE '%IRPJ%' OR pl.caminho ILIKE '%CSLL%') is_ircsll, (pl.caminho ILIKE '%ICMS%') is_icms, sum(cp.valor) v
    FROM contapagar cp JOIN planocontas pl ON pl.id=cp.planocontasid
    WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status<>'C' AND split_part(pl.caminho,' > ',2) ILIKE '%IMPOSTO%'
      AND cp.datavencimento >= make_date($2,1,1) AND cp.datavencimento < make_date($2+1,1,1) GROUP BY 1,2,3`, [unis, y]);
  const somaImp = filtro => { const out = zeros(); impVenc.forEach(r => { if (!r.is_ircsll && filtro(r)) out[r.m - 1] += Math.round(Number(r.v) || 0); }); return out; };
  const impostosVar = somaImp(() => true);      // lançado a vencer/vencido (ICMS + demais) — bate com o drill
  const icmsArr = somaImp(r => r.is_icms);
  const outrosImp = somaImp(r => !r.is_icms);   // PIS/COFINS/ISS/Simples/Retenções
  const now = new Date(); const mesAtual = (y === now.getFullYear()) ? now.getMonth() + 1 : 13; // ano passado → todos realizados
  const realizado = i => (i + 1) < mesAtual;    // meses completos anteriores ao atual
  const icmsReal = icmsArr.filter((v, i) => v > 0 && realizado(i));
  const icmsMedia = icmsReal.length ? Math.round(icmsReal.reduce((a, b) => a + b, 0) / icmsReal.length) : 0;
  let sO = 0, sVen = 0; for (let i = 0; i < 12; i++) { if (realizado(i) && outrosImp[i] > 0 && vendaLiquida[i] > 0) { sO += outrosImp[i]; sVen += vendaLiquida[i]; } }
  const aliq = sVen > 0 ? sO / sVen : 0; // alíquota efetiva dos impostos que são % da venda
  const impostosVarPrev = vendaLiquida.map(v => (v > 0 ? icmsMedia : 0) + Math.round(aliq * v));
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dlp = {
    vendaBruta, descontos, vendaLiquida, cmv,
    lucroBruto: sub(vendaLiquida, cmv),
    despVariaveis: dlpVar,
    margemContribuicao: sub(sub(vendaLiquida, cmv), dlpVar),
    despFixas: dlpFix,
    lucroOperacional: sub(sub(sub(vendaLiquida, cmv), dlpVar), dlpFix),
    receitaNaoOp: dlpRecNaoOp, despesaNaoOp: dlpDespNaoOp,
    irCsll: dlpIrCsll,
    impostosVar, impostosVarPrev, aliquotaImpostos: Math.round(aliq * 1000) / 10, icmsMedia,
  };
  dlp.lucroLiquido = dlp.lucroOperacional.map((v, i) => v + dlpRecNaoOp[i] - dlpDespNaoOp[i] - dlpIrCsll[i]);

  // ── DFC (caixa / pago no mês) ──
  const dfcForn = fornecedores(despPago); // fornecedores pagos = CMV de caixa
  const dfcVar = somaClasse(despPago, 'variavel'), dfcFix = somaClasse(despPago, 'fixa');
  const dfcDespNaoOp = somaClasse(despPago, 'despesa_nao_op'), dfcRecNaoOp = somaClasse(despPago, 'receita_nao_op');
  const dfcIrCsll = somaIrCsll(despPago);
  const dfc = {
    receita: caixaReceita, fornecedoresPagos: dfcForn,
    lucroBruto: sub(caixaReceita, dfcForn),
    despVariaveis: dfcVar,
    margemContribuicao: sub(sub(caixaReceita, dfcForn), dfcVar),
    despFixas: dfcFix,
    resultadoOperacional: sub(sub(sub(caixaReceita, dfcForn), dfcVar), dfcFix),
    receitaNaoOp: dfcRecNaoOp, despesaNaoOp: dfcDespNaoOp,
    irCsll: dfcIrCsll,
  };
  dfc.resultadoAjustado = dfc.resultadoOperacional.map((v, i) => v + dfcRecNaoOp[i] - dfcDespNaoOp[i] - dfcIrCsll[i]);

  return { ok: true, ano: y, lojaId: lojaId || null, dlp, dfc };
}

module.exports = { grupos, getConfig, setConfig, classeDefault, demonstrativos, CLASSES };
