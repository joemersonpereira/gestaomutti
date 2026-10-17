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
const fmtV = x => 'R$ ' + (Number(x) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const UNID = { mes: '/mês', dia: '/dia', semana: '/sem', edicao: '/edição', periodo: '' };

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

const BASE = process.env.PUBLIC_URL || 'http://localhost:3001';
// resolve o "dono" (nome/descrição/imagem p/ o e-mail + a data relevante p/ o agendamento)
function owner(emp, tipo, id) {
  if (tipo === 'evento') { const e = db.prepare('SELECT * FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(id, emp); return e && { tipo, nome: e.nome, descricao: e.descricao, ev: e, inativo: e.status === 'inativo', proxData: proximaOcorrencia(e, hoje()), imagemUrl: e.slogan_foto ? `${BASE}/api/publico/trade/calendario/${id}/slogan` : null }; }
  if (tipo === 'plano') { const p = db.prepare(`SELECT id, nome, chamada, veic_ini, veic_fim, status, (capa_foto IS NOT NULL AND capa_foto<>'') tem_capa FROM tmkt_plano WHERE id=? AND empresa_id=?`).get(id, emp); return p && { tipo, nome: p.nome, descricao: p.chamada, inativo: ['encerrado', 'arquivado', 'inativo'].includes(p.status), proxData: p.veic_ini ? String(p.veic_ini).slice(0, 10) : null, imagemUrl: p.tem_capa ? `${BASE}/api/publico/trade/plano/${id}/capa` : null }; }
  if (tipo === 'espaco') { const s = db.prepare(`SELECT id, espaco, area, loja_nome, preco_unit, unidade, (foto IS NOT NULL AND foto<>'') tem_foto FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?`).get(id, emp); return s && { tipo, nome: s.espaco, descricao: [s.area, (s.loja_nome && s.loja_nome !== 'ESCRITÓRIO') ? s.loja_nome : ''].filter(Boolean).join(' · '), inativo: false, proxData: null, preco: s.preco_unit, unidade: s.unidade, imagemUrl: s.tem_foto ? `${BASE}/api/publico/trade/espaco/${id}/foto` : null }; }
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
function assuntoDe(cfg, o) { return (cfg && cfg.assunto) ? cfg.assunto : `Oportunidade de Trade · ${o.nome} · Grupo Mutti`; }
// e-mail bonito e convidativo — apelo "conteúdo que viraliza / entra na conversa" (oportunidade digital)
function htmlDe(cfg, o, alvo, occ) {
  const zap = `https://wa.me/${ZAP}?text=${encodeURIComponent('Temos interesse em "' + o.nome + '" (Trade Grupo Mutti).')}`;
  const foneBonito = ZAP.replace(/^55(\d\d)(\d{4,5})(\d{4})$/, '($1) $2-$3');
  const extra = (cfg && cfg.mensagem) ? `<p style="margin:16px 0 0;color:#334;font-size:15px;line-height:1.6">${String(cfg.mensagem).replace(/\n/g, '<br>')}</p>` : '';
  // bloco visual da oportunidade (capa do plano / slogan da ação / card do espaço)
  let bloco = '';
  if (o.imagemUrl) {
    bloco = `<img src="${o.imagemUrl}" alt="${o.nome}" style="width:100%;display:block;border-radius:12px" />
      <div style="font-size:18px;font-weight:800;margin:10px 0 0;line-height:1.25">${o.nome}</div>${o.descricao ? `<div style="color:#475569;font-size:14px;margin-top:2px">${o.descricao}</div>` : ''}`;
  } else if (o.tipo === 'espaco') {
    const preco = (o.preco != null) ? `<div style="margin-top:10px"><span style="font-size:12px;color:#94a3b8">A partir de</span><div style="font-size:24px;font-weight:800;color:#1E874B">${fmtV(o.preco)}<span style="font-size:13px;color:#94a3b8;font-weight:600"> ${UNID[o.unidade] || ''}</span></div></div>` : '';
    bloco = `<div style="background:linear-gradient(135deg,#1E874B,#0d6b3a);color:#fff;border-radius:14px;padding:24px 22px;text-align:center">
        <div style="font-size:12px;opacity:.9;text-transform:uppercase;letter-spacing:.5px">${o.descricao || 'Espaço disponível'}</div>
        <div style="font-size:26px;font-weight:800;margin-top:4px">${o.nome}</div>
      </div>${preco}`;
  } else {
    bloco = `<div style="background:#f3faf6;border:1px solid #d5ece0;border-radius:12px;padding:16px 18px"><div style="font-size:19px;font-weight:800;line-height:1.25">${o.nome}</div>${o.descricao ? `<div style="color:#475569;font-size:14px;margin-top:2px">${o.descricao}</div>` : ''}</div>`;
  }
  const quando = (occ && o.tipo !== 'espaco') ? `<div style="color:#94a3b8;font-size:13px;margin-top:8px">📅 ${fmtD(occ)}</div>` : '';
  const cta = o.tipo === 'espaco' ? 'Quero esse espaço →' : 'Quero participar →';
  return `<div style="background:#eef2f0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;margin:0">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,.08)">
    <div style="background:linear-gradient(135deg,#1E874B,#0d6b3a);padding:26px 28px;color:#ffffff">
      <div style="font-size:12.5px;letter-spacing:.6px;opacity:.9;text-transform:uppercase">Grupo Mutti · Trade Marketing</div>
      <div style="font-size:23px;font-weight:800;margin-top:6px;line-height:1.25">O que a Mutti posta vira conversa.<br>E a ${alvo.marca} pode estar no meio dela.</div>
    </div>
    <div style="padding:26px 28px;color:#20303a">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6">Olá${alvo.responsavel ? ', ' + alvo.responsavel : ''}! Os nossos conteúdos <b>viralizam e viram meme</b> — o cliente assiste, comenta e compartilha. Aqui a sua marca não contrata visibilidade: <b>entra na conversa</b>, no ponto certo da jornada de cuidado — na loja, no delivery e no digital.</p>
      ${bloco}
      ${quando}
      <p style="margin:16px 0 0;font-size:15px;line-height:1.6">Queremos a <b>${alvo.marca}</b> nessa conversa com a gente — com resultado que você <b>mede de verdade</b>. Bora combinar como a sua marca entra?</p>
      ${extra}
      <div style="text-align:center;margin:24px 0 6px">
        <a href="${zap}" style="display:inline-block;background:#1E874B;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 28px;border-radius:10px">${cta}</a>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:13px;margin:6px 0 0">ou responda este e-mail · WhatsApp ${foneBonito}</p>
    </div>
    <div style="background:#fafafa;padding:12px 28px;border-top:1px solid #eef0f4;color:#b6c0bb;font-size:11.5px;text-align:center">Grupo Mutti · Trade Marketing</div>
  </div>
</div>`;
}
// prévia do e-mail (simulação) — usa a 1ª marca-alvo com contato, ou "Sua Marca" de exemplo
async function previewHtml(emp, tipo, id) {
  const o = owner(emp, tipo, id);
  if (!o) return '<div style="font-family:Arial;padding:24px;color:#64748b">Alvo não encontrado.</div>';
  const cfg = db.prepare('SELECT * FROM tmkt_crm_outreach WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=?').get(emp, tipo, String(id)) || {};
  let alvo = { marca: 'Sua Marca', responsavel: null };
  try { const al = await marcasAlvo(emp, tipo, id); if (al.length) alvo = { marca: al[0].marca, responsavel: al[0].responsavel }; } catch (e) { /* ERP off */ }
  return htmlDe(cfg, o, alvo, o.proxData || hoje());
}
// vagas livres de um espaço (p/ a recorrência "só com estoque livre")
const OCUPA_ST = ['pedido', 'rascunho', 'negociacao', 'confirmado', 'briefing', 'aguardando', 'vigente', 'vendido', 'concluido'];
function livresDoEspaco(emp, id) {
  const e = db.prepare('SELECT quantidade FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(id, emp);
  if (!e) return 0;
  const ph = OCUPA_ST.map(() => '?').join(',');
  const oc = db.prepare(`SELECT COALESCE(SUM(ve.quantidade),0) q FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id WHERE ve.espaco_id=? AND v.empresa_id=? AND v.status IN (${ph})`).get(id, emp, ...OCUPA_ST).q;
  return Math.max(0, (Number(e.quantidade) || 0) - (Number(oc) || 0));
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
  try { cfgs = db.prepare('SELECT * FROM tmkt_crm_outreach WHERE ativo=1').all(); } catch (e) { return; }
  for (const c of cfgs) {
    try {
      const o = owner(c.empresa_id, c.escopo_tipo, c.escopo_id);
      if (!o || o.inativo) continue;
      let occ = null, soPendentes = true;
      if (c.escopo_tipo === 'evento') { const target = addDays(hoje(), Number(c.dias_antes) || 15); if (!ocorreEm(o.ev, target)) continue; occ = target; }
      else if (c.escopo_tipo === 'plano') { const target = addDays(hoje(), Number(c.dias_antes) || 15); if (!o.proxData || o.proxData !== target) continue; occ = o.proxData; }
      else if (c.escopo_tipo === 'espaco') {
        // recorrente: a cada N dias, só se houver vaga livre, sem repetir dentro do intervalo
        if (c.so_com_estoque !== 0 && livresDoEspaco(c.empresa_id, c.escopo_id) <= 0) continue;
        const intervalo = Math.max(1, Number(c.intervalo_dias) || 15);
        const last = (db.prepare(`SELECT MAX(enviado_em) m FROM tmkt_outreach_log WHERE empresa_id=? AND escopo_tipo='espaco' AND escopo_id=? AND status='ok'`).get(c.empresa_id, String(c.escopo_id)) || {}).m;
        if (last) { const dias = (Date.now() - new Date(String(last).replace(' ', 'T') + 'Z').getTime()) / 864e5; if (dias < intervalo) continue; }
        occ = hoje(); soPendentes = false; // recorrente: reenvia pras marcas a cada intervalo
      } else continue;
      const r = await enviarOportunidade(c.empresa_id, c.escopo_tipo, c.escopo_id, { ocorrencia: occ, soPendentes });
      if (r.enviados) console.log(`[outreachAuto] ${c.empresa_id} · ${c.escopo_tipo} ${o.nome}: ${r.enviados} marca(s) avisada(s) p/ ${occ}`);
    } catch (e) { /* pula a que falhar */ }
  }
}

module.exports = { marcasAlvo, enviarOportunidade, rodarOutreachAuto, proximaOcorrencia, ocorreEm, owner, previewHtml, livresDoEspaco, TIPOS };
