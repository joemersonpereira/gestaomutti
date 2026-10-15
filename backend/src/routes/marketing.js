const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');

router.use(auth);

// GET /marketing/campanhas
router.get('/campanhas', (req, res) => {
  const { empresa_id, funcao_nome, loja_id } = req.usuario;
  const campanhas = db.prepare(`
    SELECT c.*, col.nome as criado_por_nome
    FROM campanhas c LEFT JOIN colaboradores col ON col.id = c.criado_por_id
    WHERE c.empresa_id = ? ORDER BY c.criado_em DESC
  `).all(empresa_id);

  campanhas.forEach(c => {
    try { c.midia = c.midia_json ? JSON.parse(c.midia_json) : []; } catch (e) { c.midia = []; }
    delete c.midia_json;
    let q = `SELECT cl.*, l.nome as loja_nome FROM campanhas_lojas cl JOIN lojas l ON l.id = cl.loja_id WHERE cl.campanha_id = ?`;
    const params = [c.id];
    // Gerente/Vendedor só veem a própria loja
    if (['Gerente', 'Vendedor', 'Caixa'].includes(funcao_nome)) { q += ' AND cl.loja_id = ?'; params.push(loja_id); }
    c.lojas = db.prepare(q).all(...params);
    c.lojas.forEach(l => { try { l.comprovante = l.comprovante_json ? JSON.parse(l.comprovante_json) : []; } catch (e) { l.comprovante = []; } delete l.comprovante_json; });
    c.total_lojas = c.lojas.length;
    c.com_ciencia = c.lojas.filter(l => l.ciencia_em).length;
    c.comprovantes_ok = c.lojas.filter(l => l.comprovante_status === 'validado').length;
  });
  res.json({ campanhas });
});

// POST /marketing/campanhas — marketing cria e segmenta por loja
// body: { tipo:'campanha'|'acao', titulo, descricao, prazo, prazo_ciencia, lojas:[loja_id] }
router.post('/campanhas', exigePerfil('Marketing', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { tipo, titulo, descricao, prazo, prazo_ciencia, lojas = [], midia = [] } = req.body;
  if (!titulo || !tipo || !lojas.length) return res.status(400).json({ erro: 'Tipo, título e lojas obrigatórios.' });

  // midia: [{ nome, tipo (mime), dado (data URL base64) | url }]
  const midiaLimpa = Array.isArray(midia)
    ? midia.filter(m => m && (m.dado || m.url)).map(m => ({ nome: String(m.nome || 'arquivo').slice(0, 120), tipo: String(m.tipo || ''), dado: m.dado || null, url: m.url || null }))
    : [];
  const midiaJson = midiaLimpa.length ? JSON.stringify(midiaLimpa) : null;

  const id = uuidv4();
  db.prepare(`INSERT INTO campanhas (id,empresa_id,tipo,titulo,descricao,prazo,prazo_ciencia,midia_json,status,criado_por_id,criado_em) VALUES (?,?,?,?,?,?,?,?,'ativa',?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, tipo, titulo, descricao || '', prazo || null, prazo_ciencia || 5, midiaJson, req.usuario.id);

  const insCL = db.prepare(`INSERT INTO campanhas_lojas (campanha_id,loja_id) VALUES (?,?)`);
  const slaCiencia = (prazo_ciencia || 5) * 24;
  lojas.forEach(lojaId => {
    insCL.run(id, lojaId);
    // Notificação de ciência para o gerente da loja (bloqueante se vencer)
    const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND loja_id = ? AND funcao_id = 'func-gerente' AND ativo = 1 LIMIT 1`)
      .get(req.usuario.empresa_id, lojaId);
    if (gerente) {
      gerarTarefa({
        empresa_id: req.usuario.empresa_id, loja_id: lojaId, tipo: 'notificacao', origem: 'campanha',
        referencia_id: id,
        titulo: `Ciência — ${tipo === 'acao' ? 'Ação' : 'Campanha'}: ${titulo}`,
        descricao: descricao || 'Confirme a ciência desta campanha.',
        responsavel_id: gerente.id, sla_horas: slaCiencia, criado_por: req.usuario.id,
      });
    }
  });
  res.status(201).json({ mensagem: 'Campanha criada e enviada às lojas.', id, lojas: lojas.length });
});

// POST /marketing/campanhas/:id/ciencia — gerente confirma ciência da loja
router.post('/campanhas/:id/ciencia', (req, res) => {
  const r = db.prepare(`UPDATE campanhas_lojas SET ciencia_em = datetime('now') WHERE campanha_id = ? AND loja_id = ? AND ciencia_em IS NULL`)
    .run(req.params.id, req.usuario.loja_id);
  if (!r.changes) return res.status(400).json({ erro: 'Ciência já confirmada ou loja não vinculada.' });
  res.json({ mensagem: 'Ciência confirmada.' });
});

