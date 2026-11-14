// precificacaoErp.js — área de Precificação (Joe 2026-11-12). Indicadores de preço, do espelho do ERP:
//  • vendido ABAIXO DO CUSTO (venda < custo) — perda direta.
//  • vendido ABAIXO DA MARGEM mínima (margem < alvo).
//  • COMPRADO mais caro / mais barato que a ÚLTIMA entrada (variação de custo de compra).
// Escopo opcional por COMPRADOR (classificações dele). Fluxo de CORREÇÃO: o comprador marca "corrigido".
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const { produtosDoComprador } = require('./indicadoresCompraErp');
const db = require('../db/connection');

const ri = v => Math.round(Number(v) || 0);
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const pfClause = (prodIds, pos) => prodIds ? ` AND em.produtoid = ANY($${pos}::bigint[])` : '';
// Janela de tempo: por datas (ini..fim, inclusivo) OU "últimos N dias". `idx` = índice do 1º param dela.
// Retorna a cláusula SQL + os params a anexar. Permite Hoje/Mês atual/Mês passado/datas na Precificação.
function janela(campo, { dias = 30, ini = '', fim = '' } = {}, idx) {
  if (ini && fim) return { clause: `${campo} >= $${idx}::timestamp AND ${campo} < ($${idx + 1}::date + interval '1 day')`, extra: [ini, fim] };
  return { clause: `${campo} >= now() - ($${idx} || ' days')::interval`, extra: [String(dias)] };
}
function nomeLoja(uni) { const r = db.prepare('SELECT nome FROM lojas WHERE erp_unidadenegocio_id=?').get(uni); return r ? r.nome : String(uni); }

// Produtos de uma classificação (e subníveis, via caminho LIKE) — p/ o filtro por classificação.
async function produtosDaClassificacao(classificacaoId) {
  const rows = await erpQuery(`SELECT DISTINCT cp.produtoid FROM classificacaoproduto cp
    JOIN classificacao cc ON cc.id=cp.classificacaoid
    WHERE cc.caminho LIKE (SELECT caminho FROM classificacao WHERE id=$1) || '%'`, [Number(classificacaoId)]);
  return rows.map(r => Number(r.produtoid));
}

async function escopo(empresaId, { lojaId, compradorId, classificacaoId }) {
  const unis = unisEmpresa(empresaId, lojaId);
  let prodIds = compradorId ? await produtosDoComprador(empresaId, compradorId) : null;
  const semComprador = compradorId && (!prodIds || !prodIds.length);
  // Classificação: restringe aos produtos dela (intersecção com o escopo do comprador, se houver).
  if (classificacaoId && !semComprador) {
    const cp = await produtosDaClassificacao(classificacaoId);
    const set = new Set(cp);
    prodIds = prodIds ? prodIds.filter(id => set.has(Number(id))) : cp; // [] => consulta devolve vazio (ok)
  }
  return { unis, prodIds, semComprador };
}
// unitário médio = total ÷ quantidade (p/ a tela de preço comparar preço de venda × custo por unidade).
const unit = (total, qtd) => { const q = Number(qtd) || 0; return q ? r2(Number(total) / q) : null; };

