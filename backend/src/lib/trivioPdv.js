// Indicador PDV+ (Taxa de Conversão de sugestões por vendedor) — vem da TRIVIO.
// Fluxo: login (api.triv.io) → gera token do dashboard 3026 (Metabase) → lê o card
// "Ranking por vendedor" (dashcard 3632 / card 5110) filtrado por mês → mapeia o
// balconista da Trivio para o colaborador do Mutti (por nome, dentro da loja via CNPJ).
//
// Tudo com fallback gracioso: se desligado / sem credenciais / erro, devolve null e o
// indicador PDV+ volta a ser manual.
const db = require('../db/connection');
const { erpQuery } = require('../db/erp');

const API = (process.env.TRIVIO_API || 'https://api.triv.io').replace(/\/+$/, '');
const DASH = (process.env.TRIVIO_DASH || 'https://dashboards.triv.io').replace(/\/+$/, '');
const DASHBOARD_ID = process.env.TRIVIO_DASHBOARD_ID || '3026';
const EMAIL = process.env.TRIVIO_EMAIL || '';
const SENHA = process.env.TRIVIO_SENHA || '';
const TTL = (parseInt(process.env.TRIVIO_CACHE_TTL, 10) || 1800) * 1000;
const ENABLED = String(process.env.TRIVIO_ENABLED).toLowerCase() === 'true' && !!EMAIL && !!SENHA;

// Card "Ranking por vendedor" da "Análise de sugestões" (descobertos na estrutura do dashboard)
const DASHCARD_VENDEDOR = 3632;
const CARD_VENDEDOR = 5110;
// slugs dos parâmetros (já URL-encodados, como o Metabase espera na chave do JSON)
const P_MES = 'm%C3%AAs_e_ano';
const P_LOJA = 'loja';
const P_VEND = 'vendedor';
const P_CAMP = 'campanha_pdv%2B';
const P_PROD = 'produto';

function habilitado() { return ENABLED; }

// ─── normalização de nome (p/ casar balconista Trivio × colaborador Mutti) ───
function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acentos
    .replace(/#/g, ' ')                                // Trivio marca vínculo com #
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

// ─── JWT: lê o exp (segundos) do payload sem validar assinatura ───
function jwtExpMs(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return p.exp ? p.exp * 1000 : 0;
  } catch { return 0; }
}