// GET /marketing/campanhas/:id/loja — dados da campanha + status desta loja (para o card no Kanban)
// ?loja_id= (opcional) — Marketing/gestão pode ver o comprovante de uma loja específica para validar
router.get('/campanhas/:id/loja', (req, res) => {
  const c = db.prepare(`SELECT id, tipo, titulo, descricao, midia_json, status FROM campanhas WHERE id = ? AND empresa_id = ?`).get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Campanha não encontrada.' });
  const ehGestao = ['Marketing', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  const lojaAlvo = (req.query.loja_id && ehGestao) ? req.query.loja_id : req.usuario.loja_id;
  const cl = db.prepare(`SELECT * FROM campanhas_lojas WHERE campanha_id = ? AND loja_id = ?`).get(req.params.id, lojaAlvo);
  let midia = []; try { midia = c.midia_json ? JSON.parse(c.midia_json) : []; } catch (e) { midia = []; }
  let comprovante = []; try { comprovante = cl?.comprovante_json ? JSON.parse(cl.comprovante_json) : []; } catch (e) { comprovante = []; }
  res.json({
    id: c.id, tipo: c.tipo, titulo: c.titulo, descricao: c.descricao, midia,
    loja_id: lojaAlvo,
    ciencia_em: cl?.ciencia_em || null,
    comprovante_status: cl?.comprovante_status || 'pendente',
    comprovante_enviado_em: cl?.comprovante_enviado_em || null,
    comprovante,
  });
});

// POST /marketing/campanhas/:id/comprovante — gerente comprova execução (fotos tiradas na hora + IP/horário + rótulo)
// body: { fotos:[{ label, dado(dataURL) }], url? }
router.post('/campanhas/:id/comprovante', (req, res) => {
  const { url, fotos = [] } = req.body;
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
  const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const itens = [];
  if (Array.isArray(fotos)) {
    fotos.filter(f => f && f.dado).forEach(f => itens.push({ label: String(f.label || 'Foto').slice(0, 60), dado: f.dado, ip, em: agora }));
  }
  if (url && url.trim()) itens.push({ label: 'Link', url: url.trim(), ip, em: agora });
  if (!itens.length) return res.status(400).json({ erro: 'Tire ao menos uma foto (ou informe um link) para comprovar.' });

  // Acrescenta aos comprovantes já existentes desta loja
  const cl = db.prepare(`SELECT comprovante_json FROM campanhas_lojas WHERE campanha_id = ? AND loja_id = ?`).get(req.params.id, req.usuario.loja_id);
  let atuais = []; try { atuais = cl?.comprovante_json ? JSON.parse(cl.comprovante_json) : []; } catch (e) { atuais = []; }
  const todos = [...atuais, ...itens];

  db.prepare(`UPDATE campanhas_lojas SET comprovante_status = 'enviado', comprovante_enviado_em = datetime('now'), comprovante_json = ? WHERE campanha_id = ? AND loja_id = ?`)
    .run(JSON.stringify(todos), req.params.id, req.usuario.loja_id);

  // Gera tarefa para o Marketing validar o comprovante
  const mkt = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND funcao_id = 'func-marketing' AND ativo = 1 LIMIT 1`).get(req.usuario.empresa_id);
  const camp = db.prepare('SELECT titulo FROM campanhas WHERE id = ?').get(req.params.id);
  if (mkt) {
    gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id: req.usuario.loja_id, tipo: 'tarefa', origem: 'campanha',
      referencia_id: req.params.id,
      titulo: `Validar comprovante — ${camp?.titulo || ''}`,
      descricao: `Loja ${req.usuario.loja_nome} enviou ${itens.length} comprovante(s) de execução.`,
      responsavel_id: mkt.id, sla_horas: 48, criado_por: req.usuario.id,
    });
  }
  res.json({ mensagem: 'Comprovante enviado para validação.', total: todos.length });
});

// POST /marketing/campanhas/:id/validar — marketing valida/rejeita comprovante de uma loja
// body: { loja_id, aprovado:true|false }
router.post('/campanhas/:id/validar', exigePerfil('Marketing', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { loja_id, aprovado } = req.body;
  const status = aprovado ? 'validado' : 'rejeitado';
  db.prepare(`UPDATE campanhas_lojas SET comprovante_status = ?, comprovante_validado_em = datetime('now') WHERE campanha_id = ? AND loja_id = ?`)
    .run(status, req.params.id, loja_id);
  if (!aprovado) {
    const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND loja_id = ? AND funcao_id = 'func-gerente' AND ativo = 1 LIMIT 1`)
      .get(req.usuario.empresa_id, loja_id);
    const camp = db.prepare('SELECT titulo FROM campanhas WHERE id = ?').get(req.params.id);
    if (gerente) gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id, tipo: 'tarefa', origem: 'campanha',
      titulo: `Reenviar comprovante — ${camp?.titulo || ''}`,
      descricao: 'Comprovante rejeitado pelo Marketing. Reenvie corrigido.',
      responsavel_id: gerente.id, urgente: 1, sla_horas: 48, criado_por: req.usuario.id,
    });
  }
  res.json({ mensagem: `Comprovante ${status}.` });
});

module.exports = router;
