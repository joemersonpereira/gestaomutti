// botvendas.js — integração com a API do BotVendas (bot de conversas / funil de pedidos), da Iqnus.
// Auth: POST /api/v2/login {email,password} → JWT (expira ~1h) → Authorization: Bearer. Credenciais no .env.
const https = require('https');

const HOST = () => process.env.BOTVENDAS_HOST || 'farmaciamulti.botvendas.com';
const EMAIL = () => process.env.BOTVENDAS_EMAIL || '';
const PASS = () => process.env.BOTVENDAS_PASSWORD || '';
const habilitado = () => !!(EMAIL() && PASS());

function reqRaw(method, path, body, tok) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { accept: 'application/json' };
    if (tok) headers.Authorization = 'Bearer ' + tok;
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
    const r = https.request({ hostname: HOST(), path, method, headers }, x => {
      let d = ''; x.on('data', c => d += c);
      x.on('end', () => resolve({ code: x.statusCode, body: d }));
    });
    r.on('error', reject); r.setTimeout(20000, () => r.destroy(new Error('BotVendas: timeout')));
    if (data) r.write(data); r.end();
  });
}

let _tok = null, _exp = 0;
async function token() {
  if (_tok && Date.now() < _exp) return _tok;
  if (!habilitado()) throw new Error('BotVendas não configurado (.env).');
  const r = await reqRaw('POST', '/api/v2/login', { email: EMAIL(), password: PASS(), device_platform: 'web' });
  if (r.code !== 200) throw new Error('BotVendas login falhou: ' + r.code + ' ' + r.body.slice(0, 120));
  const j = JSON.parse(r.body);
  _tok = j.token; _exp = Date.now() + 50 * 60 * 1000; // renova antes de 1h
  return _tok;
}
async function get(path, retry = true) {
  const t = await token();
  const r = await reqRaw('GET', path, null, t);
  if (r.code === 401 && retry) { _tok = null; return get(path, false); } // token expirou → reloga 1x
  if (r.code >= 400) throw new Error('BotVendas ' + r.code + ': ' + r.body.slice(0, 150));
  try { return JSON.parse(r.body); } catch { return r.body; }
}

// Setores (vendedores/atendentes) do bot
const setores = () => get('/api/v2/attendance-dashboard/sectors');
// Funil de pedidos por setor + status (buckets com orders_count e avg_tme_in_seconds)
const funilSetorStatus = (sector, status) => get(`/api/v2/attendance-dashboard/orders-by-sector-status?sector=${sector}&status=${status}`);
// Métodos de delivery configurados
const delivery = () => get('/api/v2/delivery');
// Canais de atendimento (whatsapp-shops): "Loja - Fixo/Celular" com id (usado no filtro shop_ids)
const canais = () => get('/api/v2/companies/whatsapp-shops');
// filtro de canais → &shop_ids[]=..
const qShops = ids => (Array.isArray(ids) && ids.length) ? ids.map(i => `&shop_ids[]=${i}`).join('') : '';
// Resumo de vendas do bot: pedidos por status + vendas por faixa de tempo (data = ini_date/end_date)
const resumoVendas = (ini, fim, shops) => get(`/api/v2/detailed-sales/resume?ini_date=${ini}&end_date=${fim}${qShops(shops)}`);
// Vendas por atendente do bot (nome, sum_total, orders_counter, avg_total, tma=tempo médio atend. em s)
const vendedores = (ini, fim, shops) => get(`/api/v2/detailed-sales/sellers?ini_date=${ini}&end_date=${fim}${qShops(shops)}`);

// Satisfação: agrega as respostas (satisfaction-answers/list) — média, distribuição por nota, por operador.
async function satisfacao(ini, fim, shops) {
  const shopList = (Array.isArray(shops) && shops.length) ? shops : [null];
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const porOp = new Map(); // nome -> {soma, n}
  let total = 0, soma = 0;
  for (const shop of shopList) {
    for (let page = 1; page <= 8; page++) { // teto de páginas p/ não pesar
      const q = `/api/v2/satisfaction-answers/list?from_date=${ini}&to_date=${fim}&page=${page}${shop ? '&shop_id=' + shop : ''}`;
      let r; try { r = await get(q); } catch { break; }
      const data = r?.data || [];
      for (const a of data) {
        const nota = parseInt(a.answer, 10);
        if (!(nota >= 1 && nota <= 5)) continue;
        dist[nota]++; total++; soma += nota;
        const op = (a.attendant_name || a.attendant || (a.attendant && a.attendant.name) || '—');
        const nm = typeof op === 'string' ? op : (op?.name || '—');
        if (!porOp.has(nm)) porOp.set(nm, { soma: 0, n: 0 }); const o = porOp.get(nm); o.soma += nota; o.n++;
      }
      if (!r?.next_page_url) break; // acabou a paginação
    }
  }
  const operadores = [...porOp.entries()].map(([nome, o]) => ({ nome, media: Math.round(o.soma / o.n * 10) / 10, respostas: o.n }))
    .filter(o => o.respostas >= 1).sort((a, b) => b.media - a.media || b.respostas - a.respostas);
  return { ok: true, total, media: total ? Math.round(soma / total * 10) / 10 : null, distribuicao: dist, operadores };
}

// Painel consolidado do bot p/ a tela de Entrega. shops = array de ids de canal (opcional).
// ⚠️ A API de atendentes (sellers) só retorna dados quando recebe shop_ids. Por isso, quando o
// usuário não seleciona nenhum canal ("Todos"), mandamos TODOS os ids explicitamente — senão vem vazio.
async function painel(ini, fim, shops) {
  const cns = await canais().catch(() => null);
  const canaisList = Array.isArray(cns) ? cns.map(c => ({ id: c.id, nome: c.name })) : [];
  const allIds = canaisList.map(c => c.id);
  const filtro = (Array.isArray(shops) && shops.length) ? shops : allIds; // vazio = todos os canais (ids explícitos)
  const [resumo, vends, sat] = await Promise.all([
    resumoVendas(ini, fim, filtro).catch(() => null),
    vendedores(ini, fim, filtro).catch(() => null),
    satisfacao(ini, fim, filtro).catch(() => null),
  ]);
  const num = v => Number(v) || 0;
  const geral = (resumo?.general_sales || []).map(g => ({ status: g.status, label: g.label, quantidade: num(g.quantity) }));
  const porTempo = (resumo?.seller_sales_by_time || []).map(t => ({ label: t.label, quantidade: num(t.quantity) }));
  const atendentes = (Array.isArray(vends) ? vends : []).map(v => ({
    nome: v.name, total: num(v.sum_total), pedidos: num(v.orders_counter), ticket: num(v.avg_total), tmaSeg: num(v.tma),
  })).sort((a, b) => b.total - a.total);
  return { ok: true, periodo: { ini, fim }, geral, porTempo, atendentes, satisfacao: sat, canais: canaisList, canaisSelecionados: filtro };
}

module.exports = { habilitado, token, get, setores, funilSetorStatus, delivery, canais, resumoVendas, vendedores, satisfacao, painel };
