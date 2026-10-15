// rhia.js — API da Rhia (IA do sistema): base de conhecimento + perguntas.
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const db = require('../db/connection');
const rhia = require('../lib/rhia');

// A Rhia é do Diretor: só ele (e o Gestor Geral) treina e enxerga o que perguntam.
const DONO = ['Diretor Geral', 'Gestor Geral'];
router.use(auth);

router.get('/status', (req, res) => res.json({
  iaHabilitada: rhia.iaHabilitada(),
  fontes: rhia.listarFontes(req.usuario.empresa_id).length,
  dono: DONO.includes(req.usuario.funcao || req.usuario.funcao_nome),
}));

// Diretor vê tudo que foi perguntado à Rhia.
router.get('/conversas', exigePerfil(...DONO), require('../db/connection') && ((req, res) => {
  const db = require('../db/connection');
  const rows = db.prepare(`SELECT c.id, c.pergunta, c.resposta, c.usou_ia, c.util, c.criado_em, col.nome colaborador
    FROM rhia_conversas c LEFT JOIN colaboradores col ON col.id=c.colaborador_id
    WHERE c.empresa_id=? ORDER BY c.criado_em DESC LIMIT 200`).all(req.usuario.empresa_id);
  res.json({ conversas: rows });
}));

router.get('/fontes', (req, res) => res.json({ fontes: rhia.listarFontes(req.usuario.empresa_id) }));

router.post('/fontes', exigePerfil(...DONO), async (req, res) => {
  try { res.json({ ok: true, ...(await rhia.adicionarFonte(req.usuario.empresa_id, req.body, req.usuario.id)) }); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

router.delete('/fontes/:id', exigePerfil(...DONO), (req, res) => res.json(rhia.removerFonte(req.usuario.empresa_id, req.params.id)));

router.post('/seed-farma', exigePerfil(...DONO), (req, res) => res.json(rhia.seedFarma(req.usuario.empresa_id, req.usuario.id)));

router.post('/seed-sistema', exigePerfil(...DONO), (req, res) => res.json(rhia.seedSistema(req.usuario.empresa_id, req.usuario.id)));

router.post('/perguntar', async (req, res) => {
  if (!req.body.pergunta) return res.status(400).json({ erro: 'Faça uma pergunta.' });
  try { res.json(await rhia.perguntar(req.usuario.empresa_id, req.body.pergunta, req.usuario.id)); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/feedback/:id', (req, res) => res.json(rhia.feedback(req.usuario.empresa_id, req.params.id, req.body.util)));

module.exports = router;
