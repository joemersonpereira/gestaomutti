// email.js — configuração do "E-mail → Tarefa": regras remetente→responsável, status e sync manual.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const email = require('../lib/emailInbox');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro'];
router.use(auth);
router.use(exigePerfil(...GESTAO));

// Colaboradores p/ o seletor de responsável.
router.get('/colaboradores', (req, res) => {
  res.json({ colaboradores: db.prepare('SELECT id, nome FROM colaboradores WHERE empresa_id=? AND ativo=1 ORDER BY nome').all(req.usuario.empresa_id) });
});

// Status da conexão + contadores.
router.get('/status', (req, res) => {
  const emp = req.usuario.empresa_id;
  const tarefas = db.prepare("SELECT count(*) n FROM tarefas WHERE empresa_id=? AND origem='email'").get(emp).n;
  const processados = db.prepare('SELECT count(*) n FROM email_processados WHERE empresa_id=?').get(emp).n;
  res.json({ habilitado: email.habilitado(), host: email.CFG.host, usuario: email.CFG.user || null, pasta: email.CFG.pasta, dias: email.CFG.dias, tarefasCriadas: tarefas, processados });
});

// Testa a conexão IMAP (sem criar tarefa).
router.post('/testar', async (req, res) => { res.json(await email.testar()); });

// Regras remetente → responsável.
router.get('/regras', (req, res) => {
  const rows = db.prepare(`SELECT r.*, c.nome responsavel_nome FROM email_regras r
    LEFT JOIN colaboradores c ON c.id=r.responsavel_id WHERE r.empresa_id=? ORDER BY r.criado_em DESC`).all(req.usuario.empresa_id);
  res.json({ regras: rows });
});
router.post('/regras', (req, res) => {
  const { remetente, responsavel_id, rotulo } = req.body;
  if (!remetente) return res.status(400).json({ erro: 'Informe o remetente (e-mail ou domínio).' });
  const id = uuidv4();
  db.prepare('INSERT INTO email_regras (id, empresa_id, remetente, responsavel_id, rotulo, ativo) VALUES (?,?,?,?,?,1)')
    .run(id, req.usuario.empresa_id, String(remetente).trim().toLowerCase(), responsavel_id || null, rotulo || null);
  res.json({ ok: true, id });
});
router.put('/regras/:id', (req, res) => {
  const { remetente, responsavel_id, rotulo, ativo } = req.body;
  const r = db.prepare('SELECT * FROM email_regras WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!r) return res.status(404).json({ erro: 'Regra não encontrada.' });
  db.prepare('UPDATE email_regras SET remetente=?, responsavel_id=?, rotulo=?, ativo=? WHERE id=?')
    .run((remetente ?? r.remetente).trim().toLowerCase(), responsavel_id !== undefined ? responsavel_id : r.responsavel_id, rotulo !== undefined ? rotulo : r.rotulo, ativo !== undefined ? (ativo ? 1 : 0) : r.ativo, r.id);
  res.json({ ok: true });
});
router.delete('/regras/:id', (req, res) => {
  db.prepare('DELETE FROM email_regras WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Sincroniza agora (lê a caixa e cria tarefas).
router.post('/sincronizar', async (req, res) => {
  try { res.json(await email.sincronizar(req.usuario.empresa_id)); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

module.exports = router;
