// cmvGrupoErp.js — CMV (custo da mercadoria vendida ÷ venda) por GRUPO PRINCIPAL, por loja (Joe 2026-11-12).
// O CMV varia muito por categoria; a meta é cadastrada por grupo principal (PERFUMARIA, GENERICO,
// PROPAGADO…), igual p/ todas as lojas (loja_id='') ou por loja. O alvo pode ser GERADO pela média
// dos últimos meses. Custo vendido = movimentacaoestoque.custo × qtd (mesma base do CMV do orçamento).
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');

// Mapa produto → grupo principal (2º nível do caminho). O produto só é ligado à FOLHA; subimos pela trilha.
const PG_CTE = `
  WITH pg AS (
    SELECT DISTINCT ON (cp.produtoid) cp.produtoid, NULLIF(split_part(cl.caminho,' > ',2),'') grupo
    FROM classificacaoproduto cp JOIN classificacao cl ON cl.id=cp.classificacaoid
    WHERE cl.principal=true
    ORDER BY cp.produtoid, cl.profundidade DESC)`;

// CMV% por grupo principal nos últimos `meses`. Calcula DUAS médias:
//  • ponderada = Σcusto ÷ Σvenda do período (meses de mais venda pesam mais) — padrão.
//  • simples   = média dos CMV de cada mês (cada mês conta igual).
// O gestor escolhe na tela qual vira a meta; a outra fica informativa. lojaId vazio = todas as lojas.
async function cmvPorGrupo(empresaId, { lojaId = '', meses = 3 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.', grupos: [] };
  const m = Math.max(1, Math.min(12, Number(meses) || 3));
  // base por grupo × mês × loja — daí saem as três médias (Joe 2026-11-15):
  //  • pond    = Σcusto ÷ Σvenda do bolo todo (loja/mês de mais venda pesa mais).
  //  • simples = média dos CMV de cada MÊS (cada mês conta igual, lojas somadas).
  //  • lojas   = média dos CMV de cada LOJA (cada loja conta igual, independe do tamanho).
  const rows = await erpQuery(`${PG_CTE},
    base AS (
      SELECT pg.grupo, date_trunc('month', v.datahorafechamento) mes, v.unidadenegocioid uni,
        sum(iv.valortotal) venda, sum(me.custo*abs(me.quantidade)) custo
      FROM itemvenda iv
      JOIN venda v ON v.id=iv.vendaid
      JOIN movimentacaoestoque me ON me.id=iv.movimentacaoestoqueid
      JOIN embalagem em ON em.id=iv.embalagemid
      JOIN pg ON pg.produtoid=em.produtoid
      WHERE v.status IN ('F','D') AND iv.status='F'
        AND v.unidadenegocioid = ANY($1::bigint[])
        AND v.datahorafechamento >= date_trunc('month', now()) - (($2-1) || ' months')::interval
      GROUP BY pg.grupo, date_trunc('month', v.datahorafechamento), v.unidadenegocioid),
    por_mes AS (SELECT grupo, mes, sum(custo)/NULLIF(sum(venda),0)*100 cmv FROM base GROUP BY grupo, mes),
    por_loja AS (SELECT grupo, uni, sum(custo)/NULLIF(sum(venda),0)*100 cmv FROM base GROUP BY grupo, uni)
    SELECT b.grupo,
      sum(b.venda) venda, sum(b.custo) custo,
      sum(b.custo)/NULLIF(sum(b.venda),0)*100 cmv_pond,
      (SELECT avg(cmv) FROM por_mes pm WHERE pm.grupo=b.grupo AND cmv IS NOT NULL) cmv_simples,
      (SELECT avg(cmv) FROM por_loja pl WHERE pl.grupo=b.grupo AND cmv IS NOT NULL) cmv_lojas,
      count(DISTINCT b.mes) FILTER (WHERE b.venda > 0) meses_com_venda,
      count(DISTINCT b.uni) FILTER (WHERE b.venda > 0) lojas_com_venda
    FROM base b
    WHERE b.grupo IS NOT NULL
    GROUP BY b.grupo
    HAVING sum(b.venda) > 0
    ORDER BY sum(b.venda) DESC`, [unis, m]);
  const r1 = v => v == null ? null : Math.round(Number(v) * 10) / 10;
  const EXCLUIR = new Set(['SERVICOS', 'SERVIÇOS', 'USO E CONSUMO']); // não são revenda — fora do orçamento (Joe 2026-11-12)
  const grupos = rows.filter(r => r.grupo && !EXCLUIR.has(String(r.grupo).toUpperCase())).map(r => {
    const pond = r1(r.cmv_pond), simples = r1(r.cmv_simples), lojas = r1(r.cmv_lojas);
    return { grupo: r.grupo, venda: Math.round(Number(r.venda) || 0), custo: Math.round(Number(r.custo) || 0),
      cmvPond: pond, cmvSimples: simples, cmvLojas: lojas, cmv: pond,
      meses: Number(r.meses_com_venda) || 0, lojas_n: Number(r.lojas_com_venda) || 0 };
  });
  return { erp: true, meses: m, lojaId: lojaId || '', grupos };
}

// ── Cadastro das metas (SQLite do app) ──
function listarMetas(empresaId) {
  return db.prepare('SELECT loja_id, grupo, meta, atualizado_por, atualizado_em FROM compras_cmv_meta WHERE empresa_id=? ORDER BY loja_id, grupo').all(empresaId);
}
function setMeta(empresaId, { loja_id = '', grupo, meta } = {}, usuario) {
  if (!grupo) throw new Error('Grupo não informado.');
  const v = (meta === '' || meta == null) ? null : Number(meta);
  db.prepare(`INSERT INTO compras_cmv_meta (empresa_id, loja_id, grupo, meta, atualizado_por, atualizado_em)
    VALUES (?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, loja_id, grupo) DO UPDATE SET meta=excluded.meta, atualizado_por=excluded.atualizado_por, atualizado_em=excluded.atualizado_em`)
    .run(empresaId, loja_id || '', grupo, v, usuario?.nome || null);
  return { ok: true };
}
function removerMeta(empresaId, loja_id, grupo) {
  db.prepare('DELETE FROM compras_cmv_meta WHERE empresa_id=? AND loja_id=? AND grupo=?').run(empresaId, loja_id || '', grupo);
  return { ok: true };
}
// Meta efetiva de um (loja, grupo): a da loja se existir, senão a global ('').
function metaEfetiva(empresaId, lojaId, grupo) {
  const esp = db.prepare('SELECT meta FROM compras_cmv_meta WHERE empresa_id=? AND loja_id=? AND grupo=?').get(empresaId, lojaId || '', grupo);
  if (esp && esp.meta != null) return esp.meta;
  const glob = db.prepare("SELECT meta FROM compras_cmv_meta WHERE empresa_id=? AND loja_id='' AND grupo=?").get(empresaId, grupo);
  return glob ? glob.meta : null;
}

// Painel comparativo: CMV por grupo (ponderado + simples) × meta efetiva (da loja ou global) + semáforo.
// base = 'pond' (padrão) ou 'simples' decide qual média pré-preenche a meta ainda não salva.
async function painelCmv(empresaId, { lojaId = '', meses = 3, base = 'pond' } = {}) {
  const real = await cmvPorGrupo(empresaId, { lojaId, meses });
  if (real.erp === false) return real;
  const metasLoja = {};
  listarMetas(empresaId).forEach(r => { metasLoja[(r.loja_id || '') + '|' + r.grupo] = r.meta; });
  const glob = k => metasLoja['|' + k];
  const grupos = (real.grupos || []).map(g => {
    const baseCmv = base === 'simples' ? g.cmvSimples : base === 'lojas' ? g.cmvLojas : g.cmvPond;
    const metaEsp = metasLoja[(lojaId || '') + '|' + g.grupo];
    const saved = (metaEsp != null) ? metaEsp : (glob(g.grupo) != null ? glob(g.grupo) : null);
    const salvo = saved != null;
    // Sem meta salva ainda → já vem PRÉ-PREENCHIDA com a média escolhida (o gestor só ajusta e salva).
    const meta = salvo ? saved : baseCmv;
    const origem = salvo ? (metaEsp != null ? (lojaId ? 'loja' : 'global') : 'global') : 'media';
    // Farol compara o CMV REAL (ponderado) com a meta; só pinta quando a meta foi definida (salva).
    const farol = (!salvo || meta == null || g.cmvPond == null) ? 'cinza' : g.cmvPond <= meta ? 'verde' : g.cmvPond <= meta * 1.05 ? 'amarelo' : 'vermelho';
    return { ...g, meta, origem, salvo, farol };
  });
  return { erp: true, meses: real.meses, lojaId: lojaId || '', base, grupos };
}

module.exports = { cmvPorGrupo, listarMetas, setMeta, removerMeta, metaEfetiva, painelCmv };
