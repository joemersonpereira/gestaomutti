// trivioCrm.js — CRM (cuidar dos clientes) lendo a API interna do Trivio (api.triv.io).
// Endpoints e formato de query descobertos no código do MCP oficial do Trivio (Joe 2026-11-15):
//   • Resultado de campanhas (Resumo geral): GET /api/v2/campaigns/result/overview
//   • Vendas de uma campanha (quem comprou + RFV antes/depois): GET /api/v2/campaigns/{id}/result/sales
//   • Auditoria de envios (recebeu/respondeu/falhou): GET /api/v1/campaign/lead/analysis
//   • Retenção: GET /api/v1/customers/retention-indicators
// Auth = Bearer JWT (login reusado do trivioPdv). GETs de lista usam ?criterias=[{Key,Value,...}]&page={From,Size}.
const { sessionToken, temCredenciais, API: apiBase, fetchRankingVendedores, fetchFilipeta } = require('./trivioPdv');

function habilitado() { return temCredenciais(); }
function base() { return apiBase(); }

const crit = (k, v) => ({ Key: k, Value: v, Condition: 'OR', Operator: 'EQUAL' });
// Monta a query de lista do Trivio (criterias + page) ignorando valores vazios.
function listQuery(pares, { from = 0, size = 200 } = {}) {
  const criterias = Object.entries(pares)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => crit(k, v));
  return new URLSearchParams({
    criterias: JSON.stringify(criterias),
    orderByField: '',
    page: JSON.stringify({ From: from, Size: size }),
    isOrderByDesc: 'false',
  }).toString();
}

