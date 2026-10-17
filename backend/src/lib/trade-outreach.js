// trade-outreach.js — CRM proativo de Trade (genérico): alvo = evento (ação do calendário) | plano | espaco.
// Dado o vínculo alvo→classificação(ões) do Alpha, acha as MARCAS (fabricantes) com contato cadastrado
// e manda e-mail de oportunidade. Envio manual (agora) + rotina automática (X dias antes da data do alvo).
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { enviarEmail, smtpOk } = require('./mailer');
const uuid = () => require('crypto').randomUUID();

const TIPOS = ['evento', 'plano', 'espaco'];
const hoje = () => new Date().toISOString().slice(0, 10);
const addDays = (str, n) => { const [y, m, d] = str.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return dt.toISOString().slice(0, 10); };
const fmtD = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';

// a ação ocorre nessa data? (só p/ evento recorrente; respeita janela começa/termina)
function ocorreEm(ev, dateStr) {
  if (ev.data_ini && dateStr < String(ev.data_ini).slice(0, 10)) return false;
  if (ev.data_fim && dateStr > String(ev.data_fim).slice(0, 10)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (ev.recorrencia === 'semanal' || ev.recorrencia === 'quinzenal') {
    if (dt.getDay() !== Number(ev.dia_semana)) return false;
    if (ev.recorrencia === 'quinzenal' && Math.floor((d - 1) / 7) % 2 !== 0) return false;
    return true;
  }
  if (ev.recorrencia === 'mensal') return Number(ev.dia_mes) === d;
  const ref = String(ev.data || ev.data_ini || '').slice(0, 10);
  return ref === dateStr;
}
function proximaOcorrencia(ev, fromStr) {
  let dstr = fromStr;
  for (let i = 0; i < 420; i++) { if (ocorreEm(ev, dstr)) return dstr; dstr = addDays(dstr, 1); }
  return null;
}

// resolve o "dono" (nome/descrição p/ o e-mail + a data relevante p/ o agendamento)
function owner(emp, tipo, id) {
  if (tipo === 'evento') { const e = db.prepare('SELECT * FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(id, emp); return e && { tipo, nome: e.nome, descricao: e.descricao, ev: e, inativo: e.status === 'inativo', proxData: proximaOcorrencia(e, hoje()) }; }
  if (tipo === 'plano') { const p = db.prepare('SELECT id, nome, chamada, veic_ini, veic_fim, status FROM tmkt_plano WHERE id=? AND empresa_id=?').get(id, emp); return p && { tipo, nome: p.nome, descricao: p.chamada, inativo: ['encerrado', 'arquivado', 'inativo'].includes(p.status), proxData: p.veic_ini ? String(p.veic_ini).slice(0, 10) : null }; }
  if (tipo === 'espaco') { const s = db.prepare('SELECT id, espaco, area, loja_nome FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(id, emp); return s && { tipo, nome: s.espaco, descricao: [s.area, (s.loja_nome && s.loja_nome !== 'ESCRITÓRIO') ? s.loja_nome : ''].filter(Boolean).join(' · '), inativo: false, proxData: null }; }
  return null;
}

// marcas (fabricantes) das classificações vinculadas ao alvo, COM contato de e-mail cadastrado
async function marcasAlvo(emp, tipo, id) {
  const classifs = db.prepare('SELECT DISTINCT classificacao_id FROM tmkt_crm_vinculo WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=?').all(emp, tipo, String(id)).map(r => String(r.classificacao_id));
  if (!classifs.length || !habilitado()) return [];
  const ph = classifs.map((_, i) => '$' + (i + 1)).join(',');
  let marcas = [];
  try {
    marcas = await erpQuery(`SELECT DISTINCT fab.id fabricante_id, COALESCE(pp.razaosocial, pp.nome) marca
      FROM classificacaoproduto cp JOIN produto pr ON pr.id=cp.produtoid JOIN fabricante fab ON fab.id=pr.fabricanteid JOIN pessoa pp ON pp.id=fab.pessoaid
      WHERE cp.classificacaoid IN (${ph})`, classifs);
  } catch (e) { return []; }
  const contatos = db.prepare(`SELECT fabricante_id, email, responsavel FROM tmkt_marca_contato WHERE empresa_id=? AND email IS NOT NULL AND email<>''`).all(emp)
    .reduce((m, c) => (m[String(c.fabricante_id)] = c, m), {});
  return marcas.map(m => { const c = contatos[String(m.fabricante_id)]; return { fabricante_id: String(m.fabricante_id), marca: m.marca, email: c ? c.email : null, responsavel: c ? c.responsavel : null }; })
    .filter(x => x.email);
}

const ZAP = '557598978941';
const ROTULO = { evento: 'ação', plano: 'plano', espaco: 'espaço' };
function assuntoDe(cfg, o) { return (cfg && cfg.assunto) ? cfg.assunto : `Oportunidade de Trade · ${o.nome} · Grupo Mutti`; }
function htmlDe(cfg, o, alvo, occ) {
  const quando = occ ? `<p>Data de referência: <b>${fmtD(occ)}</b>.</p>` : '';
  const extra = (cfg && cfg.mensagem) ? `<p>${String(cfg.mensagem).replace(/\n/g, '<br>')}</p>` : '';
  const zap = `https://wa.me/${ZAP}?text=${encodeURIComponent('Temos interesse em "' + o.nome + '" (Trade Grupo Mutti).')}`;
  return `<div style="font-family:Arial,sans-serif;color:#243;max-width:560px">
    <h2 style="color:#1E874B">Grupo Mutti · Trade Marketing</h2>
    <p>Olá${alvo.responsavel ? ', ' + alvo.responsavel : ''}! Aqui é o time de Trade do <b>Grupo Mutti</b> (8 lojas no litoral norte da Bahia).</p>
    <p>Temos uma oportunidade pra <b>${alvo.marca}</b> no nosso ${ROTULO[o.tipo] || 'trade'} <b>${o.nome}</b>${o.descricao ? ' — ' + o.descricao : ''}: a sua marca no momento certo da jornada do nosso cliente, com apuração de sell-out.</p>
    ${quando}
    ${extra}
    <p>Quer os formatos e valores? É só responder este e-mail ou chamar no WhatsApp: <a href="${zap}">${ZAP}</a>.</p>
    <p style="color:#94a3b8;font-size:12px">Nome e CPF de cliente não são compartilhados — você recebe só números totais.</p></div>`;
}

// envia a oportunidade de um alvo para as marcas com contato. soPendentes = não repete quem já recebeu nessa ocorrência.
async function enviarOportunidade(emp, tipo, id, opts = {}) {
  if (!TIPOS.includes(tipo)) throw new Error('Tipo inválido.');
  const o = owner(emp, tipo, id);
  if (!o) throw new Error('Alvo não encontrado.');
  if (!smtpOk()) throw new Error('SMTP não configurado no servidor.');
  const cfg = db.prepare('SELECT * FROM tmkt_crm_outreach WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=?').get(emp, tipo, String(id)) || {};
  const occ = opts.ocorrencia || o.proxData || hoje();
  const soPendentes = opts.soPendentes !== false;
  const alvos = await marcasAlvo(emp, tipo, id);
  if (!alvos.length) return { ok: true, ocorrencia: occ, enviados: 0, pulados: 0, alvos: 0, semContato: true };
  const jaOk = new Set(db.prepare(`SELECT fabricante_id FROM tmkt_outreach_log WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=? AND ocorrencia=? AND canal='email' AND status='ok'`).all(emp, tipo, String(id), occ).map(r => String(r.fabricante_id)));
  const insLog = db.prepare(`INSERT INTO tmkt_outreach_log (id,empresa_id,evento_id,escopo_tipo,escopo_id,ocorrencia,fabricante_id,marca_nome,email,canal,status,erro,enviado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`);
  let enviados = 0, pulados = 0;
  for (const a of alvos) {
    if (soPendentes && jaOk.has(String(a.fabricante_id))) { pulados++; continue; }
    try {
      await enviarEmail({ to: a.email, subject: assuntoDe(cfg, o), html: htmlDe(cfg, o, a, occ) });
      insLog.run(uuid(), emp, (tipo === 'evento' ? String(id) : null), tipo, String(id), occ, a.fabricante_id, a.marca, a.email, 'email', 'ok', null);
      enviados++;
    } catch (e) {
      insLog.run(uuid(), emp, (tipo === 'evento' ? String(id) : null), tipo, String(id), occ, a.fabricante_id, a.marca, a.email, 'email', 'erro', String(e.message).slice(0, 200));
    }
  }
  return { ok: true, ocorrencia: occ, enviados, pulados, alvos: alvos.length };
}

// rotina automática: X dias antes da data do alvo, dispara pras marcas pendentes.
async function rodarOutreachAuto() {
  if (!smtpOk()) return;
  let cfgs = [];
  try { cfgs = db.prepare('SELECT empresa_id, escopo_tipo, escopo_id, dias_antes FROM tmkt_crm_outreach WHERE ativo=1').all(); } catch (e) { return; }
  for (const c of cfgs) {
    try {
      const o = owner(c.empresa_id, c.escopo_tipo, c.escopo_id);
      if (!o || o.inativo) continue;
      const target = addDays(hoje(), Number(c.dias_antes) || 15);
      let occ = null;
      if (c.escopo_tipo === 'evento') { if (!ocorreEm(o.ev, target)) continue; occ = target; }
      else if (c.escopo_tipo === 'plano') { if (!o.proxData || o.proxData !== target) continue; occ = o.proxData; }
      else continue; // espaco: sem data → só disparo manual
      const r = await enviarOportunidade(c.empresa_id, c.escopo_tipo, c.escopo_id, { ocorrencia: occ, soPendentes: true });
      if (r.enviados) console.log(`[outreachAuto] ${c.empresa_id} · ${c.escopo_tipo} ${o.nome}: ${r.enviados} marca(s) avisada(s) p/ ${occ}`);
    } catch (e) { /* pula a que falhar */ }
  }
}

module.exports = { marcasAlvo, enviarOportunidade, rodarOutreachAuto, proximaOcorrencia, ocorreEm, owner, TIPOS };
