// espiaoNfe.js — cliente da API v1-cloud do Espião NFe (captura de XML via SEFAZ).
// Autenticação por HEADER (swagger v1-cloud): esp-cloud-token (conta) + user-token (usuário).
// Tokens no .env: ESPIAO_V1_TOKEN_CONTA, ESPIAO_V1_TOKEN_USUARIO, ESPIAO_V1_API_BASE.
// Usado pra cruzar o que a SEFAZ tem × o que foi lançado no Alpha (NF de entrada não lançada).
const BASE = (process.env.ESPIAO_V1_API_BASE || 'https://api.espiaonfe.com.br').replace(/\/$/, '');
const CONTA = process.env.ESPIAO_V1_TOKEN_CONTA || '';
const USUARIO = process.env.ESPIAO_V1_TOKEN_USUARIO || '';

function habilitado() { return !!(CONTA && USUARIO); }
function headers() { return { 'esp-cloud-token': CONTA, 'user-token': USUARIO, 'Accept': 'application/json' }; }
const soDig = s => String(s || '').replace(/\D/g, '');
// a API v1 espera a data no formato yyyy-MM-dd (ex.: 2026-09-01) — doc oficial
const isoDate = d => String(d || '').slice(0, 10);

async function _get(path, params) {
  const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`${BASE}${path}${qs ? '?' + qs : ''}`, { headers: headers() });
  const txt = await r.text();
  let json; try { json = txt ? JSON.parse(txt) : {}; } catch { json = { mensagem: txt }; }
  return { status: r.status, ok: r.ok, json };
}

// testa a credencial sem depender de CNPJ específico (usa a lista de empresas)
async function testarConexao() {
  if (!habilitado()) return { ok: false, erro: 'Tokens do Espião não configurados (.env).' };
  const r = await _get('/v1-cloud/empresas', {});
  if (r.ok) return { ok: true };
  return { ok: false, status: r.status, erro: (r.json && r.json.mensagem) || `HTTP ${r.status}` };
}

// resumo das NF-e do período (paginado). emitidaRecebida: 0=recebidas (entradas), 1=emitidas.
async function nfeResumoPeriodo({ cnpjCpf, dataInicial, dataFinal, emitidaRecebida = 0, modelo = 55, situacao } = {}) {
  if (!habilitado()) return { ok: false, erro: 'Tokens do Espião não configurados (.env).' };
  const cnpj = soDig(cnpjCpf);
  if (cnpj.length !== 14 && cnpj.length !== 11) return { ok: false, erro: 'CNPJ/CPF inválido.' };
  const todas = []; let pagina = null; let guarda = 0;
  do {
    const r = await _get('/v1-cloud/consulta/periodo/nfe-resumo', {
      cnpjCpf: cnpj, dataInicial: isoDate(dataInicial), dataFinal: isoDate(dataFinal),
      emitidaRecebida, modelo, situacao, codigoProximaPagina: pagina,
    });
    if (!r.ok) return { ok: false, status: r.status, erro: (r.json && r.json.mensagem) || `HTTP ${r.status}`, parcial: todas };
    const body = r.json || {};
    (body.dados || []).forEach(d => todas.push(d));
    pagina = body.codigoProximaPagina || null;
  } while (pagina && ++guarda < 200);
  return { ok: true, notas: todas };
}

// baixa o XML de uma chave
async function xmlPorChave(chaveAcesso) {
  if (!habilitado()) return { ok: false, erro: 'Tokens do Espião não configurados (.env).' };
  const r = await _get('/v1-cloud/consulta/chave/xml', { chaveAcesso: soDig(chaveAcesso) });
  if (!r.ok) return { ok: false, status: r.status, erro: (r.json && r.json.mensagem) || `HTTP ${r.status}` };
  return { ok: true, dados: r.json };
}

module.exports = { habilitado, testarConexao, nfeResumoPeriodo, xmlPorChave };