// ─── 1) LOGIN → token de sessão ───
let sessao = { token: null, exp: 0 };
async function sessionToken() {
  const agora = Date.now();
  if (sessao.token && sessao.exp - 60000 > agora) return sessao.token;
  const r = await fetch(`${API}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ Email: EMAIL, Password: SENHA }),
  });
  if (!r.ok) throw new Error(`Trivio login HTTP ${r.status}`);
  const j = await r.json();
  const token = j.token || j.accessToken || j.access_token || j.jwt || (j.data && (j.data.token || j.data.accessToken));
  if (!token) throw new Error('Trivio login: token não encontrado na resposta');
  sessao = { token, exp: jwtExpMs(token) || (agora + 25 * 60000) };
  return token;
}

// ─── 2) TOKEN DO DASHBOARD (Metabase, curta duração) ───
let embed = { token: null, exp: 0 };
async function embedToken() {
  const agora = Date.now();
  if (embed.token && embed.exp - 30000 > agora) return embed.token;
  const sess = await sessionToken();
  const r = await fetch(`${API}/api/v1/dashboard/embedded/${DASHBOARD_ID}`, {
    headers: { 'Authorization': `Bearer ${sess}`, 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`Trivio embedded HTTP ${r.status}`);
  const j = await r.json();
  const url = j.embedUrl || j.url || '';
  const m = url.match(/\/dashboard\/([^/#?]+)/);
  if (!m) throw new Error('Trivio embed: token não encontrado no embedUrl');
  embed = { token: m[1], exp: jwtExpMs(m[1]) || (agora + 3 * 60000) };
  return embed.token;
}

// ─── mapa CNPJ (só dígitos) → loja_id do Mutti (via ERP unidadenegocio) ───
let cnpjMapCache = { at: 0, map: null };
async function cnpjLojaMap() {
  if (cnpjMapCache.map && Date.now() - cnpjMapCache.at < 6 * 3600 * 1000) return cnpjMapCache.map;
  const lojas = db.prepare('SELECT id, erp_unidadenegocio_id FROM lojas WHERE erp_unidadenegocio_id IS NOT NULL').all();
  const ids = lojas.map(l => l.erp_unidadenegocio_id);
  const map = {};
  if (ids.length) {
    const rows = await erpQuery(`SELECT id, cnpj FROM unidadenegocio WHERE id = ANY($1::int[])`, [ids]);
    const erpCnpj = {}; rows.forEach(r => { erpCnpj[String(r.id)] = soDigitos(r.cnpj); });
    lojas.forEach(l => { const c = erpCnpj[String(l.erp_unidadenegocio_id)]; if (c) map[c] = l.id; });
  }
  cnpjMapCache = { at: Date.now(), map };
  return map;
}

// ─── 3) LÊ O CARD DE VENDEDORES (linhas cruas) ───
async function fetchRankingVendedores(mes, ano) {
  const token = await embedToken();
  const params = {};
  params[P_MES] = `${ano}-${String(mes).padStart(2, '0')}`;
  params[P_LOJA] = null; params[P_VEND] = null; params[P_CAMP] = null; params[P_PROD] = null;
  const url = `${DASH}/api/embed/dashboard/${token}/dashcard/${DASHCARD_VENDEDOR}/card/${CARD_VENDEDOR}?parameters=${encodeURIComponent(JSON.stringify(params))}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Trivio card HTTP ${r.status}`);
  const j = await r.json();
  const cols = (j.data && j.data.cols || []).map(c => c.name || c.display_name);
  const idx = n => cols.indexOf(n);
  const iLoja = idx('Loja'), iBal = idx('Balconista'), iTaxa = idx('TaxaConversao'),
    iExib = idx('SugestoesExibidas'), iConv = idx('SugestoesConvertidas');
  return (j.data && j.data.rows || []).map(row => ({
    loja: row[iLoja], balconista: row[iBal],
    taxa: Number(row[iTaxa]) || 0, exibidas: Number(row[iExib]) || 0, convertidas: Number(row[iConv]) || 0,
  }));
}

// ─── PREWARM: monta {colaborador_id: taxa%} do mês e guarda em cache ───
const cache = new Map(); // chave `${ano}-${mes}` → { at, data: {colabId: pct}, disponivel }
function chave(mes, ano) { return `${ano}-${String(mes).padStart(2, '0')}`; }

async function prewarmPdv(mes, ano) {
  if (!ENABLED) return;
  const k = chave(mes, ano);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return;
  try {
    const [rows, cnpjMap] = await Promise.all([fetchRankingVendedores(mes, ano), cnpjLojaMap()]);
    // colaboradores por loja: normNome → id
    const colabs = db.prepare(`SELECT id, nome, loja_id FROM colaboradores WHERE funcao_id='func-vendedor' AND ativo=1`).all();
    const porLoja = {}; // loja_id → { normNome: id }
    colabs.forEach(c => { (porLoja[c.loja_id] = porLoja[c.loja_id] || {})[norm(c.nome)] = c.id; });
    const data = {};
    const agg = {}; // loja_id → { exib, conv } (conversão agregada da loja)
    for (const r of rows) {
      const cnpj = soDigitos((r.loja.match(/\(([^)]+)\)/) || [])[1] || r.loja);
      const lojaId = cnpjMap[cnpj];
      if (!lojaId) continue;
      const a = agg[lojaId] || (agg[lojaId] = { exib: 0, conv: 0 });
      a.exib += r.exibidas; a.conv += r.convertidas;
      const id = (porLoja[lojaId] || {})[norm(r.balconista)];
      if (!id) continue;
      // taxa vem como fração (0.1046) → % com 1 casa
      data[id] = Math.round(r.taxa * 1000) / 10;
    }
    const lojas = {}; // loja_id → conversão % agregada
    Object.entries(agg).forEach(([lid, a]) => { lojas[lid] = a.exib ? Math.round((a.conv / a.exib) * 1000) / 10 : 0; });
    cache.set(k, { at: Date.now(), data, lojas, disponivel: true });
  } catch (e) {
    // não derruba a tela; marca indisponível por um tempo curto p/ tentar de novo
    cache.set(k, { at: Date.now() - TTL + 60000, data: (hit && hit.data) || {}, disponivel: false, erro: e.message });
  }
}

// ─── ACESSO SÍNCRONO (usa o cache pré-aquecido) ───
// Devolve a taxa de conversão do PDV+ (%) do colaborador no mês, ou null se indisponível.
function pdvConversaoSync(colaboradorId, mes, ano) {
  if (!ENABLED) return null;
  const hit = cache.get(chave(mes, ano));
  if (!hit || !hit.disponivel) return null;
  const v = hit.data[colaboradorId];
  return v === undefined ? null : v;
}

// Conversão PDV+ agregada da LOJA (%) no mês, ou null se indisponível.
function conversaoLojaSync(lojaId, mes, ano) {
  if (!ENABLED) return null;
  const hit = cache.get(chave(mes, ano));
  if (!hit || !hit.disponivel || !hit.lojas) return null;
  const v = hit.lojas[lojaId];
  return v === undefined ? null : v;
}

// ─── FILIPETA (dashboard 4874) — conversão + total vendido por loja ───
const FIL_DASH = 4874, FIL_DASHCARD = 6700, FIL_CARD = 9762;
const embedCache = {}; // dashId → { token, exp }
async function embedTokenFor(dashId) {
  const agora = Date.now();
  const e = embedCache[dashId];
  if (e && e.exp - 30000 > agora) return e.token;
  const sess = await sessionToken();
  const r = await fetch(`${API}/api/v1/dashboard/embedded/${dashId}`, { headers: { Authorization: `Bearer ${sess}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Trivio embedded ${dashId} HTTP ${r.status}`);
  const j = await r.json();
  const m = (j.embedUrl || j.url || '').match(/\/dashboard\/([^/#?]+)/);
  if (!m) throw new Error(`Trivio embed ${dashId}: token não encontrado`);
  embedCache[dashId] = { token: m[1], exp: jwtExpMs(m[1]) || (agora + 3 * 60000) };
  return embedCache[dashId].token;
}

const cacheFil = new Map(); // `${ano}-${mes}` → { at, data:{lojaId:{...}}, disponivel }
async function prewarmFilipeta(mes, ano) {
  if (!ENABLED) return;
  const k = chave(mes, ano); const hit = cacheFil.get(k);
  if (hit && Date.now() - hit.at < TTL) return;
  try {
    const tok = await embedTokenFor(FIL_DASH);
    const mm = String(mes).padStart(2, '0');
    const fimD = String(new Date(ano, mes, 0).getDate()).padStart(2, '0');
    const params = {}; params['per%C3%ADodo'] = `${ano}-${mm}-01~${ano}-${mm}-${fimD}`; params['loja'] = null; params['pesquisar_oferta_ou_nome_interno'] = null;
    const url = `${DASH}/api/embed/dashboard/${tok}/dashcard/${FIL_DASHCARD}/card/${FIL_CARD}?parameters=${encodeURIComponent(JSON.stringify(params))}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Trivio filipeta HTTP ${r.status}`);
    const j = await r.json();
    const cols = (j.data && j.data.cols || []).map(c => c.name || c.display_name); const idx = n => cols.indexOf(n);
    const iLoja = idx('Loja'), iImp = idx('Qtde filipetas impressas (Venda)'), iConv = idx('Filipetas convertidas (Venda)'), iTot = idx('Total vendido (R$)'), iItens = idx('Qtde de itens vendidos');
    const cnpjMap = await cnpjLojaMap();
    const data = {};
    for (const row of (j.data && j.data.rows || [])) {
      const cnpj = soDigitos((String(row[iLoja]).match(/\(([^)]+)\)/) || [])[1] || '');
      const lojaId = cnpjMap[cnpj]; if (!lojaId) continue;
      const imp = Number(row[iImp]) || 0, conv = Number(row[iConv]) || 0;
      data[lojaId] = { conversao: imp ? Math.round((conv / imp) * 1000) / 10 : 0, convertidas: conv, impressas: imp, itens: Number(row[iItens]) || 0, totalVendido: Math.round(Number(row[iTot]) || 0) };
    }
    cacheFil.set(k, { at: Date.now(), data, disponivel: true });
  } catch (e) {
    cacheFil.set(k, { at: Date.now() - TTL + 60000, data: (hit && hit.data) || {}, disponivel: false, erro: e.message });
  }
}
// Filipeta da loja no mês: { conversao%, convertidas, totalVendido } ou null.
function filipetaLojaSync(lojaId, mes, ano) {
  if (!ENABLED) return null;
  const hit = cacheFil.get(chave(mes, ano));
  if (!hit || !hit.disponivel) return null;
  return hit.data[lojaId] || null;
}

module.exports = { habilitado, prewarmPdv, pdvConversaoSync, conversaoLojaSync, fetchRankingVendedores, prewarmFilipeta, filipetaLojaSync };
