// lib/vendasErp.js — Fonte de vendas AO VIVO a partir do ERP (Postgres A7/Trier).
// Traduz os IDs do Mutti (loja/colaborador) para os do ERP (unidadenegocio/pessoa),
// aplica as regras validadas (status F/D por datahorafechamento) e devolve os totais.
//
// - Cache em memória com TTL (ERP_CACHE_TTL) evita marteladas no ERP a cada tela.
// - Fallback: se o ERP estiver indisponível/desligado, cai para a tabela local
//   `vendas` (lançamentos manuais), para o sistema nunca ficar sem número.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');

const TTL = parseInt(process.env.ERP_CACHE_TTL || '120', 10) * 1000;
const cache = new Map(); // chave -> { exp, val }

function getCache(k) {
  const e = cache.get(k);
  if (e && e.exp > Date.now()) return e.val;
  if (e) cache.delete(k);
  return undefined;
}
function setCache(k, val) {
  if (TTL > 0) cache.set(k, { exp: Date.now() + TTL, val });
  return val;
}
function pad2(n) { return String(n).padStart(2, '0'); }
// Intervalo [início, fimExclusivo) do mês, em texto 'YYYY-MM-DD'.
function faixaMes(mes, ano) {
  const ini = `${ano}-${pad2(mes)}-01`;
  const pm = mes === 12 ? 1 : mes + 1;
  const pa = mes === 12 ? ano + 1 : ano;
  const fim = `${pa}-${pad2(pm)}-01`;
  return [ini, fim];
}

// ── Fallbacks locais (tabela `vendas` do SQLite) ─────────────────────────────
function localLoja(lojaId, mes, ano) {
  return db.prepare(`SELECT COALESCE(SUM(valor),0) t FROM vendas
    WHERE loja_id=? AND CAST(strftime('%m',data_venda) AS INTEGER)=? AND CAST(strftime('%Y',data_venda) AS INTEGER)=?`
  ).get(lojaId, mes, ano).t;
}
function localColab(colabId, mes, ano) {
  return db.prepare(`SELECT COALESCE(SUM(valor),0) t FROM vendas
    WHERE colaborador_id=? AND CAST(strftime('%m',data_venda) AS INTEGER)=? AND CAST(strftime('%Y',data_venda) AS INTEGER)=?`
  ).get(colabId, mes, ano).t;
}

// ── Total de vendas de uma LOJA no mês (faturamento status F/D) ──────────────
async function totalLojaMes(lojaId, mes, ano) {
  const k = `loja:${lojaId}:${mes}:${ano}`;
  const c = getCache(k); if (c !== undefined) return c;

  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  if (!habilitado() || !uni) return setCache(k, localLoja(lojaId, mes, ano));

  try {
    const [ini, fim] = faixaMes(mes, ano);
    const r = await erpQuery(
      `SELECT COALESCE(SUM(v.valortotal),0) t FROM venda v
       WHERE v.unidadenegocioid=$1 AND v.status IN ('F','D')
         AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3`,
      [uni, ini, fim]
    );
    return setCache(k, Number(r[0].t) || 0);
  } catch (e) {
    console.error(`[ERP] falha em totalLojaMes(${lojaId}); usando local:`, e.message);
    return localLoja(lojaId, mes, ano);
  }
}

// ── Total de vendas de um COLABORADOR no mês (por pessoa do ERP) ─────────────
async function totalVendedorMes(colabId, mes, ano) {
  const k = `colab:${colabId}:${mes}:${ano}`;
  const c = getCache(k); if (c !== undefined) return c;

  const col = db.prepare('SELECT erp_pessoa_id FROM colaboradores WHERE id=?').get(colabId);
  const pessoa = col && col.erp_pessoa_id;
  if (!habilitado() || !pessoa) return setCache(k, localColab(colabId, mes, ano));

  try {
    const [ini, fim] = faixaMes(mes, ano);
    const r = await erpQuery(
      `SELECT COALESCE(SUM(v.valortotal),0) t FROM venda v
       LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(o.usuarioid,v.usuarioid)
       WHERE u.pessoaid=$1 AND v.status IN ('F','D')
         AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3`,
      [pessoa, ini, fim]
    );
    return setCache(k, Number(r[0].t) || 0);
  } catch (e) {
    console.error(`[ERP] falha em totalVendedorMes(${colabId}); usando local:`, e.message);
    return localColab(colabId, mes, ano);
  }
}

