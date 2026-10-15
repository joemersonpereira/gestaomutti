// lib/indicadoresErp.js — Indicadores comerciais da LOJA, AO VIVO do ERP.
// Regras idênticas às validadas no relatório mensal (Planilha Artur):
//   - vitaminas/kits: unidades de itemvenda em planoremuneracaobonificacaoembalagem
//   - rep gen/sim e ético: participação por classificação (2º nível do caminho)
//   - nº clientes: count de vendas status 'F'
//   - ticket: faturamento status F / nº clientes
//   - CMV: custo (movimentacaoestoque) sobre venda
// Tudo por unidadenegocio e por mês (datahorafechamento). Cache + fallback null.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { faixaMes } = require('./vendasErp');

const PLANO_VIT = 7473609, PLANO_KIT = 7474159;
const PLANO_PREMIACAO = 7471756, PLANO_UV = 7471976; // Premiação (comissão) e Unidades Vendidas (bonificação)
const PBM_FIDELIDADE = [3575250, 200000001015]; // PEC MULTIMAIS / PEC ULTRAPOPULAR — fidelidade, NÃO são PBM
const TTL = parseInt(process.env.ERP_CACHE_TTL || '120', 10) * 1000;
const cache = new Map();
function getC(k){ const e=cache.get(k); if(e&&e.exp>Date.now()) return e.val; if(e) cache.delete(k); return undefined; }
function setC(k,v){ if(TTL>0) cache.set(k,{exp:Date.now()+TTL,val:v}); return v; }

// Indicadores de uma loja no mês. Retorna null se ERP indisponível/sem vínculo.
async function indicadoresLojaMes(lojaId, mes, ano) {
  const k = `ind:${lojaId}:${mes}:${ano}`;
  const c = getC(k); if (c !== undefined) return c;

  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  if (!habilitado() || !uni) return setC(k, null);

  try {
    const [ini, fim] = faixaMes(mes, ano);
    // 1) Nº clientes (status F) + faturamento F (para ticket) + CMV
    const base = (await erpQuery(`
      WITH b AS (
        SELECT v.status st, iv.valortotal vt, me.custo cu, abs(me.quantidade) q
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
          JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
        WHERE v.status IN ('F','D') AND iv.status='F'
          AND v.datahorafechamento>=$1 AND v.datahorafechamento<$2 AND v.unidadenegocioid=$3)
      SELECT (SELECT count(*) FROM venda WHERE status='F' AND datahorafechamento>=$1 AND datahorafechamento<$2 AND unidadenegocioid=$3) clientes,
             (SELECT count(*) FROM venda WHERE status='F' AND datahorafechamento>=$1 AND datahorafechamento<$2 AND unidadenegocioid=$3 AND (pessoaid IS NOT NULL OR (cpfcnpj IS NOT NULL AND cpfcnpj<>''))) identificadas,
             100*sum(cu*q)/nullif(sum(vt),0) cmv,
             sum(vt) FILTER (WHERE st='F') fat_f
      FROM b`, [ini, fim, uni]))[0] || {};
    const clientes = Number(base.clientes) || 0;
    const identificacao = clientes ? Math.round((Number(base.identificadas) || 0) / clientes * 1000) / 10 : null;
    const cmv = base.cmv != null ? Number(base.cmv) : null;
    const ticket = clientes ? (Number(base.fat_f) || 0) / clientes : 0;

    // 2) Representatividade por classificação (gen/sim e ético)
    const rep = { PROPAGADO:0, GENERICO:0, SIMILAR:0, 'SUPLEMENTO ALIMENTAR':0 };
    const repRows = await erpQuery(`
      SELECT split_part(cl.caminho,' > ',2) cat, sum(iv.valortotal) val
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
        JOIN embalagem e ON e.id=iv.embalagemid
        JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid
        JOIN classificacao cl ON cl.id=cp.classificacaoid AND cl.caminho LIKE 'PRINCIPAL >%'
      WHERE v.status='F' AND iv.status='F' AND v.datahorafechamento>=$1 AND v.datahorafechamento<$2
        AND v.unidadenegocioid=$3 GROUP BY 1`, [ini, fim, uni]);
    for (const r of repRows) if (r.cat in rep) rep[r.cat] = Number(r.val) || 0;
    const baseRep = rep.PROPAGADO + rep.GENERICO + rep.SIMILAR + rep['SUPLEMENTO ALIMENTAR'];
    const repGenSim = baseRep > 0 ? Math.round(100*(rep.GENERICO+rep.SIMILAR)/baseRep) : null;
    const repEtico  = baseRep > 0 ? Math.round(100*rep.PROPAGADO/baseRep) : null;

    // 3) Vitaminas / Kits (unidades)
    const vk = (await erpQuery(`
      WITH be AS (SELECT planoremuneracaoid, embalagemid FROM planoremuneracaobonificacaoembalagem WHERE planoremuneracaoid IN ($1,$2))
      SELECT coalesce(sum(iv.quantidade) FILTER (WHERE be.planoremuneracaoid=$1),0) vit,
             coalesce(sum(iv.quantidade) FILTER (WHERE be.planoremuneracaoid=$2),0) kit
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN be ON be.embalagemid=iv.embalagemid
      WHERE v.status='F' AND iv.status='F' AND v.datahorafechamento>=$3 AND v.datahorafechamento<$4 AND v.unidadenegocioid=$5`,
      [PLANO_VIT, PLANO_KIT, ini, fim, uni]))[0] || {};

    // Filipeta (Trivio) — conversão e total vendido da loja no mês (se disponível).
    let filipeta = null;
    try { filipeta = require('./trivioPdv').filipetaLojaSync(lojaId, mes, ano); } catch { /* trivio off */ }

    return setC(k, {
      clientes,
      identificacao,
      cmv: cmv != null ? Math.round(cmv*100)/100 : null,
      ticket: Math.round(ticket*100)/100,
      rep_gensim: repGenSim,
      rep_etico: repEtico,
      vitaminas: Number(vk.vit) || 0,
      kits: Number(vk.kit) || 0,
      filipeta, // { conversao, totalVendido, convertidas } ou null
      fonte: 'erp',
    });
  } catch (e) {
    console.error(`[ERP] falha em indicadoresLojaMes(${lojaId}):`, e.message);
    return setC(k, null);
  }
}

