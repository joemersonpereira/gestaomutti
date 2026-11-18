// hoptodeskLib.js — chamados do HopToDesk (Joe 2026-11-14). Recebe por WEBHOOK (push, assinado) e/ou
// puxa pela API (getTickets) quando HOPTODESK_API_KEY estiver no .env. Store em hoptodesk_ticket.
const crypto = require('crypto');
const db = require('../db/connection');

const CONCLUIDO = ['resolved', 'closed'];                 // status que contam como concluído
const ABERTO = ['open', 'in_progress', 'waiting'];        // status em aberto
const STATUS_LABEL = { open: 'Aberto', in_progress: 'Em andamento', waiting: 'Aguardando cliente', resolved: 'Resolvido', closed: 'Fechado' };
const PRIO_LABEL = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };

const SECRET = () => process.env.HOPTODESK_WEBHOOK_SECRET || '';
const API_KEY = () => process.env.HOPTODESK_API_KEY || '';
const API_BASE = () => process.env.HOPTODESK_API_BASE || 'https://dashboard.hoptodesk.com/api';

// Assinatura: header "sha256=<hex HMAC-SHA256(raw body, secret)>".
function assinaturaOk(rawBody, header) {
  const sec = SECRET(); if (!sec) return false;
  if (!header || !rawBody) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', sec).update(rawBody).digest('hex');
  try { const a = Buffer.from(header); const b = Buffer.from(esperado); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

const now = () => new Date().toISOString();
function upsert(t) {
  // merge com o existente (status_changed só traz alguns campos).
  const ex = db.prepare('SELECT * FROM hoptodesk_ticket WHERE id=?').get(t.id) || {};
  const m = { ...ex, ...Object.fromEntries(Object.entries(t).filter(([, v]) => v != null && v !== '')) };
  if (CONCLUIDO.includes(m.status) && !m.resolvido_em) m.resolvido_em = now();
  if (m.status && !CONCLUIDO.includes(m.status)) m.resolvido_em = m.resolvido_em && ABERTO.includes(m.status) ? null : m.resolvido_em;
  db.prepare(`INSERT INTO hoptodesk_ticket (id,numero,titulo,status,prioridade,cliente,cliente_email,empresa,device_id,device_nome,origem,criado_em,atualizado_em,resolvido_em,sla_due,raw)
    VALUES (@id,@numero,@titulo,@status,@prioridade,@cliente,@cliente_email,@empresa,@device_id,@device_nome,@origem,@criado_em,@atualizado_em,@resolvido_em,@sla_due,@raw)
    ON CONFLICT(id) DO UPDATE SET numero=excluded.numero,titulo=excluded.titulo,status=excluded.status,prioridade=excluded.prioridade,
      cliente=excluded.cliente,cliente_email=excluded.cliente_email,empresa=excluded.empresa,device_id=excluded.device_id,device_nome=excluded.device_nome,
      origem=excluded.origem,atualizado_em=excluded.atualizado_em,resolvido_em=excluded.resolvido_em,sla_due=excluded.sla_due,raw=excluded.raw`)
    .run({ id: String(m.id), numero: m.numero || null, titulo: m.titulo || null, status: m.status || 'open', prioridade: m.prioridade || null,
      cliente: m.cliente || null, cliente_email: m.cliente_email || null, empresa: m.empresa || null, device_id: m.device_id || null,
      device_nome: m.device_nome || null, origem: m.origem || null, criado_em: m.criado_em || now(), atualizado_em: now(),
      resolvido_em: m.resolvido_em || null, sla_due: m.sla_due || null, raw: m.raw || null });
  return { ok: true };
}

// Conclui/reabre um chamado manualmente pelo painel (status LOCAL; um webhook/sync real pode sobrepor
// depois com o status de verdade do HopToDesk). concluir → resolved; reabrir → open (limpa resolvido_em).
function concluir(id) {
  const ex = db.prepare('SELECT id FROM hoptodesk_ticket WHERE id=?').get(String(id));
  if (!ex) return { ok: false, erro: 'Chamado não encontrado.' };
  return upsert({ id: String(id), status: 'resolved' });
}
function reabrir(id) {
  const ex = db.prepare('SELECT id FROM hoptodesk_ticket WHERE id=?').get(String(id));
  if (!ex) return { ok: false, erro: 'Chamado não encontrado.' };
  return upsert({ id: String(id), status: 'open' });
}

// Processa 1 evento do webhook (envelope {event,timestamp,dashboard_user_id,data}).
function processarEvento(evt) {
  if (!evt || !evt.event) return { ok: false };
  const d = evt.data || {};
  if (evt.event === 'ticket.created') {
    return upsert({ id: d.ticket_id, numero: d.ticket_number, titulo: d.title, status: d.status || 'open', prioridade: d.priority,
      cliente: d.customer_name, cliente_email: d.customer_email, empresa: d.company_name, device_id: d.device_id, device_nome: d.device_name,
      origem: d.source, criado_em: evt.timestamp || now(), raw: JSON.stringify(d) });
  }
  if (evt.event === 'ticket.status_changed') return upsert({ id: d.ticket_id, titulo: d.title, status: d.status });
  if (evt.event === 'ticket.customer_reply') return upsert({ id: d.ticket_id, numero: d.ticket_number, titulo: d.title, cliente: d.customer_name, status: d.reopened ? 'open' : undefined });
  if (evt.event === 'ticket.sla_breached') return upsert({ id: d.ticket_id, titulo: d.title, prioridade: d.priority, status: d.status, sla_due: d.sla_due_at });
  return { ok: true, ignorado: evt.event };
}

// Lista chamados (filtro simples por status/prioridade/busca).
function listar({ status = '', prioridade = '', busca = '', limite = 500 } = {}) {
  let sql = 'SELECT * FROM hoptodesk_ticket WHERE 1=1'; const p = [];
  if (status === 'aberto') sql += ` AND status IN (${ABERTO.map(() => '?').join(',')})`, p.push(...ABERTO);
  else if (status === 'concluido') sql += ` AND status IN (${CONCLUIDO.map(() => '?').join(',')})`, p.push(...CONCLUIDO);
  else if (status) sql += ' AND status=?', p.push(status);
  if (prioridade) sql += ' AND prioridade=?', p.push(prioridade);
  if (busca) sql += ' AND (titulo LIKE ? OR cliente LIKE ? OR numero LIKE ?)', p.push('%' + busca + '%', '%' + busca + '%', '%' + busca + '%');
  sql += ' ORDER BY (status IN (' + ABERTO.map(() => '?').join(',') + ')) DESC, atualizado_em DESC LIMIT ?'; p.push(...ABERTO, Number(limite) || 500);
  const linhas = db.prepare(sql).all(...p);
  return linhas.map(t => ({ ...t, statusLabel: STATUS_LABEL[t.status] || t.status, prioridadeLabel: PRIO_LABEL[t.prioridade] || t.prioridade,
    aberto: ABERTO.includes(t.status), concluido: CONCLUIDO.includes(t.status) }));
}

// Resumo/indicadores no período (por criado_em). abertos, concluídos, % conclusão, tempo médio de resolução, por prioridade.
function resumo({ dias = 30 } = {}) {
  const desde = new Date(Date.now() - (Number(dias) || 30) * 864e5).toISOString().slice(0, 10);
  const linhas = db.prepare("SELECT * FROM hoptodesk_ticket WHERE substr(COALESCE(criado_em,''),1,10) >= ?").all(desde);
  const total = linhas.length;
  const abertos = linhas.filter(t => ABERTO.includes(t.status)).length;
  const concluidos = linhas.filter(t => CONCLUIDO.includes(t.status)).length;
  const pctConclusao = total ? Math.round(concluidos / total * 1000) / 10 : null;
  // tempo médio de resolução (h) dos concluídos com as duas datas.
  const tempos = linhas.filter(t => t.resolvido_em && t.criado_em).map(t => (new Date(t.resolvido_em) - new Date(t.criado_em)) / 3600000).filter(h => h >= 0);
  const tempoMedioH = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length * 10) / 10 : null;
  const porPrioridade = ['urgent', 'high', 'medium', 'low'].map(p => ({ prioridade: p, label: PRIO_LABEL[p], total: linhas.filter(t => t.prioridade === p).length, abertos: linhas.filter(t => t.prioridade === p && ABERTO.includes(t.status)).length }));
  // total de abertos SEM filtro de período (fila atual) — o que mais importa pro gerente.
  const abertosAgora = db.prepare(`SELECT count(*) n FROM hoptodesk_ticket WHERE status IN (${ABERTO.map(() => '?').join(',')})`).get(...ABERTO).n;
  return { dias, total, abertos, concluidos, pctConclusao, tempoMedioH, abertosAgora, porPrioridade, configurado: db.prepare('SELECT count(*) n FROM hoptodesk_ticket').get().n > 0 };
}

// PULL pela API (getTickets) — só quando HOPTODESK_API_KEY estiver setada. Faz backfill/atualização.
async function sincronizar({ limite = 1000 } = {}) {
  const key = API_KEY(); if (!key) return { ok: false, erro: 'HOPTODESK_API_KEY não configurada (.env).' };
  let off = 0, tot = 0, gravados = 0;
  for (let i = 0; i < 20; i++) {
    const url = `${API_BASE()}?action=getTickets&limit=${Math.min(1000, limite)}&offset=${off}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) return { ok: false, erro: `HTTP ${r.status}`, gravados };
    const j = await r.json();
    const arr = j.tickets || j.data || [];
    for (const t of arr) {
      upsert({ id: t.ticket_id || t.id, numero: t.ticket_number || t.number, titulo: t.title || t.subject, status: t.status, prioridade: t.priority,
        cliente: t.customer_name || t.customer, cliente_email: t.customer_email, empresa: t.company_name || t.company,
        device_id: t.device_id, device_nome: t.device_name, origem: t.source || t.channel, criado_em: t.created_at || t.created, resolvido_em: t.resolved_at || t.closed_at || null, raw: JSON.stringify(t) });
      gravados++;
    }
    tot = j.total || arr.length; off += arr.length;
    if (!arr.length || off >= tot) break;
  }
  return { ok: true, total: tot, gravados };
}

// Semeia chamados de exemplo (só pra demonstrar a tela no preview; não roda em produção).
function semearExemplo() {
  const ex = [
    { id: 'demo-74', numero: '#74', titulo: 'ajustar a filipeta', status: 'open', prioridade: 'medium', cliente: 'Caixa 5', device_id: '303 536 500', device_nome: 'caixa5', origem: 'app', criado_em: new Date(Date.now() - 1 * 864e5).toISOString() },
    { id: 'demo-73', numero: '#73', titulo: 'ajeitar a filipeta', status: 'in_progress', prioridade: 'medium', cliente: 'Caixa 5', device_id: '303 536 500', device_nome: 'caixa5', origem: 'app', criado_em: new Date(Date.now() - 1 * 864e5).toISOString() },
    { id: 'demo-71', numero: '#71', titulo: 'Retaguarda — instalar', status: 'resolved', prioridade: 'medium', cliente: 'Entrega 3', device_id: '329 395 799', device_nome: 'desktop-h2uoura', origem: 'app', criado_em: new Date(Date.now() - 2 * 864e5).toISOString(), resolvido_em: new Date(Date.now() - 1 * 864e5).toISOString() },
    { id: 'demo-70', numero: '#70', titulo: 'instalar o retaguarda', status: 'closed', prioridade: 'medium', cliente: 'Entrega 3', device_id: '329 395 799', device_nome: 'desktop-h2uoura', origem: 'app', criado_em: new Date(Date.now() - 3 * 864e5).toISOString(), resolvido_em: new Date(Date.now() - 2 * 864e5).toISOString() },
  ];
  ex.forEach(upsert); return { ok: true, n: ex.length };
}

// ── Dispositivos (computadores) p/ Acesso remoto ──────────────────────────
// Parser simples de CSV (lida com campos entre aspas e vírgula dentro). 1ª linha = cabeçalho.
function parseCsv(txt) {
  const linhas = String(txt || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length);
  if (!linhas.length) return [];
  const campo = (l) => { const out = []; let cur = '', dentro = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') { if (dentro && l[i + 1] === '"') { cur += '"'; i++; } else dentro = !dentro; } else if (c === ',' && !dentro) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  const head = campo(linhas[0]).map(h => h.trim().toLowerCase());
  const idx = (nome) => head.findIndex(h => h === nome);
  const iNome = idx('name'), iId = idx('device id'), iStatus = idx('status'), iOs = idx('os'), iComp = idx('computer name'), iIp = idx('ip address'), iGrupo = head.findIndex(h => h.includes('group') || h.includes('grupo')), iSeen = idx('last seen'), iSess = idx('remote sessions');
  const rows = [];
  for (let k = 1; k < linhas.length; k++) {
    const c = campo(linhas[k]);
    const device_id = (c[iId] || '').replace(/\s+/g, '').trim();
    if (!device_id) continue;
    rows.push({ device_id, nome: (c[iNome] || '').trim(), computer_name: iComp >= 0 ? (c[iComp] || '').trim() : '', status: (c[iStatus] || '').trim().toLowerCase(), so: iOs >= 0 ? (c[iOs] || '').trim() : '', grupo: iGrupo >= 0 ? (c[iGrupo] || '').trim() : '', ip: iIp >= 0 ? (c[iIp] || '').trim() : '', last_seen: iSeen >= 0 ? (c[iSeen] || '').trim() : '', sessoes: iSess >= 0 ? (parseInt(c[iSess], 10) || 0) : 0 });
  }
  return rows;
}
function importarDispositivos(empresaId, csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return { ok: false, importados: 0, erro: 'CSV vazio ou sem a coluna "Device ID".' };
  const up = db.prepare(`INSERT INTO hoptodesk_device (empresa_id, device_id, nome, computer_name, status, so, grupo, ip, last_seen, sessoes, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, device_id) DO UPDATE SET nome=excluded.nome, computer_name=excluded.computer_name, status=excluded.status, so=excluded.so, grupo=COALESCE(NULLIF(excluded.grupo,''), hoptodesk_device.grupo), ip=excluded.ip, last_seen=excluded.last_seen, sessoes=excluded.sessoes, atualizado_em=excluded.atualizado_em`);
  const tx = db.transaction(() => { rows.forEach(r => up.run(empresaId, r.device_id, r.nome, r.computer_name, r.status, r.so, r.grupo, r.ip, r.last_seen, r.sessoes)); });
  tx();
  return { ok: true, importados: rows.length };
}
function listarDispositivos(empresaId) {
  return db.prepare('SELECT device_id, nome, computer_name, status, so, grupo, ip, last_seen, sessoes, atualizado_em FROM hoptodesk_device WHERE empresa_id=? ORDER BY (status=\'online\') DESC, nome').all(empresaId);
}

module.exports = { assinaturaOk, processarEvento, listar, resumo, sincronizar, semearExemplo, concluir, reabrir, importarDispositivos, listarDispositivos, CONCLUIDO, ABERTO };