async function trivioGet(path, qs) {
  const tok = await sessionToken();
  const url = `${base()}${path}${qs ? '?' + qs : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } });
  if (r.status === 401) { // token expirou entre o cache e a chamada — força 1 relogin
    const tok2 = await sessionToken();
    const r2 = await fetch(url, { headers: { Authorization: `Bearer ${tok2}`, Accept: 'application/json' } });
    if (!r2.ok) throw new Error(`Trivio ${path} HTTP ${r2.status}`);
    return r2.json();
  }
  if (!r.ok) throw new Error(`Trivio ${path} HTTP ${r.status}`);
  return r.json();
}

// ── Resumo geral de campanhas no período (por campanha: enviados, compraram, vendas, ROI…) ──
async function campanhasOverview({ de, ate } = {}) {
  if (!habilitado()) return { erp: false };
  const qs = listQuery({ StartDate: de, EndDate: ate });
  const j = await trivioGet('/api/v2/campaigns/result/overview', qs);
  // Respostas por campanha = soma dos answers das mensagens cobradas (chargedMessages).
  const data = (j.data || []).map(c => ({ ...c, respostas: (c.chargedMessages || []).reduce((a, m) => a + (Number(m.answers) || 0), 0) }));
  const respostas = data.reduce((a, c) => a + c.respostas, 0);
  return { erp: true, summary: { ...(j.summary || {}), respostas }, data };
}

// ── Fidelização ao longo do tempo (Fiel / Potencial / Ocasional) ──
async function fidelizacao({ de, ate } = {}) {
  if (!habilitado()) return { erp: false };
  const toIso = s => s ? new Date(s + 'T03:00:00Z').toISOString() : undefined;
  const qs = new URLSearchParams({ startDate: toIso(de) || '', endDate: toIso(ate) || '' }).toString();
  const j = await trivioGet('/customerapp/api/v1/loyaltyprofile/segmentation', qs);
  return { erp: true, ...j };
}

// ── Análise de sugestão (PDV+) — taxa de conversão por vendedor/loja (Metabase 3026) ──
async function sugestao({ mes, ano } = {}) {
  if (!habilitado()) return { erp: false };
  const now = new Date();
  const m = Number(mes) || (now.getMonth() + 1), y = Number(ano) || now.getFullYear();
  const rows = await fetchRankingVendedores(m, y);
  return { erp: true, mes: m, ano: y, vendedores: rows };
}

// ── Resultado das filipetas (encartes) por loja (Metabase 4874) ──
async function filipetas({ mes, ano } = {}) {
  if (!habilitado()) return { erp: false };
  const now = new Date();
  const m = Number(mes) || (now.getMonth() + 1), y = Number(ano) || now.getFullYear();
  const lojas = await fetchFilipeta(m, y);
  const tot = lojas.reduce((a, l) => ({
    ofertas: a.ofertas + l.ofertas, impressas: a.impressas + l.impressas, convertidas: a.convertidas + l.convertidas,
    itens: a.itens + l.itens, totalVendido: a.totalVendido + l.totalVendido,
  }), { ofertas: 0, impressas: 0, convertidas: 0, itens: 0, totalVendido: 0 });
  tot.conversao = tot.impressas ? Math.round((tot.convertidas / tot.impressas) * 1000) / 10 : 0;
  return { erp: true, mes: m, ano: y, total: tot, lojas };
}

// ── Vendas atribuídas a uma campanha (quem comprou, RFV anterior → posterior) ──
async function campanhaVendas(campaignId, { de, ate, campaignDigitalId, from = 0, size = 100 } = {}) {
  if (!habilitado()) return { erp: false };
  const qs = listQuery({ CampaignDigitalId: campaignDigitalId, StartDate: de, EndDate: ate }, { from, size });
  const j = await trivioGet(`/api/v2/campaigns/${campaignId}/result/sales`, qs);
  return { erp: true, ...j };
}

// ── Auditoria de envios: quem recebeu cada campanha, status (entregue/erro), respostas ──
async function auditoriaEnvios({ de, ate, busca, campaignDigitalId, onlyFailed, onlyAnswered, from = 0, size = 50 } = {}) {
  if (!habilitado()) return { erp: false };
  const qs = listQuery({
    SearchInput: busca, CampaignDigitalId: campaignDigitalId, StartDate: de, EndDate: ate,
    OnlyFailedMessages: onlyFailed ? 'true' : undefined,
    OnlyAnsweredMessages: onlyAnswered ? 'true' : undefined,
  }, { from, size });
  const j = await trivioGet('/api/v1/campaign/lead/analysis', qs);
  return { erp: true, ...j };
}

// ── Detalhe de 1 envio: mensagem enviada + cupom + RESPOSTAS do cliente (texto) ──
async function envioDetalhe({ customerId, campaignDigitalId, campaignDigitalEventId, messageConsolidationId } = {}) {
  if (!habilitado()) return { erp: false };
  const qs = new URLSearchParams({
    customerId: customerId || '', campaignDigitalId: campaignDigitalId || '',
    campaignDigitalEventId: campaignDigitalEventId || '', messageConsolidationId: messageConsolidationId || '',
  }).toString();
  const j = await trivioGet('/api/v1/campaign/lead/message/details', qs);
  return { erp: true, message: j.message || '', discountCoupon: j.discountCoupon || null, answers: j.answers || [] };
}

// ── Lista de campanhas (para o seletor) ──
async function listarCampanhas({ nome, from = 0, size = 100 } = {}) {
  if (!habilitado()) return { erp: false };
  const qs = listQuery({ Name: nome }, { from, size }) + '&isResumed=true';
  const j = await trivioGet('/api/v1/campaign', qs);
  return { erp: true, campanhas: (j.data || []).map(c => ({ id: c.id, name: c.name, active: c.active })) };
}

// ── Retenção (retenção %, churn, receita, ticket, frequência) ──
async function retencao({ periodType = 0, windowType = 2, merchantIds = '', merchantGroupIds = '' } = {}) {
  if (!habilitado()) return { erp: false };
  const qs = new URLSearchParams({ windowType: String(windowType), periodType: String(periodType), merchantIds, merchantGroupIds }).toString();
  const j = await trivioGet('/api/v1/customers/retention-indicators', qs);
  return { erp: true, ...j };
}

module.exports = { habilitado, campanhasOverview, campanhaVendas, auditoriaEnvios, envioDetalhe, listarCampanhas, retencao, fidelizacao, sugestao, filipetas };