// ── Mapa colaboradorId -> total no mês, para TODOS os vendedores de uma loja ──
// (1 só consulta ao ERP; usado no ranking/metas para não fazer N round-trips)
async function mapaVendedoresLojaMes(lojaId, mes, ano) {
  const k = `mapa:${lojaId}:${mes}:${ano}`;
  const c = getCache(k); if (c !== undefined) return c;

  const colabs = db.prepare(
    'SELECT id, erp_pessoa_id FROM colaboradores WHERE loja_id=? AND erp_pessoa_id IS NOT NULL'
  ).all(lojaId);
  const porPessoa = new Map(colabs.map(c => [Number(c.erp_pessoa_id), c.id]));
  const out = {};
  if (!habilitado() || !colabs.length) return setCache(k, out);

  try {
    const [ini, fim] = faixaMes(mes, ano);
    const pessoas = colabs.map(c => Number(c.erp_pessoa_id));
    const r = await erpQuery(
      `SELECT u.pessoaid, COALESCE(SUM(v.valortotal),0) t FROM venda v
       LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(o.usuarioid,v.usuarioid)
       WHERE u.pessoaid = ANY($1::bigint[]) AND v.status IN ('F','D')
         AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
       GROUP BY u.pessoaid`,
      [pessoas, ini, fim]
    );
    for (const row of r) {
      const id = porPessoa.get(Number(row.pessoaid));
      if (id) out[id] = Number(row.t) || 0;
    }
    return setCache(k, out);
  } catch (e) {
    console.error(`[ERP] falha em mapaVendedoresLojaMes(${lojaId}); usando local:`, e.message);
    for (const c of colabs) out[c.id] = localColab(c.id, mes, ano);
    return out;
  }
}

// ── TODOS os vendedores que realizaram venda na loja no mês (ERP, sem filtro de
//    função nem de vínculo). Retorna [{pessoaid, nome, vendido}]. Traz toda venda. ──
async function vendedoresRealizadosLoja(lojaId, mes, ano) {
  const k = `realizados:${lojaId}:${mes}:${ano}`;
  const c = getCache(k); if (c !== undefined) return c;
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  if (!habilitado() || !uni) return setCache(k, []);
  try {
    const [ini, fim] = faixaMes(mes, ano);
    const r = await erpQuery(
      `SELECT u.pessoaid, COALESCE(pe.nome, 'Operador ' || u.id) nome, COALESCE(SUM(v.valortotal),0) t
       FROM venda v LEFT JOIN orcamento o ON o.id=v.orcamentoid
       JOIN usuario u ON u.id=COALESCE(o.usuarioid, v.usuarioid)
       LEFT JOIN pessoa pe ON pe.id=u.pessoaid
       WHERE v.unidadenegocioid=$1 AND v.status IN ('F','D')
         AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
       GROUP BY u.pessoaid, pe.nome, u.id
       HAVING COALESCE(SUM(v.valortotal),0) > 0
       ORDER BY t DESC`,
      [uni, ini, fim]
    );
    return setCache(k, r.map(x => ({ pessoaid: x.pessoaid == null ? null : Number(x.pessoaid), nome: x.nome, vendido: Number(x.t) || 0 })));
  } catch (e) {
    console.error(`[ERP] falha em vendedoresRealizadosLoja(${lojaId}):`, e.message);
    return [];
  }
}

