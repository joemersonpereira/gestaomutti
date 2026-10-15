// acordoApuracao.js — apura o RETORNO de um acordo pelas COMPRAS reais do ERP.
// Compras = nota fiscal de ENTRADA (notafiscal tipooperacao='1' status='C'). Por dimensão da condição:
//  fornecedor → nf.fornecedorid; fabricante → produto.fabricanteid; grupo_* → classificacao (subárvore);
//  produtos → escopo de EANs (embalagem.codigobarras). "exceto" (excecoes) remove EANs. Meta global ou mensal.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');

const round = n => Math.round((Number(n) || 0) * 100) / 100;
const DATECOL = { emissao: 'datahoraemissao', entrada: 'datahoraentrada', venda: 'datahoraentrada' };
function parseEans(x) {
  if (!x) return [];
  try {
    const a = JSON.parse(x);
    if (Array.isArray(a)) return a.map(v => (typeof v === 'string' ? v : (v.ean || v.codigo || v.codigobarras || ''))).map(s => String(s).replace(/\D/g, '')).filter(Boolean);
  } catch { /* texto solto */ }
  return String(x).match(/\d{6,14}/g) || [];
}
function mesesEntre(ini, fim) {
  const a = new Date(ini + 'T00:00'), b = new Date(fim + 'T00:00');
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
}

// Apura UMA condição. unis = unidades ERP das lojas do acordo (ou todas).
async function apurarCondicao(empresaId, cond, unis) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  if (!unis.length) return { ok: false, erro: 'Sem lojas mapeadas.' };
  const ini = cond.periodo_ini, fim = cond.periodo_fim;
  if (!ini || !fim) return { ok: false, erro: 'Condição sem período definido.' };
  const datecol = DATECOL[cond.apuracao] || 'datahoraentrada';
  const excs = parseEans(cond.excecoes), scope = parseEans(cond.escopo);
  const dim = cond.dimensao;
  let sql, params, semAlvo = false;

  if (dim === 'fornecedor') {
    if (!cond.alvo_id) semAlvo = true;
    params = [unis, ini, fim, cond.alvo_id];
    sql = `SELECT to_char(nf.${datecol},'YYYY-MM') mes, sum(nf.valortotal)::float8 v
      FROM notafiscal nf
      WHERE nf.tipooperacao='1' AND nf.status='C' AND nf.unidadenegocioid = ANY($1::bigint[])
        AND nf.${datecol} >= $2::date AND nf.${datecol} < ($3::date + 1) AND nf.fornecedorid = $4::bigint
      GROUP BY 1 ORDER BY 1`;
  } else {
    const filtros = []; params = [unis, ini, fim]; let p = 3;
    if (dim === 'fabricante') { if (!cond.alvo_id) semAlvo = true; params.push(cond.alvo_id); filtros.push(`pr.fabricanteid = $${++p}::bigint`); }
    else if (dim === 'produtos') { if (!scope.length) semAlvo = true; params.push(scope.length ? scope : ['']); filtros.push(`e.codigobarras = ANY($${++p}::text[])`); }
    else { // grupo_pai / grupo_filho / grupo_preco → classificacao (subárvore pelo caminho)
      if (!cond.alvo_id) semAlvo = true; params.push(cond.alvo_id);
      filtros.push(`EXISTS (SELECT 1 FROM classificacaoproduto cp JOIN classificacao cc ON cc.id=cp.classificacaoid
        JOIN classificacao pai ON pai.id = $${++p}::bigint WHERE cp.produtoid=pr.id AND cc.caminho LIKE pai.caminho || '%')`);
    }
    if (excs.length) { params.push(excs); filtros.push(`(e.codigobarras IS NULL OR e.codigobarras <> ALL($${++p}::text[]))`); }
    sql = `SELECT to_char(nf.${datecol},'YYYY-MM') mes, sum(i.valortotal)::float8 v
      FROM itemnotafiscal i JOIN notafiscal nf ON nf.id=i.notafiscalid
        JOIN embalagem e ON e.id=i.embalagemid JOIN produto pr ON pr.id=e.produtoid
      WHERE nf.tipooperacao='1' AND nf.status='C' AND nf.unidadenegocioid = ANY($1::bigint[])
        AND nf.${datecol} >= $2::date AND nf.${datecol} < ($3::date + 1)
        ${filtros.length ? 'AND ' + filtros.join(' AND ') : ''}
      GROUP BY 1 ORDER BY 1`;
  }
  const rows = semAlvo ? [] : await erpQuery(sql, params);
  const realizado = round(rows.reduce((a, r) => a + (Number(r.v) || 0), 0));
  const pct = Number(cond.percentual) || 0;
  const nMeses = mesesEntre(ini, fim);
  const mensal = cond.periodo === 'mensal';
  const metaMensal = mensal ? (Number(cond.meta_mensal) || 0) : null;
  const meta = mensal ? metaMensal * nMeses : (Number(cond.meta_global) || Number(cond.valor) || 0);

  // por mês: realizado vs meta mensal (se houver)
  const porMes = rows.map(r => {
    const comprado = round(Number(r.v) || 0);
    return { mes: r.mes, comprado, meta: metaMensal, atingiu: metaMensal ? comprado >= metaMensal : null, retorno: round(comprado * pct / 100) };
  });

  return {
    ok: true, dimensao: dim, alvo: cond.alvo_nome || null, apuracao: cond.apuracao || 'entrada', periodo: { ini, fim }, nMeses,
    percentual: pct, mensal, metaMensal,
    realizado, meta: round(meta),
    atingimento: meta > 0 ? round(100 * realizado / meta) : null,
    retornoAtingido: round(realizado * pct / 100),
    retornoEsperado: round(meta * pct / 100),
    porMes, semAlvo,
  };
}

