// hoptodesk.js — chamados do HopToDesk no Suporte Loja. Webhook PÚBLICO (assinado) + listagem/resumo
// autenticados. PULL opcional pela API (precisa HOPTODESK_API_KEY no .env).
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const hd = require('../lib/hoptodeskLib');
const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Supervisor', 'Suporte'];

// WEBHOOK (público): HopToDesk faz POST aqui. Valida a assinatura com o segredo (req.rawBody vem do
// express.json verify). Em dev/sem segredo, aceita mesmo assim (pra testar), mas loga.
router.post('/webhook', (req, res) => {
  const sig = req.get('X-Webhook-Signature');
  const temSegredo = !!process.env.HOPTODESK_WEBHOOK_SECRET;
  if (temSegredo && !hd.assinaturaOk(req.rawBody, sig)) return res.status(401).json({ erro: 'Assinatura inválida.' });
  try { const r = hd.processarEvento(req.body || {}); res.json(r); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

router.use(auth);
router.get('/tickets', (req, res) => res.json({ tickets: hd.listar({ status: req.query.status || '', prioridade: req.query.prioridade || '', busca: req.query.busca || '' }) }));
router.get('/resumo', (req, res) => res.json(hd.resumo({ dias: Number(req.query.dias) || 30 })));
router.post('/sincronizar', exigePerfil(...GESTAO), async (req, res) => {
  try { res.json(await hd.sincronizar({})); } catch (e) { res.status(500).json({ erro: e.message }); }
});
router.post('/semear', exigePerfil(...GESTAO), (req, res) => { try { res.json(hd.semearExemplo()); } catch (e) { res.status(500).json({ erro: e.message }); } });

module.exports = router;