// ── Indicadores POR VENDEDOR que o ERP consegue medir ───────────────────────
// Hoje: `identificacao` (% de vendas com cliente identificado) e `vitaminas`
// (unidades do plano de vitaminas). Os demais (cadastro, PBM, campanhas) são
// internos do Mutti e continuam manuais.
// Retorna { colaboradorId: { identificacao: pct, vitaminas: unidades } }.
async function indicadoresVendedoresLojaMes(lojaId, mes, ano) {
  const k = `indvend:${lojaId}:${mes}:${ano}`;
  const c = getC(k); if (c !== undefined) return c;

  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  const colabs = db.prepare('SELECT id, erp_pessoa_id FROM colaboradores WHERE loja_id=? AND erp_pessoa_id IS NOT NULL AND ativo=1').all(lojaId);
  const porPessoa = new Map(colabs.map(c => [Number(c.erp_pessoa_id), c.id]));
  const out = {};
  if (!habilitado() || !uni || !colabs.length) return setC(k, out);

  try {
    const [ini, fim] = faixaMes(mes, ano);
    const pessoas = colabs.map(c => Number(c.erp_pessoa_id));
    const rows = await erpQuery(`
      WITH vs AS (
        SELECT u.pessoaid, v.pessoaid AS cliente
        FROM venda v LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(o.usuarioid,v.usuarioid)
        WHERE v.unidadenegocioid=$1 AND v.status IN ('F','D')
          AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3 AND u.pessoaid = ANY($4::bigint[])
      ),
      ident AS (
        SELECT pessoaid, count(*) vendas, count(*) FILTER (WHERE cliente IS NOT NULL) com_cliente
        FROM vs GROUP BY pessoaid
      ),
      vit AS (
        SELECT u.pessoaid, COALESCE(SUM(iv.quantidade),0) un
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)
          JOIN planoremuneracaobonificacaoembalagem b ON b.embalagemid=iv.embalagemid AND b.planoremuneracaoid=$5
        WHERE v.unidadenegocioid=$1 AND v.status='F' AND iv.status='F'
          AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3 AND u.pessoaid = ANY($4::bigint[])
        GROUP BY u.pessoaid
      )
      SELECT i.pessoaid, i.vendas, i.com_cliente, COALESCE(vt.un,0) vitaminas
      FROM ident i LEFT JOIN vit vt ON vt.pessoaid=i.pessoaid
    `, [uni, ini, fim, pessoas, PLANO_VIT]);
    for (const r of rows) {
      const id = porPessoa.get(Number(r.pessoaid));
      if (!id) continue;
      const vendas = Number(r.vendas) || 0;
      out[id] = {
        identificacao: vendas ? Math.round((Number(r.com_cliente) / vendas) * 1000) / 10 : 0,
        vitaminas: Number(r.vitaminas) || 0,
      };
    }

    // Campanhas = unidades vendidas dos itens dos cadernos de oferta selecionados.
    const cadernos = cadernosSelecionados();
    if (cadernos.length) {
      colabs.forEach(c => { out[c.id] = out[c.id] || {}; out[c.id].campanha = 0; }); // ERP é autoridade
      const camp = await erpQuery(`
        SELECT u.pessoaid, COALESCE(SUM(iv.quantidade),0) un
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)
        WHERE iv.embalagemid IN (SELECT DISTINCT embalagemid FROM itemcadernooferta WHERE cadernoofertaid = ANY($1::bigint[]))
          AND v.status='F' AND iv.status='F' AND v.unidadenegocioid=$2
          AND v.datahorafechamento >= $3 AND v.datahorafechamento < $4 AND u.pessoaid = ANY($5::bigint[])
        GROUP BY u.pessoaid`, [cadernos.map(Number), uni, ini, fim, pessoas]);
      for (const r of camp) { const id = porPessoa.get(Number(r.pessoaid)); if (id) out[id].campanha = Number(r.un) || 0; }
    }

    // PBM = aderência: itens que passaram por PBM ÷ itens elegíveis (embalagem em programa PBM).
    // Exclui PEC (fidelidade, não é PBM). Farmácia Popular (349) só conta se a loja tiver.
    const temFp = !!(db.prepare('SELECT tem_farmacia_popular FROM lojas WHERE id=?').get(lojaId) || {}).tem_farmacia_popular;
    const semFpElig = temFp ? '' : 'AND pp.pbmid <> 349';
    const semFpVia = temFp ? '' : 'AND iv.pbmid <> 349';
    colabs.forEach(c => { out[c.id] = out[c.id] || {}; }); // garante objeto
    const pbmRows = await erpQuery(`
      WITH elig AS (
        SELECT DISTINCT ip.embalagemid FROM itemprogramapbm ip JOIN programapbm pp ON pp.id=ip.programapbmid
        WHERE ip.status='A' AND pp.status='A' AND pp.pbmid NOT IN (${PBM_FIDELIDADE.join(',')}) ${semFpElig}
      )
      SELECT u.pessoaid,
        count(*) FILTER (WHERE iv.pbmid IS NOT NULL AND iv.pbmid NOT IN (${PBM_FIDELIDADE.join(',')}) ${semFpVia}) via,
        count(*) FILTER (WHERE iv.embalagemid IN (SELECT embalagemid FROM elig)
                           OR (iv.pbmid IS NOT NULL AND iv.pbmid NOT IN (${PBM_FIDELIDADE.join(',')}) ${semFpVia})) eleg
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
        LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)
      WHERE v.unidadenegocioid=$1 AND v.status='F' AND iv.status='F'
        AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3 AND u.pessoaid = ANY($4::bigint[])
      GROUP BY u.pessoaid`, [uni, ini, fim, pessoas]);
    for (const r of pbmRows) {
      const id = porPessoa.get(Number(r.pessoaid)); if (!id) continue;
      const eleg = Number(r.eleg) || 0;
      out[id].pbm = eleg ? Math.round((Number(r.via) / eleg) * 100) : 100; // sem elegíveis → nada a converter
    }

    return setC(k, out);
  } catch (e) {
    console.error(`[ERP] falha em indicadoresVendedoresLojaMes(${lojaId}):`, e.message);
    return setC(k, out);
  }
}

