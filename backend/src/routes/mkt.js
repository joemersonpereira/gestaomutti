// mkt.js — Calendário de Marketing: agenda de ações/postagens/eventos + influenciadores.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

const GESTAO_MKT = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Marketing'];
const rhia = require('../lib/rhia');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('../lib/escopoCompras');
router.use(auth);

// Busca de envolvido no ERP: pessoa (cliente/qualquer), fornecedor ou laboratório (fabricante).
// Traz telefone/e-mail principais da tabela `contato` p/ já preencher o contato da ação.
router.get('/erp/envolvidos', async (req, res) => {
  const tipo = (req.query.tipo || 'pessoa').toString();
  const q = (req.query.q || '').toString().trim();
  if (!habilitado() || q.length < 2) return res.json({ itens: [] });
  const like = `%${q}%`, dig = q.replace(/\D/g, '');
  const fone = "(SELECT c.ddd||c.contato FROM contato c WHERE c.pessoaid=p.id AND c.tipo IN ('C','T') ORDER BY c.principal DESC NULLS LAST LIMIT 1)";
  const mail = "(SELECT c.contato FROM contato c WHERE c.pessoaid=p.id AND c.tipo='E' ORDER BY c.principal DESC NULLS LAST LIMIT 1)";
  let sql, params;
  if (tipo === 'fornecedor') {
    sql = `SELECT p.id, p.nome, ${fone} tel, ${mail} email FROM fornecedor f JOIN pessoa p ON p.id=f.pessoaid
      WHERE f.status='A' AND (p.nome ILIKE $1 OR p.razaosocial ILIKE $1) ORDER BY p.nome LIMIT 15`;
    params = [like];
  } else if (tipo === 'laboratorio') {
    sql = `SELECT p.id, p.nome, ${fone} tel, ${mail} email FROM fabricante fb JOIN pessoa p ON p.id=fb.pessoaid
      WHERE p.nome ILIKE $1 ORDER BY p.nome LIMIT 15`;
    params = [like];
  } else {
    const porCpf = dig.length >= 3;
    sql = `SELECT p.id, p.nome, ${fone} tel, ${mail} email FROM pessoa p
      WHERE p.nome ILIKE $1 ${porCpf ? "OR regexp_replace(COALESCE(p.cpf,p.cnpj,''),'\\D','','g')=$2" : ''} ORDER BY p.nome LIMIT 15`;
    params = porCpf ? [like, dig] : [like];
  }
  try {
    const r = await erpQuery(sql, params);
    res.json({ itens: r.map(x => ({ id: String(x.id), nome: x.nome, contato: x.tel || '', email: x.email || '' })) });
  } catch (e) { res.json({ itens: [], erro: e.message }); }
});

// Gera conteúdo de marketing (legendas de post, ideia de criativo, campanha) com a Rhia (Claude).
router.post('/gerar', exigePerfil(...GESTAO_MKT), async (req, res) => {
  try {
    const { objetivo, produtos, canal, tom, data, extra } = req.body || {};
    res.json(await rhia.gerarMarketing(req.usuario.empresa_id, { objetivo, produtos, canal, tom, data, extra }));
  } catch (e) { res.status(400).json({ ok: false, erro: e.message }); }
});
router.get('/ia', (req, res) => res.json({ habilitada: rhia.iaHabilitada() }));

// ── Orçamento (verba) do Marketing ────────────────────────────────────────
// Gasto = ações/eventos do calendário com verba (mkt_agenda). Orçado = mkt_orcamento por mês.
router.get('/orcamento', (req, res) => {
  const emp = req.usuario.empresa_id;
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  const orc = db.prepare('SELECT mes, valor FROM mkt_orcamento WHERE empresa_id=? AND ano=?').all(emp, ano);
  const orcMap = {}; orc.forEach(o => { orcMap[o.mes] = Number(o.valor) || 0; });
  const g = db.prepare(`SELECT CAST(strftime('%m', data_ini) AS INTEGER) mes,
      SUM(CASE WHEN status!='cancelado' THEN COALESCE(verba,0) ELSE 0 END) comprometido,
      SUM(CASE WHEN status IN ('publicado','concluido') THEN COALESCE(verba,0) ELSE 0 END) realizado,
      SUM(CASE WHEN status!='cancelado' THEN COALESCE(patrocinio_valor,0) ELSE 0 END) patrocinio
    FROM mkt_agenda WHERE empresa_id=? AND (COALESCE(verba,0)>0 OR COALESCE(patrocinio_valor,0)>0) AND strftime('%Y', data_ini)=? GROUP BY 1`).all(emp, String(ano));
  const gMap = {}; g.forEach(r => { gMap[r.mes] = { comprometido: Number(r.comprometido) || 0, realizado: Number(r.realizado) || 0, patrocinio: Number(r.patrocinio) || 0 }; });
  const meses = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1; const orcado = orcMap[m] || 0; const gg = gMap[m] || { comprometido: 0, realizado: 0, patrocinio: 0 };
    const liquido = gg.comprometido - gg.patrocinio; // custo líquido = verba comprometida menos patrocínio recebido
    return { mes: m, orcado, comprometido: gg.comprometido, realizado: gg.realizado, patrocinio: gg.patrocinio, liquido, saldo: orcado - liquido, pct: orcado ? Math.round(100 * liquido / orcado) : (liquido ? 999 : 0) };
  });
  const tot = meses.reduce((a, m) => ({ orcado: a.orcado + m.orcado, comprometido: a.comprometido + m.comprometido, realizado: a.realizado + m.realizado, patrocinio: a.patrocinio + m.patrocinio }), { orcado: 0, comprometido: 0, realizado: 0, patrocinio: 0 });
  const porTipo = db.prepare(`SELECT tipo, SUM(COALESCE(verba,0)) total, COUNT(*) n FROM mkt_agenda
    WHERE empresa_id=? AND COALESCE(verba,0)>0 AND status!='cancelado' AND strftime('%Y', data_ini)=? GROUP BY tipo ORDER BY total DESC`).all(emp, String(ano));
  const itens = db.prepare(`SELECT id, titulo, tipo, data_ini, status, verba, patrocinador, patrocinio_valor FROM mkt_agenda
    WHERE empresa_id=? AND (COALESCE(verba,0)>0 OR COALESCE(patrocinio_valor,0)>0) AND strftime('%Y', data_ini)=? ORDER BY data_ini DESC LIMIT 100`).all(emp, String(ano));
  const totLiquido = tot.comprometido - tot.patrocinio;
  res.json({ ano, meses, total: { ...tot, liquido: totLiquido, saldo: tot.orcado - totLiquido, pct: tot.orcado ? Math.round(100 * totLiquido / tot.orcado) : (totLiquido ? 999 : 0) }, porTipo: porTipo.map(t => ({ tipo: t.tipo, total: Number(t.total) || 0, n: t.n })), itens });
});

