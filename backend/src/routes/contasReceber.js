// contasReceber.js — Contas a Receber: crediário, cartão (credenciadora) e PBM em aberto no ERP.
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const { lojasEmpresa } = require('../lib/escopoCompras');
const cr = require('../lib/contasReceberErp');

const GESTAO_FIN = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Tesouraria', 'Financeiro'];
router.use(auth);
router.use(exigePerfil(...GESTAO_FIN));

router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));

const wrap = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(502).json({ erro: e.message }); } };

router.get('/resumo', wrap(req => cr.resumo(req.usuario.empresa_id, { lojaId: req.query.loja || null })));
router.get('/crediario', wrap(req => cr.crediario(req.usuario.empresa_id, { lojaId: req.query.loja || null })));
router.get('/cartao', wrap(req => cr.cartao(req.usuario.empresa_id, { lojaId: req.query.loja || null, diasEmissao: req.query.dias != null ? Number(req.query.dias) : 90 })));
router.get('/pbm', wrap(req => cr.pbm(req.usuario.empresa_id, { lojaId: req.query.loja || null })));

module.exports = router;