// Unidades ERP das lojas de um acordo (ou todas da empresa se não houver lojas no acordo).
function unisDoAcordo(empresaId, acordoId) {
  const lojas = db.prepare('SELECT loja_id FROM acordo_lojas WHERE empresa_id=? AND acordo_id=?').all(empresaId, acordoId).map(r => r.loja_id);
  if (!lojas.length) return unisEmpresa(empresaId, null);
  const set = new Set();
  for (const lid of lojas) for (const u of unisEmpresa(empresaId, lid)) set.add(u);
  return [...set];
}

// Apura o ACORDO inteiro (todas as condições) + consolidado.
async function apurarAcordo(empresaId, acordoId) {
  const acordo = db.prepare('SELECT * FROM acordos WHERE id=? AND empresa_id=?').get(acordoId, empresaId);
  if (!acordo) return { ok: false, erro: 'Acordo não encontrado.' };
  const conds = db.prepare('SELECT * FROM acordo_condicoes WHERE acordo_id=?').all(acordoId);
  const unis = unisDoAcordo(empresaId, acordoId);
  const itens = [];
  for (const c of conds) {
    const ap = await apurarCondicao(empresaId, c, unis).catch(e => ({ ok: false, erro: e.message }));
    itens.push({ condicao: { id: c.id, descricao: c.descricao, dimensao: c.dimensao, alvo_nome: c.alvo_nome, percentual: c.percentual }, apuracao: ap });
  }
  const okItens = itens.filter(i => i.apuracao.ok);
  const consolidado = {
    comprado: round(okItens.reduce((a, i) => a + (i.apuracao.realizado || 0), 0)),
    meta: round(okItens.reduce((a, i) => a + (i.apuracao.meta || 0), 0)),
    retornoAtingido: round(okItens.reduce((a, i) => a + (i.apuracao.retornoAtingido || 0), 0)),
    retornoEsperado: round(okItens.reduce((a, i) => a + (i.apuracao.retornoEsperado || 0), 0)),
  };
  consolidado.atingimento = consolidado.meta > 0 ? round(100 * consolidado.comprado / consolidado.meta) : null;
  consolidado.aReceber = round(consolidado.retornoAtingido); // ainda não baixado (integração de pagamento é outra etapa)
  return { ok: true, acordo: { id: acordo.id, codigo: acordo.codigo }, condicoes: itens, consolidado, unidades: unis.length };
}

module.exports = { apurarCondicao, apurarAcordo, unisDoAcordo, parseEans, mesesEntre };