// CMV (%) por VENDEDOR no mês — custo (movimentacaoestoque) sobre venda, por vendedor.
// Retorna { colaboradorId: cmvPct }. Usado pela loja de pontos (CMV abaixo do limite).
async function cmvVendedoresLojaMes(lojaId, mes, ano) {
  const k = `cmvvend:${lojaId}:${mes}:${ano}`;
  const c = getC(k); if (c !== undefined) return c;
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  const colabs = db.prepare('SELECT id, erp_pessoa_id FROM colaboradores WHERE loja_id=? AND erp_pessoa_id IS NOT NULL AND ativo=1').all(lojaId);
  const porPessoa = new Map(colabs.map(c => [Number(c.erp_pessoa_id), c.id]));
  const out = {};
  if (!habilitado() || !uni || !colabs.length) return setC(k, out);
  try {
    const [ini, fim] = faixaMes(mes, ano);
    const pessoas = colabs.map(c => Number(c.erp_pessoa_id));
    const rows = await erpQuery(`
      WITH b AS (
        SELECT u.pessoaid, iv.valortotal vt, me.custo cu, abs(me.quantidade) q
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
          JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
          LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid LEFT JOIN orcamento o ON o.id=v.orcamentoid
          JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)
        WHERE v.status IN ('F','D') AND iv.status='F'
          AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3 AND v.unidadenegocioid=$1
          AND u.pessoaid = ANY($4::bigint[]))
      SELECT pessoaid, 100*sum(cu*q)/nullif(sum(vt),0) cmv FROM b GROUP BY pessoaid`, [uni, ini, fim, pessoas]);
    for (const r of rows) { const id = porPessoa.get(Number(r.pessoaid)); if (id && r.cmv != null) out[id] = Math.round(Number(r.cmv) * 100) / 100; }
    return setC(k, out);
  } catch (e) { console.error(`[ERP] falha em cmvVendedoresLojaMes(${lojaId}):`, e.message); return setC(k, out); }
}