// ── Pré-aquecimento + acessores SÍNCRONOS ────────────────────────────────────
// A app é síncrona (better-sqlite3) e o ERP é assíncrono (pg). Para não reescrever
// toda a cadeia de cálculo, a ROTA chama `await prewarmLoja(...)` (async, popula o
// cache) e os helpers de cálculo usam os acessores *Sync (leem o cache; se vazio,
// caem para a tabela local). Assim a leitura fica "ao vivo" sem espalhar async.
async function prewarmLoja(lojaId, mes, ano) {
  await Promise.all([
    totalLojaMes(lojaId, mes, ano),
    mapaVendedoresLojaMes(lojaId, mes, ano),
    vendedoresRealizadosLoja(lojaId, mes, ano),
  ]);
}
function vendedoresRealizadosLojaSync(lojaId, mes, ano) {
  const v = getCache(`realizados:${lojaId}:${mes}:${ano}`);
  return v !== undefined ? v : [];
}

function totalLojaMesSync(lojaId, mes, ano) {
  const v = getCache(`loja:${lojaId}:${mes}:${ano}`);
  return v !== undefined ? v : localLoja(lojaId, mes, ano);
}

function totalVendedorMesSync(colabId, mes, ano) {
  const direto = getCache(`colab:${colabId}:${mes}:${ano}`);
  if (direto !== undefined) return direto;
  const col = db.prepare('SELECT loja_id FROM colaboradores WHERE id=?').get(colabId);
  if (col) {
    const mapa = getCache(`mapa:${col.loja_id}:${mes}:${ano}`);
    if (mapa !== undefined) return mapa[colabId] || 0;
  }
  return localColab(colabId, mes, ano);
}

function mapaVendedoresLojaMesSync(lojaId, mes, ano) {
  const m = getCache(`mapa:${lojaId}:${mes}:${ano}`);
  if (m !== undefined) return m;
  const colabs = db.prepare('SELECT id FROM colaboradores WHERE loja_id=? AND ativo=1').all(lojaId);
  const out = {}; for (const c of colabs) out[c.id] = localColab(c.id, mes, ano);
  return out;
}

// ── Detalhe de vendas do mês (por dia + vendedor), para relatórios/exportação ──
// lojaIds = array de IDs de loja do Mutti (ou null = todas as mapeadas da empresa).
// Retorna [{data, loja, vendedor, valor}]. Fallback: tabela local.
async function detalheVendasMes(lojaIds, mes, ano) {
  let lojasQ = 'SELECT id, nome, erp_unidadenegocio_id FROM lojas WHERE erp_unidadenegocio_id IS NOT NULL';
  const args = [];
  if (Array.isArray(lojaIds) && lojaIds.length) {
    lojasQ += ` AND id IN (${lojaIds.map(() => '?').join(',')})`;
    args.push(...lojaIds);
  }
  const lojas = db.prepare(lojasQ).all(...args);
  const unis = lojas.map(l => Number(l.erp_unidadenegocio_id));

  if (habilitado() && unis.length) {
    try {
      const [ini, fim] = faixaMes(mes, ano);
      const r = await erpQuery(
        `SELECT to_char(v.datahorafechamento,'YYYY-MM-DD') AS data,
                un.nome AS loja, COALESCE(pe.nome,'(sem vendedor)') AS vendedor,
                SUM(v.valortotal) AS valor
         FROM venda v
         JOIN unidadenegocio un ON un.id = v.unidadenegocioid
         LEFT JOIN orcamento o ON o.id=v.orcamentoid LEFT JOIN usuario u ON u.id = COALESCE(o.usuarioid,v.usuarioid)
         LEFT JOIN pessoa pe ON pe.id = u.pessoaid
         WHERE v.status IN ('F','D') AND v.datahorafechamento >= $1 AND v.datahorafechamento < $2
           AND v.unidadenegocioid = ANY($3::bigint[])
         GROUP BY 1,2,3 ORDER BY 1,2,3`,
        [ini, fim, unis]
      );
      return r.map(x => ({ data_venda: x.data, loja: x.loja, vendedor: x.vendedor, valor: Number(x.valor) || 0 }));
    } catch (e) {
      console.error('[ERP] falha em detalheVendasMes; usando local:', e.message);
    }
  }
  // Fallback local
  let q = `SELECT v.data_venda, l.nome loja, c.nome vendedor, v.valor
    FROM vendas v JOIN lojas l ON l.id=v.loja_id JOIN colaboradores c ON c.id=v.colaborador_id
    WHERE CAST(strftime('%m',v.data_venda) AS INTEGER)=? AND CAST(strftime('%Y',v.data_venda) AS INTEGER)=?`;
  const p = [mes, ano];
  if (Array.isArray(lojaIds) && lojaIds.length) { q += ` AND v.loja_id IN (${lojaIds.map(() => '?').join(',')})`; p.push(...lojaIds); }
  return db.prepare(q + ' ORDER BY v.data_venda').all(...p).map(x => ({ data_venda: x.data_venda, loja: x.loja, vendedor: x.vendedor, valor: Number(x.valor) || 0 }));
}

