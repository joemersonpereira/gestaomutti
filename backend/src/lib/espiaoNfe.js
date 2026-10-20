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

// impressão digital do token (8 hex do sha256) — mostra QUAL token está carregado sem expor o valor
const digital = t => (t ? require('crypto').createHash('sha256').update(t).digest('hex').slice(0, 8) : null);
function tokensCarregados() { return { conta: digital(CONTA), usuario: digital(USUARIO) }; }

const NOME_HTTP = { 400: 'Requisição inválida', 401: 'Não autorizado', 403: 'Proibido', 404: 'Não encontrado', 429: 'Limite de chamadas', 500: 'Erro interno', 502: 'Gateway inválido', 503: 'Indisponível', 504: 'Tempo esgotado' };
// o que costuma estar por trás de cada código (visto na API v1-cloud)
function dicaPorStatus(status, msg) {
  if (status === 0) return 'Sem resposta da API do Espião (rede, DNS ou tempo esgotado). Tente de novo; se persistir, confira ESPIAO_V1_API_BASE e a saída de internet do servidor.';
  if (status === 401) {
    if (/token u/i.test(msg)) return 'O token de USUÁRIO (ESPIAO_V1_TOKEN_USUARIO, header user-token) foi recusado.';
    if (/token c/i.test(msg)) return 'O token de CONTA (ESPIAO_V1_TOKEN_CONTA, header esp-cloud-token) foi recusado.';
    return 'A API recusou o par de tokens (conta + usuário). Confira se os dois foram gerados na mesma conta Espião, se o módulo API Cloud está liberado e se o token do usuário passou pelo step-up.';
  }
  if (status === 403) return 'Os tokens foram aceitos, mas não têm permissão para este recurso (módulo não contratado ou CNPJ fora da conta).';
  if (status === 404) return 'Recurso não encontrado no Espião (nota/CNPJ inexistente na conta, ou o endpoint mudou).';
  if (status === 429) return 'Limite de chamadas da API do Espião atingido. Aguarde alguns segundos e tente de novo.';
  if (status >= 500) return 'Falha do lado do Espião. Tente de novo em alguns minutos.';
  return null;
}
// monta o erro que vai para a tela: código + mensagem da API + endpoint + dica
function falha(status, msgApi, path) {
  const msg = String(msgApi || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); // alguns endpoints devolvem <string>…</string>
  const codigo = status ? `HTTP ${status}${NOME_HTTP[status] ? ' (' + NOME_HTTP[status] + ')' : ''}` : 'sem resposta';
  const dica = dicaPorStatus(status, msg);
  const erro = `${status ? `Espião respondeu ${codigo}` : 'Espião não respondeu'} em ${path}${msg ? `: "${msg}"` : ''}.${dica ? ' ' + dica : ''}`;
  return { ok: false, status: status || null, erro,
    detalhe: { status: status || null, codigo, mensagemApi: msg || null, endpoint: path, dica, tokens: tokensCarregados(), em: new Date().toISOString() } };
}

// a API admite no máximo 3 chamadas/s (responde 429 acima disso): fila única, ≥ 400 ms entre chamadas
const INTERVALO_MS = 400;
let fila = Promise.resolve();
const espera = ms => new Promise(r => setTimeout(r, ms));
function naVez() { const vez = fila.then(() => espera(INTERVALO_MS)); fila = vez; return fila; }

async function _get(path, params) {
  const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null && v !== '')).toString();
  for (let tentativa = 1; ; tentativa++) {
    await naVez();
    let r;
    try { r = await fetch(`${BASE}${path}${qs ? '?' + qs : ''}`, { headers: headers(), signal: AbortSignal.timeout(30000) }); }
    catch (e) { return { status: 0, ok: false, json: { mensagem: (e.cause && (e.cause.code || e.cause.message)) || e.name || e.message }, path }; }
    if (r.status === 429 && tentativa < 3) { await espera(1500 * tentativa); continue; }
    const txt = await r.text();
    let json; try { json = txt ? JSON.parse(txt) : {}; } catch { json = { mensagem: txt.slice(0, 300) }; }
    return { status: r.status, ok: r.ok, json, path };
  }
}
const falhaDe = r => falha(r.status, r.json && (r.json.mensagem || r.json.message || r.json.erro), r.path);
const naoConfigurado = () => ({ ok: false, status: null,
  erro: 'Tokens do Espião não configurados (.env): falta ' + [!CONTA && 'ESPIAO_V1_TOKEN_CONTA', !USUARIO && 'ESPIAO_V1_TOKEN_USUARIO'].filter(Boolean).join(' e ') + '.',
  detalhe: { status: null, tokens: tokensCarregados() } });

// testa a credencial sem depender de CNPJ específico (usa a lista de empresas)
async function testarConexao() {
  if (!habilitado()) return naoConfigurado();
  const r = await _get('/v1-cloud/empresas', {});
  if (r.ok) return { ok: true, status: r.status, detalhe: { status: r.status, endpoint: r.path, tokens: tokensCarregados(), em: new Date().toISOString() } };
  return falhaDe(r);
}

// resumo das NF-e do período (paginado). emitidaRecebida: 0=recebidas (entradas), 1=emitidas.
async function nfeResumoPeriodo({ cnpjCpf, dataInicial, dataFinal, emitidaRecebida = 0, modelo = 55, situacao } = {}) {
  if (!habilitado()) return naoConfigurado();
  const cnpj = soDig(cnpjCpf);
  if (cnpj.length !== 14 && cnpj.length !== 11) return { ok: false, erro: 'CNPJ/CPF inválido.' };
  const todas = []; let pagina = null; let guarda = 0;
  do {
    const r = await _get('/v1-cloud/consulta/periodo/nfe-resumo', {
      cnpjCpf: cnpj, dataInicial: isoDate(dataInicial), dataFinal: isoDate(dataFinal),
      emitidaRecebida, modelo, situacao, codigoProximaPagina: pagina,
    });
    if (!r.ok) return { ...falhaDe(r), parcial: todas };
    const body = r.json || {};
    (body.dados || []).forEach(d => todas.push(d));
    // fim da paginação = "-1" (doc v1-cloud). Pedir "-1" devolve a página 1 de novo — não pode repetir.
    pagina = body.codigoProximaPagina != null && String(body.codigoProximaPagina) !== '-1' ? String(body.codigoProximaPagina) : null;
  } while (pagina && ++guarda < 200);
  return { ok: true, notas: todas };
}

// baixa o XML de uma chave
async function xmlPorChave(chaveAcesso) {
  if (!habilitado()) return naoConfigurado();
  const r = await _get('/v1-cloud/consulta/chave/xml', { chaveAcesso: soDig(chaveAcesso) });
  if (!r.ok) return falhaDe(r);
  return { ok: true, dados: r.json };
}

module.exports = { habilitado, tokensCarregados, testarConexao, nfeResumoPeriodo, xmlPorChave };