// Prewarm + acessor síncrono (mesmo padrão do vendasErp).
async function prewarmIndicadoresVendedores(lojaId, mes, ano) { await indicadoresVendedoresLojaMes(lojaId, mes, ano); }
function indicadorVendedorSync(lojaId, mes, ano, colabId, indicador) {
  const mapa = getC(`indvend:${lojaId}:${mes}:${ano}`);
  if (mapa && mapa[colabId] && mapa[colabId][indicador] != null) return mapa[colabId][indicador];
  return undefined; // sem valor do ERP → quem chama usa o manual
}
// Indicadores que vêm do ERP. 'campanha' só é automático quando há cadernos
// selecionados (senão indicadorVendedorSync devolve undefined → cai no manual).
const INDICADORES_ERP = new Set(['identificacao', 'vitaminas', 'campanha', 'pbm']);

// Cadernos de oferta selecionados para o indicador Campanhas (ids do ERP).
function cadernosSelecionados() {
  try { return db.prepare('SELECT caderno_id FROM campanha_cadernos').all().map(r => r.caderno_id); }
  catch { return []; }
}

// Lista os cadernos de oferta do ERP (ativos, vigentes desde `desdeISO`).
async function listarCadernosOferta(desdeISO) {
  if (!habilitado()) return [];
  const desde = desdeISO || `${new Date().getUTCFullYear()}-01-01`;
  try {
    const rows = await erpQuery(`
      SELECT co.id::text id, co.nome, to_char(co.datahorainicial,'YYYY-MM-DD') ini,
             to_char(co.datahorafinal,'YYYY-MM-DD') fim, count(ic.id) itens
      FROM cadernooferta co LEFT JOIN itemcadernooferta ic ON ic.cadernoofertaid=co.id
      WHERE co.status='A' AND co.datahorafinal >= $1
      GROUP BY co.id, co.nome, co.datahorainicial, co.datahorafinal
      HAVING count(ic.id) > 0
      ORDER BY co.datahorainicial DESC, co.nome`, [desde]);
    return rows.map(r => ({ id: r.id, nome: r.nome, ini: r.ini, fim: r.fim, itens: Number(r.itens) || 0 }));
  } catch (e) {
    console.error('[ERP] falha em listarCadernosOferta:', e.message);
    return [];
  }
}

