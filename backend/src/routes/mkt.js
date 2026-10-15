// mkt.js — Calendário de Marketing: agenda de ações/postagens/eventos + influenciadores.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

const GESTAO_MKT = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Marketing'];
const rhia = require('../lib/rhia');
const { erpQuery, habilitado } = require('../db/erp');
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

// ── Agenda ───────────────────────────────────────────────────────────────
router.get('/agenda', (req, res) => {
  const emp = req.usuario.empresa_id;
  const cond = ['empresa_id=?']; const args = [emp];
  if (req.query.de) { cond.push('data_ini >= ?'); args.push(req.query.de); }
  if (req.query.ate) { cond.push('data_ini <= ?'); args.push(req.query.ate); }
  if (req.query.tipo) { cond.push('tipo=?'); args.push(req.query.tipo); }
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

router.post('/agenda', exigePerfil(...GESTAO_MKT), (req, res) => {
  const b = req.body; if (!b.titulo || !b.data_ini) return res.status(400).json({ erro: 'Informe título e data.' });
  const id = uuid();
  db.prepare(`INSERT INTO mkt_agenda (id,empresa_id,titulo,tipo,canal,data_ini,data_fim,hora,status,responsavel_id,responsavel_nome,descricao,
      envolvido_tipo,envolvido_id,envolvido_nome,envolvido_contato,envolvido_email,verba,patrocinador,patrocinio_valor,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.titulo, b.tipo || 'postagem', b.canal || null, b.data_ini, b.data_fim || null, b.hora || null,
      b.status || 'ideia', b.responsavel_id || null, b.responsavel_nome || null, b.descricao || null,
      b.envolvido_tipo || null, b.envolvido_id || null, b.envolvido_nome || null, b.envolvido_contato || null, b.envolvido_email || null,
      Number(b.verba) || null, b.patrocinador || null, Number(b.patrocinio_valor) || null, req.usuario.id);
  if (Array.isArray(b.envolvidos)) salvarEnvolvidos(id, b.envolvidos);
  if (b.comprador_id) vincularComprador(req.usuario.empresa_id, { id, titulo: b.titulo, comprador_id: null, comprador_tarefa_id: null }, b.comprador_id, b.comprador_prazo, req.usuario.id);
  res.json({ ok: true, id });
});

router.put('/agenda/:id', exigePerfil(...GESTAO_MKT), (req, res) => {
  const emp = req.usuario.empresa_id;
  const item = db.prepare('SELECT id FROM mkt_agenda WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!item) return res.status(404).json({ erro: 'Ação não encontrada.' });
  const campos = ['titulo', 'tipo', 'canal', 'data_ini', 'data_fim', 'hora', 'status', 'responsavel_id', 'responsavel_nome', 'descricao',
    'envolvido_tipo', 'envolvido_id', 'envolvido_nome', 'envolvido_contato', 'envolvido_email', 'verba', 'patrocinador', 'patrocinio_valor'];
  const set = [], vals = [];
  campos.forEach(c => { if (c in req.body) { set.push(`${c}=?`); vals.push(req.body[c] === '' ? null : req.body[c]); } });
  if (set.length) { set.push(`atualizado_em=datetime('now')`); db.prepare(`UPDATE mkt_agenda SET ${set.join(',')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp); }
  if (Array.isArray(req.body.envolvidos)) salvarEnvolvidos(req.params.id, req.body.envolvidos);
  if ('comprador_id' in req.body || 'comprador_prazo' in req.body) {
    const a = db.prepare('SELECT id, titulo, comprador_id, comprador_tarefa_id FROM mkt_agenda WHERE id=?').get(req.params.id);
    vincularComprador(emp, a, ('comprador_id' in req.body ? req.body.comprador_id : a.comprador_id) || null, ('comprador_prazo' in req.body ? req.body.comprador_prazo : a.comprador_prazo), req.usuario.id);
  }
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

module.exports = router;
