// ecommConversao.js — Conversão Giro/E-commerce × ERP: histórico, configuração e execução manual.
// A rotina roda sozinha todo dia (ver server.js); estas rotas são para consultar e ajustar.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const conv = require('../lib/ecommConversao');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria'];
router.use(auth);

const empresaDe = req => req.usuario.empresa_id;

// Histórico + resumo + configuração
router.get('/', (req, res) => {
  const eid = empresaDe(req);
  const where = ['empresa_id=?'], args = [eid];
  if (req.query.resultado) { where.push('resultado=?'); args.push(req.query.resultado); }
  const log = db.prepare(`SELECT * FROM ecomm_conversao_log WHERE ${where.join(' AND ')} ORDER BY checkout_em DESC LIMIT 500`).all(...args);
  const resumo = db.prepare(`SELECT resultado, COUNT(*) n, ROUND(COALESCE(SUM(valor),0),2) valor FROM ecomm_conversao_log WHERE empresa_id=? GROUP BY resultado`).all(eid);
  const config = db.prepare('SELECT chave, valor, label FROM ecomm_conversao_config WHERE empresa_id=? ORDER BY rowid').all(eid);
  res.json({ resumo, config, log });
});

// Altera uma configuração (horário, janela, registrar_auto...)
router.put('/config/:chave', exigePerfil(...GESTAO), (req, res) => {
  const r = db.prepare('UPDATE ecomm_conversao_config SET valor=? WHERE empresa_id=? AND chave=?')
    .run(String(req.body.valor ?? ''), empresaDe(req), req.params.chave);
  if (!r.changes) return res.status(404).json({ erro: 'Configuração não encontrada.' });
  res.json({ ok: true });
});

// Executa agora. body.simular=true → analisa sem registrar na API.
router.post('/executar', exigePerfil(...GESTAO), async (req, res) => {
  try {
    res.json(await conv.executar(empresaDe(req), { simular: !!(req.body && req.body.simular) }));
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

module.exports = router;
