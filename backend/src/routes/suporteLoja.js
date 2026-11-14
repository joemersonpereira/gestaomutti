// suporteLoja.js — hub "Suporte Loja": NF × XML (recebida sem entrada), tempo de entrada, etc.
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { lojasEmpresa } = require('../lib/escopoCompras');
const sup = require('../lib/suporteLojaErp');
const { cacheMiddleware } = require('../lib/erpCache');
const sCache = cacheMiddleware('suploja');

router.use(auth);
// Período padrão: aceita `dias` OU intervalo `ini`/`fim` (Hoje/Mês atual/Mês passado/datas).
const per = req => ({ lojaId: req.query.loja || '', dias: req.query.dias, ini: req.query.ini || '', fim: req.query.fim || '' });
router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));
router.get('/nf-xml', sCache, async (req, res) => {
  try { res.json(await sup.nfXmlSemEntrada(req.usuario.empresa_id, { ...per(req), dias: req.query.dias || 60 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/ajustes-estoque', sCache, async (req, res) => {
  try { res.json(await sup.ajustesEstoque(req.usuario.empresa_id, { ...per(req), dias: req.query.dias || 30 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/acuracidade', sCache, async (req, res) => {
  try { res.json(await sup.acuracidadeEstoque(req.usuario.empresa_id, { ...per(req), dias: req.query.dias || 365 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/entrada-sem-recepcao', sCache, async (req, res) => {
  try { res.json(await sup.entradaSemRecepcao(req.usuario.empresa_id, { ...per(req), dias: req.query.dias || 30 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/recepcao-conferencia', sCache, async (req, res) => {
  try { res.json(await sup.recepcaoJuntoConferencia(req.usuario.empresa_id, { ...per(req), dias: req.query.dias || 30, limiteMin: req.query.limite || 15 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/erros-entrada', sCache, async (req, res) => {
  try { res.json(await sup.errosEntrada(req.usuario.empresa_id, { ...per(req), dias: req.query.dias || 30 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
// Notas pendentes de entrada: conciliadas (liberadas) sem recepção física (e as sem conferência).
router.get('/notas-pendentes-entrada', sCache, async (req, res) => {
  try { res.json(await sup.notasLiberadasPendentes(req.usuario.empresa_id, { ...per(req), dias: req.query.dias || 90 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
// "Minha área" do Suporte: resumo de pendências acionáveis (contagens) p/ o painel lateral.
router.get('/minha-area', sCache, async (req, res) => {
  try { res.json(await sup.minhaAreaResumo(req.usuario.empresa_id, { lojaId: req.query.loja || '', dias: req.query.dias || 90 })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
