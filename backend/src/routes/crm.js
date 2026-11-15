// crm.js — CRM (cuidar dos clientes) com dados do Trivio: campanhas (resumo/vendas),
// auditoria de envios, retenção. Leitura via trivioCrm (api.triv.io, login reusado do PDV+).
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const crm = require('../lib/trivioCrm');
const cadernoFilipeta = require('../lib/crmCadernoFilipeta');
const { cacheMiddleware, invalidarMiddleware } = require('../lib/erpCache');

router.use(auth);
// Cache serve-stale: períodos fechados ficam instantâneos; mês atual recalcula no TTL. ?forcar=1 ignora.
router.use(cacheMiddleware('crm'));
router.use(invalidarMiddleware('crm'));

const off = res => res.json({ erp: false, erro: 'Integração Trivio não configurada (TRIVIO_EMAIL/SENHA).' });

// Resumo de resultados das campanhas no período (por campanha: enviados, compraram, vendas, ROI…).
router.get('/campanhas', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.campanhasOverview({ de: req.query.de, ate: req.query.ate })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Lista de campanhas (para o seletor dos detalhes).
router.get('/campanhas/lista', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.listarCampanhas({ nome: req.query.nome })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Vendas de uma campanha (quem comprou, RFV anterior → posterior).
router.get('/campanhas/:id/vendas', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.campanhaVendas(req.params.id, { de: req.query.de, ate: req.query.ate, campaignDigitalId: req.query.digital })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Auditoria de envios: quem recebeu, status, respostas.
router.get('/envios', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.auditoriaEnvios({ de: req.query.de, ate: req.query.ate, busca: req.query.busca, campaignDigitalId: req.query.campanha, onlyFailed: req.query.falhas === '1', onlyAnswered: req.query.respondidas === '1', size: Number(req.query.size) || 50 })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Detalhe de um envio: mensagem + cupom + respostas do cliente (texto).
router.get('/envios/detalhe', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.envioDetalhe({ customerId: req.query.cliente, campaignDigitalId: req.query.campanha, campaignDigitalEventId: req.query.evento, messageConsolidationId: req.query.consolidacao })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Retenção (retenção %, churn, receita, ticket, frequência).
router.get('/retencao', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.retencao({ periodType: Number(req.query.periodo) || 0, windowType: Number(req.query.janela) || 2 })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Análise RFV: os 11 segmentos com quantidade e %.
router.get('/rfv', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.rfv()); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Fidelização ao longo do tempo (Fiel/Potencial/Ocasional).
router.get('/fidelizacao', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.fidelizacao({ de: req.query.de, ate: req.query.ate })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Análise de sugestão (PDV+) — conversão por vendedor/loja.
router.get('/sugestao', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.sugestao({ mes: req.query.mes, ano: req.query.ano })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Resultado das filipetas (encartes) por loja.
router.get('/filipetas', async (req, res) => {
  if (!crm.habilitado()) return off(res);
  try { res.json(await crm.filipetas({ mes: req.query.mes, ano: req.query.ano })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Caderno de oferta novo → tarefa de Marketing "criar filipeta". POST (escrita; não cacheia).
// dry=1 só lista os cadernos novos sem criar tarefa. Também roda sozinho no boot/intervalo.
router.post('/cadernos/sincronizar', exigePerfil('Marketing', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Controladoria'), async (req, res) => {
  try { res.json(await cadernoFilipeta.sincronizarCadernosFilipeta(req.usuario.empresa_id, { dryRun: req.query.dry === '1', diasNovo: Number(req.query.dias) || 10 })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

module.exports = router;