// Produtos vendidos ABAIXO DO CUSTO no período (venda < custo). Retorna lista + perda.
async function vendidoAbaixoCusto(empresaId, { lojaId = '', compradorId = null, classificacaoId = null, dias = 30, ini = '', fim = '', limite = 300 } = {}) {
  if (!habilitado()) return { erp: false };
  const { unis, prodIds, semComprador } = await escopo(empresaId, { lojaId, compradorId, classificacaoId });
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  if (semComprador) return { erp: true, semComprador: true, itens: [] };
  // janela de tempo (datas ou últimos N dias) com índices dinâmicos: unis=$1, depois janela, depois prodIds.
  const params = [unis]; const w = janela('v.datahorafechamento', { dias, ini, fim }, params.length + 1); params.push(...w.extra);
  const pf = pfClause(prodIds, params.length + 1); if (prodIds) params.push(prodIds);
  // por produto × LOJA, com EAN, data, PBM e caderno de oferta (separam perda LEGÍTIMA de erro de preço).
  const rows = await erpQuery(`
    SELECT em.produtoid, pr.descricao, v.unidadenegocioid uni,
      max(em.codigobarras) ean, to_char(max(v.datahorafechamento),'DD/MM') ultima,
      to_char(max(v.datahorafechamento),'YYYY-MM-DD') data_iso,
      sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) qtd,
      count(*) FILTER (WHERE iv.pbmid IS NOT NULL) pbm_itens, count(*) itens,
      max(cof.nome) caderno, max(pb.nome) pbm_nome
    FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      JOIN embalagem em ON em.id=iv.embalagemid JOIN produto pr ON pr.id=em.produtoid
      LEFT JOIN cadernooferta cof ON cof.id=iv.cadernoofertaid LEFT JOIN pbm pb ON pb.id=iv.pbmid
    WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
      AND ${w.clause}${pf}
    GROUP BY em.produtoid, pr.descricao, v.unidadenegocioid
    HAVING sum(iv.valortotal) < sum(me.custo*abs(me.quantidade)) AND sum(me.custo*abs(me.quantidade)) > 0
    ORDER BY (sum(me.custo*abs(me.quantidade)) - sum(iv.valortotal)) DESC
    LIMIT ${Number(limite) || 400}`, params);
  const itens = rows.map(r => {
    const venda = r2(r.venda), custo = r2(r.custo), nit = Number(r.itens) || 0, pbmIt = Number(r.pbm_itens) || 0;
    const pbmPct = nit ? Math.round(pbmIt / nit * 100) : 0;
    return { produtoId: Number(r.produtoid), produto: (r.descricao || '').trim(), uni: Number(r.uni), loja: nomeLoja(Number(r.uni)),
      ean: r.ean || null, ultima: r.ultima, dataISO: r.data_iso, venda, custo, qtd: ri(r.qtd),
      vendaUnit: unit(r.venda, r.qtd), custoUnit: unit(r.custo, r.qtd), perda: r2(custo - venda),
      pbmPct, pbm: r.pbm_nome || null, caderno: r.caderno || null,
      legitima: pbmPct >= 50 || !!r.caderno }; // perda provavelmente legítima (PBM/convênio ou caderno de oferta)
  });
  return { erp: true, dias, perdaTotal: r2(itens.reduce((a, i) => a + i.perda, 0)),
    perdaErro: r2(itens.filter(i => !i.legitima).reduce((a, i) => a + i.perda, 0)), itens };
}

