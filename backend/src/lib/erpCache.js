// erpCache.js — cache GENÉRICO de relatórios que leem o ERP (Alpha). Reutilizável por qualquer rota.
// Política: período FECHADO (termina antes do mês atual) → guarda pra sempre. Período que inclui o
// mês atual (ou sem marco de data) → vale no máximo TTL_MIN minutos. ?forcar=1 ignora o cache.
// Tabela: erp_cache (migração 302). Chave = base|empresa|querystring ordenada (sem 'forcar').
const db = require('../db/connection');

const TTL_MIN = 60; // mês atual recalcula no máximo 1x por hora
const mesAtual = () => new Date().toISOString().slice(0, 7);
const agoraUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// o período pedido ainda pode mudar? Olha os params de data mais comuns; se o "fim" do período já
// passou (mês anterior ao atual), o dado está fechado e não muda mais → pode guardar pra sempre.
function periodoVolatil(q) {
  q = q || {};
  const marcos = [];
  for (const k of ['fim', 'ate', 'rfim', 'dataFinal', 'posicao', 'competencia', 'mesAno', 'data']) {
    const v = q[k]; if (v && /^\d{4}-\d{2}/.test(String(v))) marcos.push(String(v).slice(0, 7));
  }
  if (q.ano && q.mes) marcos.push(`${q.ano}-${String(q.mes).padStart(2, '0')}`);
  if (!marcos.length) return true;            // sem marco de data → trata como volátil (TTL)
  return marcos.sort().slice(-1)[0] >= mesAtual(); // inclui o mês atual (ou futuro) → volátil
}

function chaveDe(base, empresaId, q) {
  const qs = Object.keys(q || {}).filter(k => k !== 'forcar').sort().map(k => `${k}=${q[k]}`).join('&');
  return `${base}|${empresaId}|${qs}`;
}

function ler(base, empresaId, q) {
  if ((q || {}).forcar === '1') return null;
  const row = db.prepare('SELECT payload, atualizado_em FROM erp_cache WHERE chave=?').get(chaveDe(base, empresaId, q));
  if (!row) return null;
  if (periodoVolatil(q)) {
    const idadeMin = (Date.now() - new Date(row.atualizado_em.replace(' ', 'T') + 'Z').getTime()) / 60000;
    if (!(idadeMin <= TTL_MIN)) return null;
  }
  try { return { payload: JSON.parse(row.payload), atualizado_em: row.atualizado_em }; } catch { return null; }
}

function gravar(base, empresaId, q, payload) {
  const at = agoraUtc();
  db.prepare(`INSERT INTO erp_cache (chave, empresa_id, payload, atualizado_em) VALUES (?,?,?,?)
    ON CONFLICT(chave) DO UPDATE SET payload=excluded.payload, atualizado_em=excluded.atualizado_em`)
    .run(chaveDe(base, empresaId, q), empresaId, JSON.stringify(payload), at);
  return at;
}

// junta o meta do cache ao payload (objeto → spread; array/escalar → não mexe, só cacheia).
function comMeta(payload, cache) {
  return (payload && typeof payload === 'object' && !Array.isArray(payload)) ? { ...payload, cache } : payload;
}

// Invalida o cache de uma empresa cujas bases começam com `prefixo` (ex.: 'cc-' limpa a Conciliação).
// Chamar depois de QUALQUER escrita que mude o que o relatório mostra (import, correção, remanejo…).
function invalidar(empresaId, prefixo) {
  db.prepare(`DELETE FROM erp_cache WHERE empresa_id=? AND chave LIKE ?`).run(empresaId, (prefixo || '') + '%');
}

// Helper p/ rotas no estilo wrap: router.get(path, wrapCache('base')(req => computePayload))
// Requer req.usuario.empresa_id. Mantém o 502 em erro, igual ao wrap original.
function wrapCache(base) {
  return fn => async (req, res) => {
    try {
      const emp = req.usuario.empresa_id;
      const hit = ler(base, emp, req.query);
      if (hit) return res.json(comMeta(hit.payload, { atualizado_em: hit.atualizado_em, deCache: true }));
      const payload = await fn(req);
      const at = gravar(base, emp, req.query, payload);
      res.json(comMeta(payload, { atualizado_em: at, deCache: false }));
    } catch (e) { res.status(502).json({ erro: e.message }); }
  };
}

// Helper p/ rotas que ESCREVEM: roda o fn e invalida o cache do módulo (prefixo). Mantém o 502.
function wrapInvalidar(prefixo) {
  return fn => async (req, res) => {
    try { const out = await fn(req); invalidar(req.usuario.empresa_id, prefixo); res.json(out); }
    catch (e) { res.status(502).json({ erro: e.message }); }
  };
}

// Middleware de router: cacheia os GET que respondem via res.json, keyando por path + query.
// Cobre inclusive rotas com :id (a chave usa req.path). Pula GETs listados em `skip(req)`.
// Base da chave = `${modulo}:${req.path}` → invalidar com o prefixo `${modulo}:`.
// Respostas de erro (status >= 400 ou body.erro) não são cacheadas.
function cacheMiddleware(modulo, { skip } = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const emp = req.usuario && req.usuario.empresa_id;
    if (!emp) return next();
    if (skip && skip(req)) return next();
    const base = `${modulo}:${req.path}`;
    const hit = ler(base, emp, req.query);
    if (hit) return res.json(comMeta(hit.payload, { atualizado_em: hit.atualizado_em, deCache: true }));
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400 && body && !(typeof body === 'object' && body.erro)) {
        try { const at = gravar(base, emp, req.query, body); return orig(comMeta(body, { atualizado_em: at, deCache: false })); }
        catch (e) { /* cache falhou: responde normal */ }
      }
      return orig(body);
    };
    next();
  };
}

// Middleware de router: invalida o cache do módulo após qualquer escrita (não-GET) bem-sucedida.
function invalidarMiddleware(prefixo) {
  return (req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) { try { invalidar(req.usuario.empresa_id, prefixo); } catch (e) { /* ignore */ } } });
    next();
  };
}

module.exports = { ler, gravar, chaveDe, periodoVolatil, comMeta, wrapCache, wrapInvalidar, invalidar, cacheMiddleware, invalidarMiddleware };