// ── Série mensal de vendas de uma loja (para análise/sugestão de meta) ────────
// Retorna os `nMeses` meses ANTERIORES a (anoAte/mesAte), exclusivo desse mês.
// [{ano, mes, total}] em ordem cronológica. Fallback: tabela local.
async function serieMensalLoja(lojaId, mesAte, anoAte, nMeses = 13) {
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  // início = nMeses antes do mês alvo; fim = 1º dia do mês alvo (exclui o alvo, que pode estar aberto)
  const fim = faixaMes(mesAte, anoAte)[0];
  let mi = mesAte - nMeses, ai = anoAte;
  while (mi <= 0) { mi += 12; ai -= 1; }
  const ini = faixaMes(mi, ai)[0];

  if (habilitado() && uni) {
    try {
      const rows = await erpQuery(
        `SELECT extract(year from v.datahorafechamento)::int ano,
                extract(month from v.datahorafechamento)::int mes,
                SUM(v.valortotal) total
         FROM venda v
         WHERE v.unidadenegocioid=$1 AND v.status IN ('F','D')
           AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
         GROUP BY 1,2 ORDER BY 1,2`,
        [uni, ini, fim]
      );
      return rows.map(r => ({ ano: Number(r.ano), mes: Number(r.mes), total: Number(r.total) || 0 }));
    } catch (e) {
      console.error(`[ERP] falha em serieMensalLoja(${lojaId}); usando local:`, e.message);
    }
  }
  const rows = db.prepare(
    `SELECT CAST(strftime('%Y',data_venda) AS INTEGER) ano, CAST(strftime('%m',data_venda) AS INTEGER) mes, SUM(valor) total
     FROM vendas WHERE loja_id=? AND data_venda >= ? AND data_venda < ? GROUP BY 1,2 ORDER BY 1,2`
  ).all(lojaId, ini, fim);
  return rows.map(r => ({ ano: r.ano, mes: r.mes, total: Number(r.total) || 0 }));
}

// Série mensal por VENDEDOR de uma loja (para sugerir meta individual).
// Retorna { colaboradorId: [{ano, mes, total}] } cronológico. 1 só consulta ao ERP.
async function serieMensalVendedoresLoja(lojaId, mesAte, anoAte, nMeses = 6) {
  const colabs = db.prepare(
    'SELECT id, erp_pessoa_id FROM colaboradores WHERE loja_id=? AND erp_pessoa_id IS NOT NULL AND ativo=1'
  ).all(lojaId);
  const porPessoa = new Map(colabs.map(c => [Number(c.erp_pessoa_id), c.id]));
  const out = {}; colabs.forEach(c => { out[c.id] = []; });
  if (!colabs.length) return out;

  const fim = faixaMes(mesAte, anoAte)[0];
  let mi = mesAte - nMeses, ai = anoAte;
  while (mi <= 0) { mi += 12; ai -= 1; }
  const ini = faixaMes(mi, ai)[0];

  if (habilitado()) {
    try {
      const pessoas = colabs.map(c => Number(c.erp_pessoa_id));
      const rows = await erpQuery(
        `SELECT u.pessoaid,
                extract(year from v.datahorafechamento)::int ano,
                extract(month from v.datahorafechamento)::int mes,
                SUM(v.valortotal) total
         FROM venda v LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(o.usuarioid,v.usuarioid)
         WHERE u.pessoaid = ANY($1::bigint[]) AND v.status IN ('F','D')
           AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
         GROUP BY 1,2,3 ORDER BY 2,3`,
        [pessoas, ini, fim]
      );
      for (const r of rows) {
        const id = porPessoa.get(Number(r.pessoaid));
        if (id) out[id].push({ ano: Number(r.ano), mes: Number(r.mes), total: Number(r.total) || 0 });
      }
      return out;
    } catch (e) {
      console.error(`[ERP] falha em serieMensalVendedoresLoja(${lojaId}):`, e.message);
    }
  }
  return out;
}