// Produtos vendidos ABAIXO DA MARGEM mínima (margem% < margemMin). margem = (venda-custo)/venda.
async function vendidoAbaixoMargem(empresaId, { lojaId = '', compradorId = null, classificacaoId = null, dias = 30, ini = '', fim = '', margemMin = 20, limite = 300 } = {}) {
  if (!habilitado()) return { erp: false };
  const { unis, prodIds, semComprador } = await escopo(empresaId, { lojaId, compradorId, classificacaoId });
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  if (semComprador) return { erp: true, semComprador: true, itens: [] };
  const mm = Number(margemMin) || 20;
  const params = [unis]; const w = janela('v.datahorafechamento', { dias, ini, fim }, params.length + 1); params.push(...w.extra);
  const mmIdx = params.length + 1; params.push(mm);
  const pf = pfClause(prodIds, params.length + 1); if (prodIds) params.push(prodIds);
  const rows = await erpQuery(`
    SELECT em.produtoid, pr.descricao, v.unidadenegocioid uni,
      max(em.codigobarras) ean, to_char(max(v.datahorafechamento),'DD/MM') ultima,
      to_char(max(v.datahorafechamento),'YYYY-MM-DD') data_iso,
      sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo, sum(iv.quantidade) qtd,
      count(*) FILTER (WHERE iv.pbmid IS NOT NULL) pbm_itens, count(*) itens, max(cof.nome) caderno, max(pb.nome) pbm_nome
    FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      JOIN embalagem em ON em.id=iv.embalagemid JOIN produto pr ON pr.id=em.produtoid
      LEFT JOIN cadernooferta cof ON cof.id=iv.cadernoofertaid LEFT JOIN pbm pb ON pb.id=iv.pbmid
    WHERE v.status IN ('F','D') AND iv.status='F' AND v.unidadenegocioid=ANY($1::bigint[])
      AND ${w.clause}${pf}
    GROUP BY em.produtoid, pr.descricao, v.unidadenegocioid
    HAVING sum(iv.valortotal) > 0 AND (sum(iv.valortotal)-sum(me.custo*abs(me.quantidade)))/sum(iv.valortotal)*100 < $${mmIdx}
    ORDER BY (sum(iv.valortotal)-sum(me.custo*abs(me.quantidade)))/sum(iv.valortotal) ASC
    LIMIT ${Number(limite) || 400}`, params);
  const itens = rows.map(r => { const venda = r2(r.venda), custo = r2(r.custo), nit = Number(r.itens) || 0, pbmIt = Number(r.pbm_itens) || 0; const pbmPct = nit ? Math.round(pbmIt / nit * 100) : 0;
    return { produtoId: Number(r.produtoid), produto: (r.descricao || '').trim(), uni: Number(r.uni), loja: nomeLoja(Number(r.uni)), ean: r.ean || null, ultima: r.ultima, dataISO: r.data_iso, venda, custo, qtd: ri(r.qtd),
      vendaUnit: unit(r.venda, r.qtd), custoUnit: unit(r.custo, r.qtd),
      margem: venda ? Math.round((venda - custo) / venda * 1000) / 10 : null, pbmPct, pbm: r.pbm_nome || null, caderno: r.caderno || null }; });
  return { erp: true, dias, margemMin: mm, itens };
}

