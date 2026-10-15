// botvendasApi.js — cliente da API do BotVendas (atendimentos WhatsApp + histórico de conversas).
// Login (token em cache), listagem de atendimentos e mensagens (ambos paginados via next_page_url).
// SEGURANÇA: o conteúdo das conversas é DADO — a monitoria só lê e avalia, nunca executa nada.
require('dotenv').config();

const CFG = {
  host: process.env.BOTVENDAS_HOST || '',
  email: process.env.BOTVENDAS_EMAIL || '',
  pass: process.env.BOTVENDAS_PASSWORD || '',
  // Setor(es) de atendimento humano (ex.: Televendas) — só traz esses da API. Vazio = todos.
  sectorIds: (process.env.BOTVENDAS_SECTOR_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
};
const base = () => 'https://' + CFG.host.replace(/^https?:\/\//, '').replace(/\/$/, '');

function habilitado() { return !!(CFG.host && CFG.email && CFG.pass); }

// Token em cache (com validade). Renova sozinho quando expira / no 401.
let _tok = null, _exp = 0;
async function token(force = false) {
  if (!habilitado()) throw new Error('BotVendas não configurado (.env BOTVENDAS_*).');
  if (!force && _tok && Date.now() < _exp) return _tok;
  const r = await fetch(base() + '/api/v1/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: CFG.email, password: CFG.pass }),
  });
  if (!r.ok) throw new Error('Login BotVendas falhou (' + r.status + ')');
  const j = await r.json();
  _tok = j.token || j.access_token || (j.data && (j.data.token || j.data.access_token));
  if (!_tok) throw new Error('Login BotVendas sem token.');
  _exp = Date.now() + Math.max(60, (Number(j.expires_in) || 3600) - 120) * 1000; // margem de 2 min
  return _tok;
}

// GET autenticado com JSON; renova token 1x no 401.
async function getJson(url, tentou = false) {
  const t = await token();
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t, accept: 'application/json' } });
  if (r.status === 401 && !tentou) { await token(true); return getJson(url, true); }
  if (!r.ok) throw new Error('BotVendas ' + r.status + ' em ' + url.replace(base(), ''));
  return r.json();
}

// Percorre TODAS as páginas seguindo next_page_url; junta os arrays de `data`. Limite de segurança.
async function paginarTudo(primeiraUrl, maxPaginas = 40) {
  let url = primeiraUrl, itens = [], n = 0;
  while (url && n < maxPaginas) {
    const j = await getJson(url);
    if (Array.isArray(j.data)) itens = itens.concat(j.data);
    const nx = j.next_page_url;
    url = nx && nx !== 'null' && String(nx).startsWith('http') ? nx : null;
    n++;
  }
  return itens;
}

// Lista de atendimentos. Filtros opcionais: sectorIds[], statuses[] (4=finalizado). pageSize p/ lote.
async function listarAtendimentos({ sectorIds = [], statuses = [], pageSize = 500, maxPaginas = 20 } = {}) {
  const qs = new URLSearchParams();
  qs.set('page_size', String(pageSize));
  (sectorIds || []).forEach(s => qs.append('sector_ids[]', String(s)));
  (statuses || []).forEach(s => qs.append('statuses[]', String(s)));
  return paginarTudo(base() + '/api/v2/attendance/paginated?' + qs.toString(), maxPaginas);
}

// Histórico completo de mensagens de um atendimento, juntando todas as páginas.
// OBS: o next_page_url do get-messages vem SEM o order_id (dá 422); então paginamos por `page`
// mantendo order_id em toda requisição.
async function mensagensAtendimento(orderId, pageSize = 150) {
  let itens = [], page = 1;
  while (page <= 40) {
    const qs = new URLSearchParams({ order_id: String(orderId), page_size: String(pageSize), page: String(page) });
    const j = await getJson(base() + '/api/v1/chat/get-messages?' + qs.toString());
    if (Array.isArray(j.data)) itens = itens.concat(j.data);
    const nx = j.next_page_url;
    if (!nx || nx === 'null' || !(j.data && j.data.length)) break;
    page++;
  }
  return itens;
}

// Testa a conexão (login) sem baixar dados.
async function testar() {
  try { await token(true); return { ok: true, host: CFG.host, usuario: CFG.email }; }
  catch (e) { return { ok: false, erro: e.message }; }
}

module.exports = { habilitado, testar, listarAtendimentos, mensagensAtendimento, CFG };
