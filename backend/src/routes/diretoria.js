// diretoria.js — Menu Diretoria. Fechamento do setor: valida a premiação (5 requisitos) e libera o valor final.
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const fech = require('../lib/diretoriaFechamento');

router.use(auth);
const soDir = exigePerfil('Diretor Geral', 'Gestor Geral', 'Controladoria');

router.get('/fechamento-setor', soDir, async (req, res) => {
  try { res.json(await fech.fechamento(req.usuario.empresa_id, req.query.setor || 'tesouraria', { ano: req.query.ano, mes: req.query.mes, forcar: req.query.forcar === '1' })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});
router.put('/fechamento-setor/validacao', soDir, (req, res) => {
  try { res.json(fech.setValidacao(req.usuario.empresa_id, req.body.setor || 'tesouraria', req.body, req.usuario)); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
// Ranking trimestral por Desenvolvimento + prêmio configurável do melhor
router.get('/rank-trimestral', soDir, async (req, res) => {
  try { res.json(await fech.rankTrimestral(req.usuario.empresa_id, req.query.setor || 'tesouraria', { ano: req.query.ano, tri: req.query.tri })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});
router.put('/rank-trimestral/premio', soDir, (req, res) => {
  try { res.json(fech.setPremioDevTri(req.usuario.empresa_id, req.body.setor || 'tesouraria', req.body.valor)); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

module.exports = router;
