// tangerino.js — integração com a API do Tangerino/Sólides (ponto eletrônico).
// Autenticação: header "Authorization: Basic <TANGERINO_TOKEN>" (o token vem do .env, nunca no código).
const https = require('https');

const TOKEN = () => process.env.TANGERINO_TOKEN || '';
const habilitado = () => !!TOKEN();

// Hosts da API (conforme docs.tangerino.com.br)
const HOST_EMPLOYER = 'employer.tangerino.com.br'; // cadastro/gestão (colaboradores)
const HOST_API = 'api.tangerino.com.br';           // /api/punch (batidas), /api/report (relatórios)

function req(host, path, query) {
  return new Promise((resolve, reject) => {
    const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
    const options = {
      hostname: host, path: path + qs, method: 'GET',
      headers: { 'Authorization': 'Basic ' + TOKEN(), 'Accept': 'application/json' },
    };
    const r = https.request(options, res => {
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Tangerino ${res.statusCode}: ${data.slice(0, 300)}`));
        try { resolve(data ? JSON.parse(data) : null); } catch (e) { resolve(data); }
      });
    });
    r.on('error', reject); r.setTimeout(20000, () => r.destroy(new Error('Tangerino: timeout'))); r.end();
  });
}

// POST JSON (escrita: inserir batida, lançar ajuste)
function post(host, path, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj || {});
    const r = https.request({
      hostname: host, path, method: 'POST',
      headers: { 'Authorization': 'Basic ' + TOKEN(), 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Tangerino ${res.statusCode}: ${(data || '').slice(0, 400)}`));
        try { resolve(data ? JSON.parse(data) : { ok: true }); } catch (e) { resolve({ ok: true }); }
      });
    });
    r.on('error', reject); r.setTimeout(20000, () => r.destroy(new Error('Tangerino: timeout'))); r.write(body); r.end();
  });
}

// Colaboradores (paginado)
function colaboradores(page = 0, size = 100) {
  return req(HOST_EMPLOYER, '/employee/find-all', { page, size });
}

// A API do Tangerino mapeia datas em MILISSEGUNDOS (epoch). Converte 'yyyy-MM-dd'.
const ms = (d, fimDoDia) => {
  if (d == null || d === '') return undefined;
  if (/^\d+$/.test(String(d))) return Number(d); // já é epoch
  const dt = new Date(String(d) + 'T' + (fimDoDia ? '23:59:59.999' : '00:00:00.000'));
  return isNaN(dt) ? undefined : dt.getTime();
};

// Batidas/marcações de ponto por período (e opcionalmente por colaborador)
function batidas({ startDate, endDate, employeeId, page = 0, size = 200 } = {}) {
  return req(HOST_API, '/api/punch', { startDate: ms(startDate), endDate: ms(endDate, true), employeeId, page, size });
}

// Espelho de ponto (relatório PDF em base64)
function espelho({ startDate, endDate, employeeId } = {}) {
  return req(HOST_API, '/api/report/time-sheet', { startDate: ms(startDate), endDate: ms(endDate, true), employeeId });
}

// Todas as batidas do período (pagina até acabar; teto de segurança em maxRegistros).
async function todasBatidas({ startDate, endDate, employeeId, maxRegistros = 5000 } = {}) {
  const out = []; const size = 500;
  for (let page = 0; page < 40; page++) {
    const r = await batidas({ startDate, endDate, employeeId, page, size });
    const arr = Array.isArray(r) ? r : (r && r.content) || [];
    out.push(...arr);
    if (arr.length < size || out.length >= maxRegistros) break;
  }
  return out;
}

// Todos os colaboradores (pagina).
async function todosColaboradores() {
  const out = []; const size = 200;
  for (let page = 0; page < 30; page++) {
    const r = await colaboradores(page, size);
    const arr = Array.isArray(r) ? r : (r && r.content) || [];
    out.push(...arr);
    if (arr.length < size) break;
  }
  return out;
}

// ── Escrita: correções de ponto ───────────────────────────────────────────
// Justificativas de edição manual (p/ inserir batida em atraso) e motivos de ajuste (p/ abono).
const justificativas = () => req(HOST_API, '/api/punch/manual-editing-justification-punch', { page: 0, size: 100 });
const motivosAjuste = () => req(HOST_EMPLOYER, '/adjustment-reason/find-all', { page: 0, size: 100 });

// Data 'yyyy-MM-dd' + hora 'HH:MM' → ISO com timezone da Bahia (-03:00).
const isoBahia = (data, hora) => `${data}T${(hora || '00:00')}:00.000-0300`;

// Insere uma batida faltante (ex.: esqueceu de bater entrada/saída).
function inserirBatida({ employeeId, data, hora, justificationId }) {
  return post(HOST_API, '/api/punch/register/late/1.1', {
    employeeId: String(employeeId), date: isoBahia(data, hora), manualEditingJustificationId: justificationId,
  });
}

// Lança um ajuste/abono (ex.: abonar uma falta). Datas em milissegundos, dia inteiro.
function lancarAjuste({ employeeId, dataIni, dataFim, reasonId, status = 'APROVADO', fullDay = true }) {
  const ms0 = new Date(`${dataIni}T00:00:00.000-0300`).getTime();
  const ms1 = new Date(`${(dataFim || dataIni)}T23:59:59.000-0300`).getTime();
  return post(HOST_EMPLOYER, '/adjustment/register', {
    adjustmentReasonDTO: { id: reasonId }, employeeDTO: { id: String(employeeId) },
    startDate: ms0, endDate: ms1, fullDay, origem: 'Mutti', status,
  });
}

module.exports = { habilitado, colaboradores, batidas, espelho, todasBatidas, todosColaboradores, justificativas, motivosAjuste, inserirBatida, lancarAjuste };