// Média mensal de vendas POR GRUPO de produto (últimos nMeses fechados) de uma loja.
// Retorna { generico, similar, perfumaria, varejo, conveniencia, propagado, vitaminas }.
const CLASSIF_GRUPO = {
  'GENERICO': 'generico', 'SIMILAR': 'similar', 'PERFUMARIA': 'perfumaria',
  'VAREJO': 'varejo', 'CONVENIENCIA': 'conveniencia', 'PROPAGADO': 'propagado',
  'SUPLEMENTO ALIMENTAR': 'vitaminas',
};
async function mediaGruposLoja(lojaId, mesAte, anoAte, nMeses = 3) {
  const zero = { generico: 0, similar: 0, perfumaria: 0, varejo: 0, conveniencia: 0, propagado: 0, vitaminas: 0 };
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  if (!habilitado() || !uni) return { ...zero };

  const fim = faixaMes(mesAte, anoAte)[0];
  let mi = mesAte - nMeses, ai = anoAte;
  while (mi <= 0) { mi += 12; ai -= 1; }
  const ini = faixaMes(mi, ai)[0];
  try {
    const rows = await erpQuery(
      `SELECT split_part(cl.caminho,' > ',2) cat,
              extract(year from v.datahorafechamento)::int ano,
              extract(month from v.datahorafechamento)::int mes,
              SUM(iv.valortotal) total
       FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
         JOIN embalagem e ON e.id=iv.embalagemid
         JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid
         JOIN classificacao cl ON cl.id=cp.classificacaoid AND cl.caminho LIKE 'PRINCIPAL >%'
       WHERE v.status IN ('F','D') AND iv.status='F'
         AND v.unidadenegocioid=$1 AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
       GROUP BY 1,2,3`,
      [uni, ini, fim]
    );
    // soma por grupo e conta meses distintos com dados p/ tirar a média
    const soma = { ...zero };
    const mesesSet = new Set();
    for (const r of rows) {
      const g = CLASSIF_GRUPO[r.cat];
      if (!g) continue;
      soma[g] += Number(r.total) || 0;
      mesesSet.add(`${r.ano}-${r.mes}`);
    }
    const nm = Math.max(1, mesesSet.size);
    const out = {};
    for (const k of Object.keys(zero)) out[k] = Math.round((soma[k] / nm) / 100) * 100; // média/mês arred. centena
    return out;
  } catch (e) {
    console.error(`[ERP] falha em mediaGruposLoja(${lojaId}):`, e.message);
    return { ...zero };
  }
}

// Vendas da LOJA no mês, quebradas por GRUPO de produto (visão inicial do gerente).
async function vendasGruposLojaMes(lojaId, mes, ano) {
  const zero = { generico: 0, similar: 0, perfumaria: 0, varejo: 0, conveniencia: 0, propagado: 0, vitaminas: 0, outros: 0, total: 0 };
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  if (!habilitado() || !uni) return zero;
  try {
    const [ini, fim] = faixaMes(mes, ano);
    const rows = await erpQuery(`
      SELECT split_part(cl.caminho,' > ',2) cat, SUM(iv.valortotal) total
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
        JOIN embalagem e ON e.id=iv.embalagemid
        JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid
        JOIN classificacao cl ON cl.id=cp.classificacaoid AND cl.caminho LIKE 'PRINCIPAL >%'
      WHERE v.status='F' AND iv.status='F' AND v.unidadenegocioid=$1
        AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
      GROUP BY 1`, [uni, ini, fim]);
    const out = { ...zero };
    for (const r of rows) {
      const g = CLASSIF_GRUPO[r.cat]; const val = Number(r.total) || 0;
      if (g) out[g] += val; else out.outros += val;
      out.total += val;
    }
    return out;
  } catch (e) {
    console.error(`[ERP] falha em vendasGruposLojaMes(${lojaId}):`, e.message);
    return zero;
  }
}