router.put('/orcamento', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id;
  const ano = parseInt(req.body.ano) || new Date().getFullYear();
  const valor = Math.max(0, Number(req.body.valor) || 0);
  const meses = req.body.aplicarAno ? Array.from({ length: 12 }, (_, i) => i + 1) : [parseInt(req.body.mes)].filter(m => m >= 1 && m <= 12);
  if (!meses.length) return res.status(400).json({ erro: 'Informe o mês (ou aplicarAno).' });
  const up = db.prepare(`INSERT INTO mkt_orcamento (id,empresa_id,ano,mes,valor,criado_por,atualizado_em) VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,ano,mes) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')`);
  const tx = db.transaction(() => { for (const m of meses) up.run(uuid(), emp, ano, m, valor, req.usuario.id); });
  tx();
  res.json({ ok: true });
});

// ── Influenciadores ──────────────────────────────────────────────────────
router.get('/influenciadores', (req, res) => {
  res.json({ influenciadores: db.prepare('SELECT * FROM mkt_influenciadores WHERE empresa_id=? AND ativo=1 ORDER BY nome').all(req.usuario.empresa_id) });
});
router.post('/influenciadores', exigePerfil(...GESTAO_MKT), (req, res) => {
  const b = req.body; if (!b.nome) return res.status(400).json({ erro: 'Informe o nome.' });
  const id = uuid();
  db.prepare(`INSERT INTO mkt_influenciadores (id,empresa_id,nome,arroba,rede,seguidores,contato,email,cachê,observacao,ativo,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.nome, b.arroba || null, b.rede || null, Number(b.seguidores) || null, b.contato || null, b.email || null, Number(b.cache) || null, b.observacao || null);
  res.json({ ok: true, id });
});
router.put('/influenciadores/:id', exigePerfil(...GESTAO_MKT), (req, res) => {
  const b = req.body;
  const campos = { nome: b.nome, arroba: b.arroba, rede: b.rede, seguidores: b.seguidores, contato: b.contato, email: b.email, cachê: b.cache, observacao: b.observacao, ativo: b.ativo };
  const set = [], vals = [];
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) { set.push(`${k}=?`); vals.push(v === '' ? null : v); }
  if (!set.length) return res.json({ ok: true });
  db.prepare(`UPDATE mkt_influenciadores SET ${set.join(',')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Colaboradores ativos (p/ o seletor de Responsável)
router.get('/colaboradores', (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.nome, f.nome funcao FROM colaboradores c LEFT JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 ORDER BY c.nome`).all(req.usuario.empresa_id);
  res.json({ colaboradores: rows });
});

// Grava a lista de envolvidos de uma ação (substitui) + mantém os campos legados = 1º envolvido.
function salvarEnvolvidos(agendaId, lista) {
  if (!Array.isArray(lista)) return;
  db.prepare('DELETE FROM mkt_envolvidos WHERE agenda_id=?').run(agendaId);
  const ins = db.prepare('INSERT INTO mkt_envolvidos (id,agenda_id,tipo,ref_id,nome,contato,email,ordem) VALUES (?,?,?,?,?,?,?,?)');
  lista.filter(e => (e.nome || '').trim()).forEach((e, i) => ins.run(uuid(), agendaId, e.tipo || null, e.ref_id || e.envolvido_id || null, (e.nome || '').trim(), (e.contato || '').trim() || null, (e.email || '').trim() || null, i));
  const p = lista.find(e => (e.nome || '').trim());
  db.prepare('UPDATE mkt_agenda SET envolvido_tipo=?, envolvido_id=?, envolvido_nome=?, envolvido_contato=?, envolvido_email=? WHERE id=?')
    .run(p?.tipo || null, p?.ref_id || p?.envolvido_id || null, p?.nome || null, p?.contato || null, p?.email || null, agendaId);
}
const envolvidosDe = agendaId => db.prepare('SELECT tipo, ref_id, nome, contato, email FROM mkt_envolvidos WHERE agenda_id=? ORDER BY ordem').all(agendaId);

// Vincula um comprador à ação (ele deve passar a lista de produtos em oferta até o prazo).
// Cria/atualiza a tarefa do comprador; zera a resposta se trocou o comprador.
function vincularComprador(emp, a, compradorId, prazo, criadoPor) {
  compradorId = compradorId || null;
  prazo = (prazo || '').slice(0, 10) || null;
  const mudou = a.comprador_id !== compradorId;
  if (!compradorId) {
    // desvincular: fecha tarefa e limpa
    if (a.comprador_tarefa_id) db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE id=?").run(a.comprador_tarefa_id);
    db.prepare('UPDATE mkt_agenda SET comprador_id=NULL, comprador_prazo=NULL, comprador_status=NULL, comprador_tarefa_id=NULL WHERE id=?').run(a.id);
    return;
  }
  let tid = a.comprador_tarefa_id;
  const titulo = `🛒 Passar lista de ofertas — ${a.titulo}`.slice(0, 140);
  const desc = `A ação de marketing "${a.titulo}" precisa da SUA lista de produtos em oferta${prazo ? ` até ${prazo.split('-').reverse().join('/')}` : ''}. Selecione o caderno de oferta aqui mesmo na tarefa.`;
  if (!tid || mudou) {
    if (tid) db.prepare("UPDATE tarefas SET status='concluido' WHERE id=?").run(tid); // fecha a antiga se trocou
    tid = uuid();
    db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,prazo,status,criado_em,atualizado_em)
      VALUES (?,?,'tarefa','mkt_comprador',?,?,?,?,?,'aberto',datetime('now'),datetime('now'))`)
      .run(tid, emp, 'mktcomp:' + a.id, titulo, desc, compradorId, prazo, prazo);
  } else {
    db.prepare("UPDATE tarefas SET titulo=?, descricao=?, prazo=?, atualizado_em=datetime('now') WHERE id=?").run(titulo, desc, prazo, tid);
  }
  db.prepare(`UPDATE mkt_agenda SET comprador_id=?, comprador_prazo=?, comprador_tarefa_id=?, comprador_status=COALESCE(comprador_status,'pendente') WHERE id=?`)
    .run(compradorId, prazo, tid, a.id);
  if (mudou) db.prepare("UPDATE mkt_agenda SET comprador_status='pendente', comprador_resposta=NULL, comprador_respondido_em=NULL, comprador_no_prazo=NULL WHERE id=?").run(a.id);
}

// Sincroniza a ação de marketing como EVENTO no calendário PADRÃO da empresa (agenda_evento).
// Assim o Marketing usa o mesmo calendário do sistema (não um calendário próprio). origem='marketing'.
function syncEventoAgenda(emp, acaoId) {
  const a = db.prepare('SELECT id, titulo, tipo, data_ini, data_fim, hora FROM mkt_agenda WHERE id=? AND empresa_id=?').get(acaoId, emp);
  if (!a || !a.data_ini) { db.prepare("DELETE FROM agenda_evento WHERE empresa_id=? AND origem='marketing' AND ref_id=?").run(emp, acaoId); return; }
  const ex = db.prepare("SELECT id FROM agenda_evento WHERE empresa_id=? AND origem='marketing' AND ref_id=?").get(emp, acaoId);
  const titulo = '📣 ' + a.titulo;
  if (ex) db.prepare('UPDATE agenda_evento SET titulo=?, data=?, hora=?, fim=? WHERE id=?').run(titulo, a.data_ini, a.hora || null, a.data_fim || null, ex.id);
  else db.prepare(`INSERT INTO agenda_evento (id,empresa_id,titulo,descricao,data,hora,fim,local,cor,visibilidade,dono_id,origem,ref_id,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,'empresa',NULL,'marketing',?,?)`).run(uuid(), emp, titulo, 'Ação de marketing (' + (a.tipo || '') + ')', a.data_ini, a.hora || null, a.data_fim || null, null, '#E8730C', acaoId, 'sistema');
}
function removerEventoAgenda(emp, acaoId) { db.prepare("DELETE FROM agenda_evento WHERE empresa_id=? AND origem='marketing' AND ref_id=?").run(emp, acaoId); }

// ── Agenda ───────────────────────────────────────────────────────────────
router.get('/agenda', (req, res) => {
  const emp = req.usuario.empresa_id;
  const cond = ['empresa_id=?']; const args = [emp];
  if (req.query.de) { cond.push('data_ini >= ?'); args.push(req.query.de); }
  if (req.query.ate) { cond.push('data_ini <= ?'); args.push(req.query.ate); }
  if (req.query.tipo) { cond.push('tipo=?'); args.push(req.query.tipo); }
  if (req.query.venda_id) { cond.push('tmkt_venda_id=?'); args.push(req.query.venda_id); }
  if (req.query.programacao_id) { cond.push('programacao_id=?'); args.push(req.query.programacao_id); }
  const rows = db.prepare(`SELECT * FROM mkt_agenda WHERE ${cond.join(' AND ')} ORDER BY data_ini, hora`).all(...args);
  rows.forEach(r => {
    const evs = envolvidosDe(r.id);
    // fallback: ação antiga sem linha na mkt_envolvidos → usa o campo legado
    r.envolvidos = evs.length ? evs : (r.envolvido_nome ? [{ tipo: r.envolvido_tipo, ref_id: r.envolvido_id, nome: r.envolvido_nome, contato: r.envolvido_contato, email: r.envolvido_email }] : []);
    r.comprador_nome = r.comprador_id ? (db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(r.comprador_id)?.nome || null) : null;
    if (r.comprador_id && r.comprador_status === 'pendente' && r.comprador_prazo && r.comprador_prazo < new Date().toISOString().slice(0, 10)) r.comprador_atrasada = true;
  });
  res.json({ itens: rows, meuId: req.usuario.id });
});

// Uma ação (pra abrir ao clicar nela no calendário, de qualquer mês).
router.get('/agenda/:id', (req, res) => {
  const emp = req.usuario.empresa_id;
  const r = db.prepare('SELECT * FROM mkt_agenda WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!r) return res.status(404).json({ erro: 'Ação não encontrada.' });
  const evs = envolvidosDe(r.id);
  r.envolvidos = evs.length ? evs : (r.envolvido_nome ? [{ tipo: r.envolvido_tipo, ref_id: r.envolvido_id, nome: r.envolvido_nome, contato: r.envolvido_contato, email: r.envolvido_email }] : []);
  r.comprador_nome = r.comprador_id ? (db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(r.comprador_id)?.nome || null) : null;
  r.programacao_nome = r.programacao_id ? (db.prepare('SELECT nome FROM tmkt_calendario WHERE id=?').get(r.programacao_id)?.nome || null) : null;
  r.venda_fornecedor = r.tmkt_venda_id ? (db.prepare('SELECT fornecedor_nome FROM tmkt_vendas WHERE id=?').get(r.tmkt_venda_id)?.fornecedor_nome || null) : null;
  res.json({ item: r, meuId: req.usuario.id });
});
// Lista as PROGRAMAÇÕES do calendário (temas do Trade) pra vincular numa ação.
router.get('/programacoes', (req, res) => {
  const rows = db.prepare(`SELECT id, nome, tipo, categoria, recorrencia, data, data_ini, cor
    FROM tmkt_calendario WHERE empresa_id=? AND COALESCE(status,'ativo')='ativo' ORDER BY nome`).all(req.usuario.empresa_id);
  res.json({ programacoes: rows });
});

router.post('/agenda', exigePerfil(...GESTAO_MKT), (req, res) => {
  const b = req.body; if (!b.titulo || !b.data_ini) return res.status(400).json({ erro: 'Informe título e data.' });
  const id = uuid();
  db.prepare(`INSERT INTO mkt_agenda (id,empresa_id,titulo,tipo,canal,data_ini,data_fim,hora,status,responsavel_id,responsavel_nome,descricao,
      envolvido_tipo,envolvido_id,envolvido_nome,envolvido_contato,envolvido_email,verba,patrocinador,patrocinio_valor,programacao_id,tmkt_venda_id,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.titulo, b.tipo || 'postagem', b.canal || null, b.data_ini, b.data_fim || null, b.hora || null,
      b.status || 'ideia', b.responsavel_id || null, b.responsavel_nome || null, b.descricao || null,
      b.envolvido_tipo || null, b.envolvido_id || null, b.envolvido_nome || null, b.envolvido_contato || null, b.envolvido_email || null,
      Number(b.verba) || null, b.patrocinador || null, Number(b.patrocinio_valor) || null, b.programacao_id || null, b.tmkt_venda_id || null, req.usuario.id);
  if (Array.isArray(b.envolvidos)) salvarEnvolvidos(id, b.envolvidos);
  if (b.comprador_id) vincularComprador(req.usuario.empresa_id, { id, titulo: b.titulo, comprador_id: null, comprador_tarefa_id: null }, b.comprador_id, b.comprador_prazo, req.usuario.id);
  syncEventoAgenda(req.usuario.empresa_id, id);
  res.json({ ok: true, id });
});

router.put('/agenda/:id', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id;
  const item = db.prepare('SELECT id FROM mkt_agenda WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!item) return res.status(404).json({ erro: 'Ação não encontrada.' });
  const campos = ['titulo', 'tipo', 'canal', 'data_ini', 'data_fim', 'hora', 'status', 'responsavel_id', 'responsavel_nome', 'descricao',
    'pauta', 'briefing', 'ideias', 'programacao_id', 'tmkt_venda_id',
    'envolvido_tipo', 'envolvido_id', 'envolvido_nome', 'envolvido_contato', 'envolvido_email', 'verba', 'patrocinador', 'patrocinio_valor'];
  const set = [], vals = [];
  campos.forEach(c => { if (c in req.body) { set.push(`${c}=?`); vals.push(req.body[c] === '' ? null : req.body[c]); } });
  if (set.length) { set.push(`atualizado_em=datetime('now')`); db.prepare(`UPDATE mkt_agenda SET ${set.join(',')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp); }
  if (Array.isArray(req.body.envolvidos)) salvarEnvolvidos(req.params.id, req.body.envolvidos);
  if ('comprador_id' in req.body || 'comprador_prazo' in req.body) {
    const a = db.prepare('SELECT id, titulo, comprador_id, comprador_tarefa_id FROM mkt_agenda WHERE id=?').get(req.params.id);
    vincularComprador(emp, a, ('comprador_id' in req.body ? req.body.comprador_id : a.comprador_id) || null, ('comprador_prazo' in req.body ? req.body.comprador_prazo : a.comprador_prazo), req.usuario.id);
  }
  syncEventoAgenda(emp, req.params.id);
  res.json({ ok: true });
});

// Comprador (ou gestão) responde SELECIONANDO o caderno de oferta do ERP (+ obs. opcional).
router.post('/agenda/:id/comprador-resposta', (req, res) => {
  const emp = req.usuario.empresa_id, u = req.usuario;
  const a = db.prepare('SELECT * FROM mkt_agenda WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!a || !a.comprador_id) return res.status(404).json({ erro: 'Ação sem comprador vinculado.' });
  if (a.comprador_id !== u.id && !GESTAO_MKT.includes(u.funcao_nome)) return res.status(403).json({ erro: 'Só o comprador vinculado responde.' });
  const cadId = (req.body.caderno_id || '').toString().trim();
  if (!cadId) return res.status(400).json({ erro: 'Selecione o caderno de oferta.' });
  const cadNome = (req.body.caderno_nome || '').toString().slice(0, 200) || null;
  const obs = (req.body.resposta || '').toString().slice(0, 2000) || null;
  const hoje = new Date().toISOString().slice(0, 10);
  const noPrazo = !a.comprador_prazo || hoje <= a.comprador_prazo;
  db.prepare(`UPDATE mkt_agenda SET comprador_status='respondido', comprador_caderno_id=?, comprador_caderno_nome=?, comprador_resposta=?, comprador_respondido_em=datetime('now'), comprador_no_prazo=? WHERE id=?`)
    .run(cadId, cadNome, obs, noPrazo ? 1 : 0, a.id);
  if (a.comprador_tarefa_id) db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE id=?").run(a.comprador_tarefa_id);
  res.json({ ok: true, no_prazo: noPrazo });
});

// Uma solicitação (p/ responder direto da TAREFA). id = id da mkt_agenda.
router.get('/agenda/:id/comprador', (req, res) => {
  const u = req.usuario;
  const r = db.prepare(`SELECT id, titulo, canal, data_ini, comprador_id, comprador_prazo, comprador_status, comprador_resposta,
      comprador_caderno_id, comprador_caderno_nome, comprador_no_prazo, comprador_respondido_em
    FROM mkt_agenda WHERE id=? AND empresa_id=?`).get(req.params.id, u.empresa_id);
  if (!r || !r.comprador_id) return res.status(404).json({ erro: 'Ação sem comprador vinculado.' });
  const hoje = new Date().toISOString().slice(0, 10);
  r.comprador_nome = db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(r.comprador_id)?.nome || null;
  r.atrasada = r.comprador_status === 'pendente' && r.comprador_prazo && r.comprador_prazo < hoje;
  r.souEu = r.comprador_id === u.id;
  r.podeResponder = r.souEu || GESTAO_MKT.includes(u.funcao_nome);
  res.json({ solicitacao: r });
});

// Solicitações de lista de ofertas do comprador logado (ou todas, p/ gestão de marketing).
router.get('/comprador/solicitacoes', (req, res) => {
  const u = req.usuario, gestao = GESTAO_MKT.includes(u.funcao_nome);
  const rows = db.prepare(`SELECT id, titulo, canal, data_ini, comprador_id, comprador_prazo, comprador_status, comprador_resposta, comprador_caderno_id, comprador_caderno_nome, comprador_no_prazo, comprador_respondido_em
    FROM mkt_agenda WHERE empresa_id=? AND comprador_id IS NOT NULL ${gestao ? '' : 'AND comprador_id=?'}
    ORDER BY (comprador_status='pendente') DESC, comprador_prazo`).all(...(gestao ? [u.empresa_id] : [u.empresa_id, u.id]));
  const hoje = new Date().toISOString().slice(0, 10);
  rows.forEach(r => {
    r.comprador_nome = db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(r.comprador_id)?.nome || null;
    r.atrasada = r.comprador_status === 'pendente' && r.comprador_prazo && r.comprador_prazo < hoje;
    r.souEu = r.comprador_id === u.id;
  });
  res.json({ solicitacoes: rows });
});

router.delete('/agenda/:id', exigePerfil(...GESTAO_MKT), (req, res) => {
  removerEventoAgenda(req.usuario.empresa_id, req.params.id);
  db.prepare('DELETE FROM mkt_agenda WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Gera uma tarefa (atividade) p/ o envolvido/responsável — cobrança da ação (ex.: fornecedor).
router.post('/agenda/:id/atividade', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id;
  const a = db.prepare('SELECT * FROM mkt_agenda WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!a) return res.status(404).json({ erro: 'Ação não encontrada.' });
  const tid = uuid();
  const alvo = a.envolvido_nome || a.patrocinador || 'envolvido';
  const desc = `Ação de marketing "${a.titulo}"${a.canal ? ' (' + a.canal + ')' : ''} em ${(a.data_ini || '').split('-').reverse().join('/')}. `
    + `Envolvido: ${alvo}${a.envolvido_contato ? ' · ' + a.envolvido_contato : ''}${a.envolvido_email ? ' · ' + a.envolvido_email : ''}. `
    + (a.descricao || 'Acompanhar execução.');
  db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
    VALUES (?,?,'tarefa','marketing',?,?,?,?,'aberto',datetime('now'),datetime('now'))`)
    .run(tid, emp, 'mkt:' + a.id, `📣 ${a.titulo}`.slice(0, 140), desc, a.responsavel_id || req.usuario.id);
  db.prepare('UPDATE mkt_agenda SET tarefa_id=? WHERE id=?').run(tid, a.id);
  res.json({ ok: true, tarefaId: tid });
});

// ── Comentários da ação (thread: pauta/ideias discutidas pela equipe) ──
router.get('/agenda/:id/comentarios', (req, res) => {
  const rows = db.prepare('SELECT id, texto, autor_id, autor_nome, criado_em FROM mkt_comentario WHERE empresa_id=? AND agenda_id=? ORDER BY criado_em').all(req.usuario.empresa_id, req.params.id);
  res.json({ comentarios: rows, meuId: req.usuario.id });
});
router.post('/agenda/:id/comentarios', (req, res) => {
  const texto = (req.body.texto || '').trim(); if (!texto) return res.status(400).json({ erro: 'Escreva o comentário.' });
  const id = uuid();
  db.prepare('INSERT INTO mkt_comentario (id, empresa_id, agenda_id, texto, autor_id, autor_nome) VALUES (?,?,?,?,?,?)')
    .run(id, req.usuario.empresa_id, req.params.id, texto.slice(0, 2000), req.usuario.id, req.usuario.nome);
  res.status(201).json({ ok: true, id });
});
router.delete('/comentarios/:id', (req, res) => {
  db.prepare('DELETE FROM mkt_comentario WHERE id=? AND empresa_id=? AND autor_id=?').run(req.params.id, req.usuario.empresa_id, req.usuario.id);
  res.json({ ok: true });
});

// ── Sell-out da ação (quando tem caderno de oferta vinculado) — vendas do caderno na janela da ação ──
router.get('/agenda/:id/sellout', async (req, res) => {
  try {
    const a = db.prepare('SELECT comprador_caderno_id, comprador_caderno_nome, data_ini, data_fim FROM mkt_agenda WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
    if (!a) return res.status(404).json({ erro: 'Ação não encontrada.' });
    if (!a.comprador_caderno_id) return res.json({ temCaderno: false });
    if (!habilitado()) return res.json({ temCaderno: true, erp: false });
    const unis = unisEmpresa(req.usuario.empresa_id);
    const de = a.data_ini, ate = a.data_fim || a.data_ini;
    const r = (await erpQuery(`
      SELECT COALESCE(SUM(iv.valortotal),0)::float8 venda, COALESCE(SUM(iv.quantidade),0)::float8 unidades,
        COUNT(DISTINCT em.produtoid) produtos
      FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN embalagem em ON em.id=iv.embalagemid
      WHERE v.unidadenegocioid = ANY($1::bigint[]) AND v.status IN ('F','D') AND iv.status='F'
        AND iv.cadernoofertaid = $2 AND v.datahorafechamento >= $3::date AND v.datahorafechamento < ($4::date + interval '1 day')`,
      [unis, Number(a.comprador_caderno_id), de, ate]))[0] || {};
    res.json({ temCaderno: true, erp: true, caderno: a.comprador_caderno_nome, periodo: { de, ate },
      venda: Math.round((Number(r.venda) || 0) * 100) / 100, unidades: Math.round(Number(r.unidades) || 0), produtos: Number(r.produtos) || 0 });
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Sell-out CONSOLIDADO por TEMA (programação): soma as ações do tema que têm caderno vinculado ──
// Responde "quanto a Quarta do Bem-Estar vendeu" somando todas as ocorrências/ações daquele tema.
router.get('/programacao/:id/sellout', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const acoes = db.prepare(`SELECT id, titulo, comprador_caderno_id, comprador_caderno_nome, data_ini, data_fim
      FROM mkt_agenda WHERE empresa_id=? AND programacao_id=? AND comprador_caderno_id IS NOT NULL AND status<>'cancelado'
      ORDER BY data_ini`).all(emp, req.params.id);
    if (!acoes.length) return res.json({ temCaderno: false, acoes: [] });
    if (!habilitado()) return res.json({ temCaderno: true, erp: false, acoes: [] });
    const unis = unisEmpresa(emp);
    let venda = 0, unidades = 0; const det = [];
    for (const a of acoes) {
      const de = a.data_ini, ate = a.data_fim || a.data_ini;
      const r = (await erpQuery(`
        SELECT COALESCE(SUM(iv.valortotal),0)::float8 venda, COALESCE(SUM(iv.quantidade),0)::float8 unidades
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
        WHERE v.unidadenegocioid = ANY($1::bigint[]) AND v.status IN ('F','D') AND iv.status='F'
          AND iv.cadernoofertaid = $2 AND v.datahorafechamento >= $3::date AND v.datahorafechamento < ($4::date + interval '1 day')`,
        [unis, Number(a.comprador_caderno_id), de, ate]))[0] || {};
      const vv = Math.round((Number(r.venda) || 0) * 100) / 100, uu = Math.round(Number(r.unidades) || 0);
      venda += vv; unidades += uu;
      det.push({ id: a.id, titulo: a.titulo, caderno: a.comprador_caderno_nome, periodo: { de, ate }, venda: vv, unidades: uu });
    }
    res.json({ temCaderno: true, erp: true, venda: Math.round(venda * 100) / 100, unidades, acoes: det });
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── GASTOS itemizados da ação (verba/tráfego/tempo da equipe/material) ──
const GASTO_TIPOS = ['verba', 'trafego', 'tempo_equipe', 'material', 'outro'];
router.get('/agenda/:id/gastos', (req, res) => {
  const rows = db.prepare('SELECT id, tipo, descricao, valor, horas, valor_hora, criado_em FROM mkt_gasto WHERE empresa_id=? AND agenda_id=? ORDER BY criado_em').all(req.usuario.empresa_id, req.params.id);
  const a = db.prepare('SELECT patrocinio_valor FROM mkt_agenda WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id) || {};
  const total = Math.round(rows.reduce((x, g) => x + (Number(g.valor) || 0), 0) * 100) / 100;
  const patrocinio = Math.round((Number(a.patrocinio_valor) || 0) * 100) / 100;
  res.json({ gastos: rows, total, patrocinio, liquido: Math.round((total - patrocinio) * 100) / 100 });
});
router.post('/agenda/:id/gastos', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id; const b = req.body || {};
  const tipo = GASTO_TIPOS.includes(b.tipo) ? b.tipo : 'outro';
  let valor = Number(b.valor) || 0, horas = null, valorHora = null;
  if (tipo === 'tempo_equipe') { horas = Number(b.horas) || 0; valorHora = Number(b.valor_hora) || 0; valor = Math.round(horas * valorHora * 100) / 100; }
  const id = uuid();
  db.prepare('INSERT INTO mkt_gasto (id, empresa_id, agenda_id, tipo, descricao, valor, horas, valor_hora, criado_por) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, emp, req.params.id, tipo, (b.descricao || '').slice(0, 200) || null, valor, horas, valorHora, req.usuario.id);
  res.status(201).json({ ok: true, id, valor });
});
router.delete('/gastos/:id', exigePerfil(...GESTAO_MKT), (req, res) => {
  db.prepare('DELETE FROM mkt_gasto WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── MATERIAIS da ação (desenvolvimento com PRAZO + comprovação) ──────────────────────────
const MAT_STATUS = ['a_fazer', 'producao', 'entregue', 'veiculado', 'cancelado'];
const diasAntesCfg = (emp) => { const r = db.prepare('SELECT dias_antes FROM mkt_material_config WHERE empresa_id=?').get(emp); return r ? Number(r.dias_antes) : 2; };
const valorHoraCfg = (emp) => { const r = db.prepare('SELECT valor_hora_padrao FROM mkt_material_config WHERE empresa_id=?').get(emp); return r ? Number(r.valor_hora_padrao) || 0 : 0; };

// Material → TAREFA do responsável (aparece na agenda/calendário padrão + Kanban). Fecha ao entregar/cancelar.
function syncTarefaMaterial(emp, materialId) {
  const m = db.prepare('SELECT mm.*, a.titulo acao_titulo FROM mkt_material mm JOIN mkt_agenda a ON a.id=mm.agenda_id WHERE mm.id=? AND mm.empresa_id=?').get(materialId, emp);
  if (!m) return;
  const existing = db.prepare('SELECT id FROM tarefas WHERE empresa_id=? AND referencia_id=?').get(emp, 'mktmat:' + materialId);
  const encerrada = ['entregue', 'veiculado', 'cancelado'].includes(m.status) || !m.responsavel_id;
  if (encerrada) { if (existing) db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE id=?").run(existing.id); return; }
  const titulo = `📦 Material: ${(m.tipo || 'material').replace(/_/g, ' ')} — ${m.acao_titulo}`;
  const desc = `Desenvolver o material da ação "${m.acao_titulo}"${m.descricao ? ' — ' + m.descricao : ''}. Entregar até o prazo pras lojas terem tempo.`;
  if (existing) db.prepare("UPDATE tarefas SET titulo=?, descricao=?, responsavel_id=?, prazo=?, status='aberto', atualizado_em=datetime('now') WHERE id=?").run(titulo, desc, m.responsavel_id, m.prazo, existing.id);
  else db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,prazo,status,criado_em,atualizado_em)
    VALUES (?,?,'tarefa','mkt_material',?,?,?,?,?,'aberto',datetime('now'),datetime('now'))`).run(uuid(), emp, 'mktmat:' + materialId, titulo, desc, m.responsavel_id, m.prazo);
}
function fecharTarefaMaterial(emp, materialId) {
  db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE empresa_id=? AND referencia_id=?").run(emp, 'mktmat:' + materialId);
}
function materialDTO(m) {
  const hoje = new Date().toISOString().slice(0, 10);
  const aberto = !['entregue', 'veiculado', 'cancelado'].includes(m.status);
  return {
    id: m.id, agenda_id: m.agenda_id, tipo: m.tipo || null, descricao: m.descricao || null,
    responsavel_id: m.responsavel_id || null, responsavel_nome: m.responsavel_nome || null,
    prazo: m.prazo || null, status: m.status || 'a_fazer', obs: m.obs || null,
    entregue_em: m.entregue_em || null, veiculado_em: m.veiculado_em || null,
    temComprovacao: !!m.comprovacao, comprovacao_nome: m.comprovacao_nome || null, comprovacao_mime: m.comprovacao_mime || null,
    atrasado: aberto && !!m.prazo && m.prazo < hoje,
    diasRestantes: m.prazo ? Math.round((new Date(m.prazo) - new Date(hoje)) / 86400000) : null,
    acao_titulo: m.acao_titulo, acao_data: m.acao_data,
  };
}

// Config "dias antes" (padrão de prazo = data da ação − N dias).
router.get('/material-config', (req, res) => res.json({ diasAntes: diasAntesCfg(req.usuario.empresa_id), valorHora: valorHoraCfg(req.usuario.empresa_id) }));
router.put('/material-config', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id;
  const atual = db.prepare('SELECT dias_antes, valor_hora_padrao FROM mkt_material_config WHERE empresa_id=?').get(emp) || {};
  const n = req.body.diasAntes !== undefined ? Math.max(0, Math.min(60, Number(req.body.diasAntes) || 0)) : (atual.dias_antes != null ? Number(atual.dias_antes) : 2);
  const vh = req.body.valorHora !== undefined ? Math.max(0, Number(req.body.valorHora) || 0) : (Number(atual.valor_hora_padrao) || 0);
  db.prepare(`INSERT INTO mkt_material_config (empresa_id, dias_antes, valor_hora_padrao) VALUES (?,?,?)
    ON CONFLICT(empresa_id) DO UPDATE SET dias_antes=excluded.dias_antes, valor_hora_padrao=excluded.valor_hora_padrao`).run(emp, n, vh);
  res.json({ ok: true, diasAntes: n, valorHora: vh });
});

// Materiais de UMA ação.
router.get('/agenda/:id/materiais', (req, res) => {
  const rows = db.prepare(`SELECT m.*, a.titulo acao_titulo, a.data_ini acao_data FROM mkt_material m JOIN mkt_agenda a ON a.id=m.agenda_id
    WHERE m.empresa_id=? AND m.agenda_id=? ORDER BY COALESCE(m.prazo,''), m.criado_em`).all(req.usuario.empresa_id, req.params.id);
  res.json({ materiais: rows.map(materialDTO), diasAntes: diasAntesCfg(req.usuario.empresa_id) });
});

// Painel de materiais (todas as ações) — pendentes/atrasados pra controlar a entrega.
router.get('/materiais', (req, res) => {
  const emp = req.usuario.empresa_id; const { status, mes, responsavel } = req.query;
  const w = ['m.empresa_id=?']; const p = [emp];
  if (status === 'abertos') w.push("m.status NOT IN ('entregue','veiculado','cancelado')");
  else if (status && MAT_STATUS.includes(status)) { w.push('m.status=?'); p.push(status); }
  if (/^\d{4}-\d{2}$/.test(mes || '')) { w.push('substr(COALESCE(m.prazo,a.data_ini),1,7)=?'); p.push(mes); }
  if (responsavel) { w.push('m.responsavel_id=?'); p.push(responsavel); }
  const rows = db.prepare(`SELECT m.*, a.titulo acao_titulo, a.data_ini acao_data FROM mkt_material m JOIN mkt_agenda a ON a.id=m.agenda_id
    WHERE ${w.join(' AND ')} ORDER BY m.status IN ('entregue','veiculado','cancelado'), COALESCE(m.prazo,a.data_ini)`).all(...p);
  const itens = rows.map(materialDTO);
  const abertos = itens.filter(i => !['entregue', 'veiculado', 'cancelado'].includes(i.status));
  res.json({ materiais: itens, resumo: { total: itens.length, abertos: abertos.length, atrasados: itens.filter(i => i.atrasado).length } });
});

// Indicador do marketing: % de materiais entregues ATÉ o prazo (prazo no mês).
router.get('/materiais/resumo', (req, res) => {
  const emp = req.usuario.empresa_id; const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Date().toISOString().slice(0, 7);
  const rows = db.prepare(`SELECT status, prazo, entregue_em FROM mkt_material WHERE empresa_id=? AND substr(COALESCE(prazo,''),1,7)=? AND status<>'cancelado'`).all(emp, mes);
  const concluido = rows.filter(r => ['entregue', 'veiculado'].includes(r.status));
  const noPrazo = concluido.filter(r => r.prazo && r.entregue_em && String(r.entregue_em).slice(0, 10) <= r.prazo);
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasados = rows.filter(r => !['entregue', 'veiculado'].includes(r.status) && r.prazo && r.prazo < hoje);
  res.json({ mes, total: rows.length, concluidos: concluido.length, atrasados: atrasados.length,
    noPrazoPct: concluido.length ? Math.round(noPrazo.length / concluido.length * 1000) / 10 : null });
});

// Criar material numa ação (prazo padrão = data da ação − diasAntes).
router.post('/agenda/:id/materiais', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id;
  const acao = db.prepare('SELECT id, data_ini FROM mkt_agenda WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!acao) return res.status(404).json({ erro: 'Ação não encontrada.' });
  const b = req.body || {};
  let prazo = /^\d{4}-\d{2}-\d{2}$/.test(b.prazo || '') ? b.prazo : null;
  if (!prazo && acao.data_ini) { const d = new Date(acao.data_ini); d.setDate(d.getDate() - diasAntesCfg(emp)); prazo = d.toISOString().slice(0, 10); }
  const id = uuid();
  db.prepare(`INSERT INTO mkt_material (id, empresa_id, agenda_id, tipo, descricao, responsavel_id, responsavel_nome, prazo, status, obs, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, emp, acao.id, (b.tipo || '').slice(0, 40) || null, (b.descricao || '').slice(0, 400) || null,
      b.responsavel_id || null, (b.responsavel_nome || '').slice(0, 120) || null, prazo, 'a_fazer', (b.obs || '').slice(0, 400) || null, req.usuario.id);
  syncTarefaMaterial(emp, id);
  res.status(201).json({ ok: true, id, prazo });
});

// Atualizar material (tipo/descrição/responsável/prazo/status/obs). status entregue/veiculado carimba a data.
router.put('/materiais/:id', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id;
  const m = db.prepare('SELECT * FROM mkt_material WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!m) return res.status(404).json({ erro: 'Material não encontrado.' });
  const b = req.body || {};
  const campos = {
    tipo: b.tipo !== undefined ? (b.tipo || '').slice(0, 40) || null : m.tipo,
    descricao: b.descricao !== undefined ? (b.descricao || '').slice(0, 400) || null : m.descricao,
    responsavel_id: b.responsavel_id !== undefined ? (b.responsavel_id || null) : m.responsavel_id,
    responsavel_nome: b.responsavel_nome !== undefined ? ((b.responsavel_nome || '').slice(0, 120) || null) : m.responsavel_nome,
    prazo: b.prazo !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(b.prazo || '') ? b.prazo : null) : m.prazo,
    status: b.status !== undefined && MAT_STATUS.includes(b.status) ? b.status : m.status,
    obs: b.obs !== undefined ? ((b.obs || '').slice(0, 400) || null) : m.obs,
  };
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const entregue_em = (campos.status === 'entregue' || campos.status === 'veiculado') ? (m.entregue_em || now) : (campos.status === 'a_fazer' || campos.status === 'producao' ? null : m.entregue_em);
  const veiculado_em = campos.status === 'veiculado' ? (m.veiculado_em || now) : (campos.status === 'veiculado' ? m.veiculado_em : m.veiculado_em);
  db.prepare(`UPDATE mkt_material SET tipo=?, descricao=?, responsavel_id=?, responsavel_nome=?, prazo=?, status=?, obs=?, entregue_em=?, veiculado_em=? WHERE id=? AND empresa_id=?`)
    .run(campos.tipo, campos.descricao, campos.responsavel_id, campos.responsavel_nome, campos.prazo, campos.status, campos.obs, entregue_em, veiculado_em, m.id, emp);
  syncTarefaMaterial(emp, m.id);
  res.json({ ok: true });
});

// Anexar comprovação (evidência, base64). Se estava a_fazer/produção, marca 'entregue'.
router.post('/materiais/:id/comprovacao', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id;
  const m = db.prepare('SELECT * FROM mkt_material WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!m) return res.status(404).json({ erro: 'Material não encontrado.' });
  const b = req.body || {};
  if (!b.dados) return res.status(400).json({ erro: 'Envie o arquivo (dados base64).' });
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const novoStatus = ['a_fazer', 'producao'].includes(m.status) ? 'entregue' : m.status;
  db.prepare(`UPDATE mkt_material SET comprovacao=?, comprovacao_mime=?, comprovacao_nome=?, status=?, entregue_em=COALESCE(entregue_em,?) WHERE id=? AND empresa_id=?`)
    .run(String(b.dados).slice(0, 8000000), (b.mime || '').slice(0, 80) || null, (b.nome || 'comprovacao').slice(0, 160), novoStatus, now, m.id, emp);
  syncTarefaMaterial(emp, m.id);
  res.json({ ok: true, status: novoStatus });
});
router.get('/materiais/:id/comprovacao', (req, res) => {
  const m = db.prepare('SELECT comprovacao, comprovacao_mime, comprovacao_nome FROM mkt_material WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!m || !m.comprovacao) return res.status(404).json({ erro: 'Sem comprovação.' });
  res.json({ dados: m.comprovacao, mime: m.comprovacao_mime, nome: m.comprovacao_nome });
});
router.delete('/materiais/:id', exigePerfil(...GESTAO_MKT), (req, res) => {
  fecharTarefaMaterial(req.usuario.empresa_id, req.params.id);
  db.prepare('DELETE FROM mkt_material WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── REDES SOCIAIS (Instagram via Graph API da Meta) ──────────────────────────
const SOCIAL_REDES = ['instagram', 'tiktok'];
// Dois sabores de API: a NOVA "Instagram API with Instagram Login" (graph.instagram.com, token
// de usuário do Instagram, não precisa de Página) e a ANTIGA via Página (graph.facebook.com).
// Tenta a nova primeiro; se o id/token for do mundo antigo, cai no facebook.
async function fetchInstagramEm(base, token, contaId) {
  const alvo = encodeURIComponent(contaId && contaId.trim() ? contaId.trim() : 'me');
  const perfil = await fetch(`${base}/${alvo}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(token)}`).then(r => r.json());
  if (perfil && perfil.error) throw new Error(perfil.error.message || 'Erro na API do Instagram.');
  let alcance = null;
  try {
    const ins = await fetch(`${base}/${alvo}/insights?metric=reach&period=days_28&metric_type=total_value&access_token=${encodeURIComponent(token)}`).then(r => r.json());
    const d = ins && ins.data && ins.data[0];
    if (d) alcance = (d.total_value && typeof d.total_value.value === 'number') ? d.total_value.value : (d.values && d.values[0] ? d.values[0].value : null);
  } catch (e) { /* insights podem exigir permissão extra; segue sem alcance */ }
  return { username: perfil.username || null, seguidores: typeof perfil.followers_count === 'number' ? perfil.followers_count : null, alcance };
}
async function fetchInstagram(token, contaId) {
  try {
    return await fetchInstagramEm('https://graph.instagram.com/v21.0', token, contaId);
  } catch (eNova) {
    try { return await fetchInstagramEm('https://graph.facebook.com/v21.0', token, contaId); }
    catch (eAntiga) { throw eNova; } // erro da API nova é o mais informativo
  }
}
// Estado das conexões (sem expor o token).
router.get('/social', (req, res) => {
  const rows = db.prepare('SELECT rede, conta_id, username, seguidores, atualizado_em, erro, (token IS NOT NULL) AS conectado FROM mkt_social_conta WHERE empresa_id=?').all(req.usuario.empresa_id);
  res.json({ contas: rows });
});
// Conectar/atualizar credenciais (token de longa duração + id da conta).
router.put('/social/:rede', exigePerfil(...GESTAO_MKT), (req, res) => {
  const rede = req.params.rede; if (!SOCIAL_REDES.includes(rede)) return res.status(400).json({ erro: 'Rede inválida.' });
  const b = req.body || {};
  db.prepare(`INSERT INTO mkt_social_conta (empresa_id, rede, conta_id, token, atualizado_em) VALUES (?,?,?,?,NULL)
    ON CONFLICT(empresa_id, rede) DO UPDATE SET conta_id=excluded.conta_id, token=excluded.token, erro=NULL`)
    .run(req.usuario.empresa_id, rede, (b.conta_id || '').trim() || null, (b.token || '').trim() || null);
  res.json({ ok: true });
});
router.delete('/social/:rede', exigePerfil(...GESTAO_MKT), (req, res) => {
  db.prepare('DELETE FROM mkt_social_conta WHERE empresa_id=? AND rede=?').run(req.usuario.empresa_id, req.params.rede);
  res.json({ ok: true });
});
// Entrada MANUAL de seguidores (enquanto a API não está conectada, ou como override).
// Não mexe no token: funciona com ou sem conexão automática.
router.put('/social/:rede/manual', exigePerfil(...GESTAO_MKT), (req, res) => {
  const rede = req.params.rede; if (!SOCIAL_REDES.includes(rede)) return res.status(400).json({ erro: 'Rede inválida.' });
  const seg = parseInt(req.body && req.body.seguidores, 10);
  if (!Number.isFinite(seg) || seg < 0) return res.status(400).json({ erro: 'Informe um número de seguidores válido.' });
  const user = (req.body && req.body.username || '').trim().replace(/^@/, '') || null;
  const emp = req.usuario.empresa_id;
  db.prepare(`INSERT INTO mkt_social_conta (empresa_id, rede, seguidores, username, atualizado_em)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, rede) DO UPDATE SET seguidores=excluded.seguidores,
      username=COALESCE(excluded.username, mkt_social_conta.username), atualizado_em=datetime('now'), erro=NULL`)
    .run(emp, rede, seg, user);
  const hoje = new Date().toISOString().slice(0, 10);
  try {
    db.prepare(`INSERT INTO mkt_social_metrica (id, empresa_id, rede, data, seguidores, alcance) VALUES (?,?,?,?,?,NULL)
      ON CONFLICT(empresa_id, rede, data) DO UPDATE SET seguidores=excluded.seguidores`)
      .run('man-' + emp + '-' + rede + '-' + hoje, emp, rede, hoje, seg);
  } catch (e) { /* snapshot do dia é best-effort */ }
  res.json({ ok: true, seguidores: seg });
});
// Puxar métricas agora (Instagram) → salva snapshot do dia + atualiza a conta.
router.post('/social/:rede/atualizar', exigePerfil(...GESTAO_MKT), async (req, res) => {
  const emp = req.usuario.empresa_id, rede = req.params.rede;
  const c = db.prepare('SELECT conta_id, token FROM mkt_social_conta WHERE empresa_id=? AND rede=?').get(emp, rede);
  if (!c || !c.token || !c.conta_id) return res.status(400).json({ erro: 'Conecte primeiro (token + ID da conta).' });
  if (rede !== 'instagram') return res.status(400).json({ erro: 'Por enquanto só Instagram está integrado.' });
  try {
    const m = await fetchInstagram(c.token, c.conta_id);
    const hoje = new Date().toISOString().slice(0, 10);
    db.prepare("UPDATE mkt_social_conta SET username=?, seguidores=?, atualizado_em=datetime('now'), erro=NULL WHERE empresa_id=? AND rede=?").run(m.username, m.seguidores, emp, rede);
    db.prepare(`INSERT INTO mkt_social_metrica (id, empresa_id, rede, data, seguidores, alcance) VALUES (?,?,?,?,?,?)
      ON CONFLICT(empresa_id, rede, data) DO UPDATE SET seguidores=excluded.seguidores, alcance=excluded.alcance`)
      .run(uuid(), emp, rede, hoje, m.seguidores, m.alcance);
    res.json({ ok: true, ...m });
  } catch (e) {
    db.prepare("UPDATE mkt_social_conta SET erro=? WHERE empresa_id=? AND rede=?").run(String(e.message || e).slice(0, 300), emp, rede);
    res.status(502).json({ erro: 'Falha ao consultar a Meta: ' + e.message });
  }
});
router.get('/social/:rede/historico', (req, res) => {
  const rows = db.prepare('SELECT data, seguidores, alcance, engajamento FROM mkt_social_metrica WHERE empresa_id=? AND rede=? ORDER BY data DESC LIMIT 90').all(req.usuario.empresa_id, req.params.rede);
  res.json({ historico: rows });
});

module.exports = router;