// Base de premiação de UM vendedor no mês (ao vivo do ERP):
//  - premiacao_liquido = Σ itemvenda.valortotal dos itens no plano "Premiação"
//    (comissão, definido por classificações) — é sobre isso que incide o 3/4/5%.
//  - uv_remuneracao = Σ (quantidade × bonificação) do plano "Unidades Vendidas".
async function premiacaoBaseVendedor(colabId, mes, ano) {
  const zero = { premiacao_liquido: 0, uv_remuneracao: 0 };
  const col = db.prepare('SELECT erp_pessoa_id FROM colaboradores WHERE id=?').get(colabId);
  const pessoa = col && col.erp_pessoa_id;
  if (!habilitado() || !pessoa) return zero;
  try {
    const [ini, fim] = faixaMes(mes, ano);
    const r = await erpQuery(`
      WITH prem AS (
        SELECT COALESCE(SUM(iv.valortotal),0) liquido
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)
          JOIN embalagem e ON e.id=iv.embalagemid
          JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid
        WHERE cp.classificacaoid IN (SELECT classificacaoid FROM planoremuneracaocomissaoclassificacao WHERE planoremuneracaoid=$1)
          AND v.status='F' AND iv.status='F' AND u.pessoaid=$2
          AND v.datahorafechamento >= $3 AND v.datahorafechamento < $4
      ),
      uv AS (
        SELECT COALESCE(SUM(iv.quantidade*pbe.bonificacao),0) rem
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)
          JOIN planoremuneracaobonificacaoembalagem pbe ON pbe.embalagemid=iv.embalagemid AND pbe.planoremuneracaoid=$5
        WHERE v.status='F' AND iv.status='F' AND u.pessoaid=$2
          AND v.datahorafechamento >= $3 AND v.datahorafechamento < $4
      )
      SELECT (SELECT liquido FROM prem) liquido, (SELECT rem FROM uv) uv`,
      [PLANO_PREMIACAO, pessoa, ini, fim, PLANO_UV]);
    return { premiacao_liquido: Number(r[0].liquido) || 0, uv_remuneracao: Number(r[0].uv) || 0 };
  } catch (e) { console.error(`[ERP] falha em premiacaoBaseVendedor(${colabId}):`, e.message); return zero; }
}

// Base de premiação de TODOS os vendedores de uma loja (2 consultas). Vendedor por ITEM.
// Retorna { colaboradorId: { premiacao_liquido, uv_remuneracao } }.
async function premiacaoBaseVendedoresLoja(lojaId, mes, ano) {
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  const colabs = db.prepare('SELECT id, erp_pessoa_id FROM colaboradores WHERE loja_id=? AND erp_pessoa_id IS NOT NULL AND ativo=1').all(lojaId);
  const porPessoa = new Map(colabs.map(c => [Number(c.erp_pessoa_id), c.id]));
  const out = {}; colabs.forEach(c => { out[c.id] = { premiacao_liquido: 0, uv_remuneracao: 0 }; });
  if (!habilitado() || !uni || !colabs.length) return out;
  try {
    const [ini, fim] = faixaMes(mes, ano);
    const pessoas = colabs.map(c => Number(c.erp_pessoa_id));
    const seller = 'LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)';
    // Líquido do plano Premiação por vendedor
    const prem = await erpQuery(`
      SELECT u.pessoaid, COALESCE(SUM(iv.valortotal),0) liquido
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid ${seller}
        JOIN embalagem e ON e.id=iv.embalagemid JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid
      WHERE cp.classificacaoid IN (SELECT classificacaoid FROM planoremuneracaocomissaoclassificacao WHERE planoremuneracaoid=$1)
        AND v.status='F' AND iv.status='F' AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
        AND u.pessoaid = ANY($4::bigint[])
      GROUP BY u.pessoaid`, [PLANO_PREMIACAO, ini, fim, pessoas]);
    for (const r of prem) { const id = porPessoa.get(Number(r.pessoaid)); if (id) out[id].premiacao_liquido = Number(r.liquido) || 0; }
    // Remuneração do plano Unidades Vendidas por vendedor
    const uvq = await erpQuery(`
      SELECT u.pessoaid, COALESCE(SUM(iv.quantidade*pbe.bonificacao),0) rem
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid ${seller}
        JOIN planoremuneracaobonificacaoembalagem pbe ON pbe.embalagemid=iv.embalagemid AND pbe.planoremuneracaoid=$1
      WHERE v.status='F' AND iv.status='F' AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
        AND u.pessoaid = ANY($4::bigint[])
      GROUP BY u.pessoaid`, [PLANO_UV, ini, fim, pessoas]);
    for (const r of uvq) { const id = porPessoa.get(Number(r.pessoaid)); if (id) out[id].uv_remuneracao = Number(r.rem) || 0; }
    return out;
  } catch (e) { console.error(`[ERP] falha em premiacaoBaseVendedoresLoja(${lojaId}):`, e.message); return out; }
}

module.exports = {
  indicadoresLojaMes, indicadoresVendedoresLojaMes, cmvVendedoresLojaMes,
  prewarmIndicadoresVendedores, indicadorVendedorSync, INDICADORES_ERP,
  listarCadernosOferta, cadernosSelecionados, premiacaoBaseVendedor, premiacaoBaseVendedoresLoja,
};