// Vendas de UM vendedor no mês, quebradas por GRUPO de produto (para o gerente ver ao clicar).
// Retorna { generico, similar, perfumaria, varejo, conveniencia, propagado, vitaminas, outros, total }.
async function vendasGruposVendedor(colabId, mes, ano) {
  const zero = { generico: 0, similar: 0, perfumaria: 0, varejo: 0, conveniencia: 0, propagado: 0, vitaminas: 0, outros: 0, total: 0 };
  const col = db.prepare('SELECT erp_pessoa_id FROM colaboradores WHERE id=?').get(colabId);
  const pessoa = col && col.erp_pessoa_id;
  if (!habilitado() || !pessoa) return zero;
  try {
    const [ini, fim] = faixaMes(mes, ano);
    const rows = await erpQuery(`
      SELECT split_part(cl.caminho,' > ',2) cat, SUM(iv.valortotal) total
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
        LEFT JOIN itemorcamento io ON io.id=iv.itemorcamentoid
        LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id=COALESCE(io.usuarioid,o.usuarioid,v.usuarioid)
        JOIN embalagem e ON e.id=iv.embalagemid
        JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid
        JOIN classificacao cl ON cl.id=cp.classificacaoid AND cl.caminho LIKE 'PRINCIPAL >%'
      WHERE v.status='F' AND iv.status='F' AND u.pessoaid=$1
        AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3
      GROUP BY 1`, [pessoa, ini, fim]);
    const out = { ...zero };
    for (const r of rows) {
      const g = CLASSIF_GRUPO[r.cat];
      const val = Number(r.total) || 0;
      if (g) out[g] += val; else out.outros += val;
      out.total += val;
    }
    return out;
  } catch (e) {
    console.error(`[ERP] falha em vendasGruposVendedor(${colabId}):`, e.message);
    return zero;
  }
}

// Total de vendas de uma loja num intervalo livre [deISO, ateISO] (inclusivo em ambos os dias).
async function totalLojaIntervalo(lojaId, deISO, ateISO) {
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  const uni = loja && loja.erp_unidadenegocio_id;
  // ateISO inclusivo -> soma < dia seguinte
  const [y, m, d] = ateISO.split('-').map(Number);
  const ate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  if (habilitado() && uni) {
    try {
      const r = await erpQuery(
        `SELECT COALESCE(SUM(v.valortotal),0) t, COUNT(*) FILTER (WHERE v.status='F') n
         FROM venda v WHERE v.unidadenegocioid=$1 AND v.status IN ('F','D')
           AND v.datahorafechamento >= $2 AND v.datahorafechamento < $3`,
        [uni, deISO, ate]
      );
      return { total: Number(r[0].t) || 0, clientes: Number(r[0].n) || 0 };
    } catch (e) {
      console.error(`[ERP] falha em totalLojaIntervalo(${lojaId}); usando local:`, e.message);
    }
  }
  const r = db.prepare(`SELECT COALESCE(SUM(valor),0) t FROM vendas WHERE loja_id=? AND data_venda >= ? AND data_venda < ?`).get(lojaId, deISO, ate);
  return { total: Number(r.t) || 0, clientes: 0 };
}

// Invalida o cache (ex.: após trocar de mês ou re-sincronizar).
function limparCache() { cache.clear(); }

module.exports = {
  totalLojaMes, totalVendedorMes, mapaVendedoresLojaMes, vendedoresRealizadosLoja, vendedoresRealizadosLojaSync, faixaMes, limparCache,
  prewarmLoja, totalLojaMesSync, totalVendedorMesSync, mapaVendedoresLojaMesSync,
  detalheVendasMes, serieMensalLoja, totalLojaIntervalo, serieMensalVendedoresLoja,
  mediaGruposLoja, vendasGruposVendedor, vendasGruposLojaMes,
};
