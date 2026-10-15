// suporte.js — Chamados de Suporte/TI. Qualquer colaborador abre; o time de Suporte acompanha e responde.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

router.use(auth);

// Quem gerencia (vê todos, muda status, responde). Demais só veem/abrem os seus.
const GESTOR = ['Suporte', 'Gestor Geral', 'Diretor Geral', 'Controladoria'];
const ehGestor = u => GESTOR.includes(u.funcao_nome);

const CATEGORIAS = ['sistema', 'erp', 'equipamento', 'acesso', 'duvida', 'outro'];
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'];
const STATUS = ['aberto', 'andamento', 'resolvido', 'fechado'];

router.get('/', (req, res) => {
  const u = req.usuario;
  const { status } = req.query;
  let sql = 'SELECT * FROM chamados WHERE empresa_id=?';
  const p = [u.empresa_id];
  if (!ehGestor(u)) { sql += ' AND aberto_por=?'; p.push(u.id); }
  if (status && STATUS.includes(status)) { sql += ' AND status=?'; p.push(status); }
  sql += ' ORDER BY CASE prioridade WHEN \'urgente\' THEN 0 WHEN \'alta\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, criado_em DESC';
  const chamados = db.prepare(sql).all(...p);
  const abertos = db.prepare("SELECT COUNT(*) c FROM chamados WHERE empresa_id=? AND status IN ('aberto','andamento')" + (ehGestor(u) ? '' : ' AND aberto_por=?')).get(...(ehGestor(u) ? [u.empresa_id] : [u.empresa_id, u.id])).c;
  res.json({ chamados, abertos, gestor: ehGestor(u), categorias: CATEGORIAS, prioridades: PRIORIDADES });
});

router.post('/', (req, res) => {
  const u = req.usuario;
  const { titulo, descricao, categoria, prioridade } = req.body;
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe um título.' });
  const cat = CATEGORIAS.includes(categoria) ? categoria : 'sistema';
  const pri = PRIORIDADES.includes(prioridade) ? prioridade : 'normal';
  let lojaNome = null;
  if (u.loja_id) { try { lojaNome = db.prepare('SELECT nome FROM lojas WHERE id=?').get(u.loja_id)?.nome || null; } catch { /* ignore */ } }
  const id = uuid();
  db.prepare(`INSERT INTO chamados (id,empresa_id,aberto_por,aberto_nome,loja_id,loja_nome,categoria,titulo,descricao,prioridade,status)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'aberto')`)
    .run(id, u.empresa_id, u.id, u.nome, u.loja_id || null, lojaNome, cat, titulo.trim(), (descricao || '').trim(), pri);
  res.json({ ok: true, id });
});

// Atualizar (só gestor): status, resposta, assumir responsabilidade.
router.patch('/:id', (req, res) => {
  const u = req.usuario;
  if (!ehGestor(u)) return res.status(403).json({ erro: 'Sem permissão.' });
  const ch = db.prepare('SELECT * FROM chamados WHERE id=? AND empresa_id=?').get(req.params.id, u.empresa_id);
  if (!ch) return res.status(404).json({ erro: 'Chamado não encontrado.' });
  const status = STATUS.includes(req.body.status) ? req.body.status : ch.status;
  const resposta = req.body.resposta != null ? String(req.body.resposta).trim() : ch.resposta;
  const assumir = req.body.assumir;
  const respId = assumir ? u.id : ch.responsavel_id;
  const respNome = assumir ? u.nome : ch.responsavel_nome;
  const fechado = (status === 'fechado' || status === 'resolvido') && !ch.fechado_em ? "datetime('now')" : (ch.fechado_em ? `'${ch.fechado_em}'` : 'NULL');
  db.prepare(`UPDATE chamados SET status=?, resposta=?, responsavel_id=?, responsavel_nome=?, atualizado_em=datetime('now'), fechado_em=${fechado} WHERE id=?`)
    .run(status, resposta, respId, respNome, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
