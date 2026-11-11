// convenio.js — Convênio (menu Financeiro): empresas conveniadas, consumo por mês, controle de NF.
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const cv = require('../lib/convenioErp');

const GESTAO_FIN = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Tesouraria'];
router.use(auth);
router.use(exigePerfil(...GESTAO_FIN));

const wrap = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(502).json({ erro: e.message }); } };

router.get('/convenios', wrap(req => cv.listarConvenios(req.usuario.empresa_id)));
router.put('/convenios/:id', (req, res) => { try { res.json(cv.salvarConvenio(req.usuario.empresa_id, req.params.id, req.body || {})); } catch (e) { res.status(400).json({ erro: e.message }); } });
router.get('/convenios/:id/consumo', wrap(req => cv.consumoCompetencia(req.usuario.empresa_id, req.params.id, req.query.comp || new Date().toISOString().slice(0, 7))));
router.get('/convenios/:id/fechamentos', (req, res) => res.json(cv.listarFechamentos(req.usuario.empresa_id, req.params.id)));
router.post('/convenios/:id/fechamento', (req, res) => {
  try { res.json(cv.salvarFechamento(req.usuario.empresa_id, req.params.id, req.body.competencia, { ...req.body, usuario: req.usuario })); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
router.get('/fechamento/:id/anexo', (req, res) => {
  const a = cv.anexoFechamento(req.usuario.empresa_id, req.params.id);
  if (!a || !a.nf_anexo) return res.status(404).send('Sem anexo.');
  const m = /^data:([^;]+);base64,(.+)$/.exec(a.nf_anexo);
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', a.nf_mime || 'application/octet-stream'); res.send(a.nf_anexo);
});
router.get('/metas', (req, res) => res.json(cv.metasResponsavel(req.usuario.empresa_id, { ano: req.query.ano })));

module.exports = router;