// Produtos COMPRADOS mais caro / mais barato que a ÚLTIMA entrada (valorunitario da NF). dir: 'caro'|'barato'.
async function compradoVariacao(empresaId, { lojaId = '', compradorId = null, classificacaoId = null, dias = 120, ini = '', fim = '', dir = 'caro', limite = 300 } = {}) {
  if (!habilitado()) return { erp: false };
  const { unis, prodIds, semComprador } = await escopo(empresaId, { lojaId, compradorId, classificacaoId });
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  if (semComprador) return { erp: true, semComprador: true, itens: [] };
  const op = dir === 'barato' ? '<' : '>';
  const params = [unis]; const w = janela('nf.datahoraentrada', { dias, ini, fim }, params.length + 1); params.push(...w.extra);
  const pf = pfClause(prodIds, params.length + 1); if (prodIds) params.push(prodIds);
  // compara a MESMA embalagem (produto pode ter embalagens diferentes com preço unitário incomparável).
  // Enriquecido: compara a última vs penúltima entrada da MESMA embalagem POR LOJA (produto+loja), e traz
  // EAN + o fornecedor da última entrada (quem vendeu mais caro) — igual às outras abas da Precificação.
  const rows = await erpQuery(`
    WITH ent AS (
      SELECT ii.embalagemid, nf.unidadenegocioid uni, em.produtoid, pr.descricao, nf.datahoraentrada, ii.valorunitario, nf.fornecedorid,
        row_number() OVER (PARTITION BY ii.embalagemid, nf.unidadenegocioid ORDER BY nf.datahoraentrada DESC) rn
      FROM notafiscal nf JOIN itemnotafiscal ii ON ii.notafiscalid=nf.id JOIN embalagem em ON em.id=ii.embalagemid
        JOIN produto pr ON pr.id=em.produtoid
      WHERE nf.unidadenegocioid=ANY($1::bigint[]) AND nf.tipooperacao='1' AND nf.status NOT IN ('X','E')
        AND ii.valorunitario>0 AND ${w.clause}${pf})
    SELECT u.produtoid, u.uni, u.descricao, u.valorunitario atual, a.valorunitario anterior,
      to_char(u.datahoraentrada,'DD/MM') em_dia, to_char(u.datahoraentrada,'YYYY-MM-DD') data_iso,
      (SELECT em2.codigobarras FROM embalagem em2 WHERE em2.produtoid=u.produtoid AND em2.codigobarras IS NOT NULL ORDER BY length(em2.codigobarras) DESC LIMIT 1) ean,
      COALESCE(fp.razaosocial, fp.nome) fornecedor
    FROM ent u JOIN ent a ON a.embalagemid=u.embalagemid AND a.uni=u.uni AND a.rn=2
    LEFT JOIN fornecedor f ON f.id=u.fornecedorid LEFT JOIN pessoa fp ON fp.id=f.pessoaid
    WHERE u.rn=1 AND u.valorunitario ${op} a.valorunitario
      -- só variações realistas (2%..100%); fora disso é troca de embalagem/erro de digitação, não mudança de preço
      AND abs(u.valorunitario - a.valorunitario) / a.valorunitario BETWEEN 0.02 AND 1.0
    ORDER BY abs(u.valorunitario-a.valorunitario)/a.valorunitario DESC
    LIMIT ${Number(limite) || 300}`, params);
  const itens = rows.map(r => { const atual = r2(r.atual), ant = r2(r.anterior); return { produtoId: Number(r.produtoid), uni: Number(r.uni), loja: nomeLoja(Number(r.uni)), produto: (r.descricao || '').trim(), ean: r.ean || null, fornecedor: (r.fornecedor || '').trim() || null, atual, anterior: ant, variacao: ant ? Math.round((atual - ant) / ant * 1000) / 10 : null, emDia: r.em_dia, dataISO: r.data_iso }; });
  return { erp: true, dias, dir, itens };
}

// ── Correções (app DB): o comprador marca "corrigido" por PRODUTO + LOJA (uni). uni=0 = todas as lojas. ──
// Retorna um mapa com chave "<produto_id>:<uni>" (0 = todas), p/ o front marcar a linha certa (produto+loja).
function listarCorrigidos(empresaId, tipo) {
  const rows = db.prepare('SELECT produto_id, uni, corrigido_por, corrigido_em, obs FROM precificacao_correcao WHERE empresa_id=? AND tipo=?').all(empresaId, tipo);
  const map = {}; rows.forEach(r => { map[r.produto_id + ':' + (r.uni || 0)] = r; }); return map;
}
function marcarCorrigido(empresaId, { tipo, produto_id, uni = 0, obs } = {}, usuario) {
  if (!tipo || !produto_id) throw new Error('Tipo e produto são obrigatórios.');
  db.prepare(`INSERT INTO precificacao_correcao (empresa_id, tipo, produto_id, uni, corrigido_por, corrigido_em, obs)
    VALUES (?,?,?,?,?, datetime('now'), ?)
    ON CONFLICT(empresa_id, tipo, produto_id, uni) DO UPDATE SET corrigido_por=excluded.corrigido_por, corrigido_em=excluded.corrigido_em, obs=excluded.obs`)
    .run(empresaId, tipo, Number(produto_id), Number(uni) || 0, usuario?.nome || null, obs || null);
  return { ok: true };
}
function desmarcarCorrigido(empresaId, { tipo, produto_id, uni = 0 } = {}) {
  db.prepare('DELETE FROM precificacao_correcao WHERE empresa_id=? AND tipo=? AND produto_id=? AND uni=?').run(empresaId, tipo, Number(produto_id), Number(uni) || 0);
  return { ok: true };
}

module.exports = { vendidoAbaixoCusto, vendidoAbaixoMargem, compradoVariacao, listarCorrigidos, marcarCorrigido, desmarcarCorrigido };
