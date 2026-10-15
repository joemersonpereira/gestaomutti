// entrega.js — Módulo Entrega (delivery): entregas por entregador e tempo de rota, do ERP.
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const en = require('../lib/entregaErp');
const bv = require('../lib/botvendas');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Gerente', 'Subgerente'];
router.use(auth);
router.use(exigePerfil(...GESTAO));

const hoje = () => new Date().toISOString().slice(0, 10);
const iniMes = () => hoje().slice(0, 8) + '01';
const wrap = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(502).json({ erro: e.message }); } };

router.get('/lojas', (req, res) => res.json({ lojas: en.lojas(req.usuario.empresa_id) }));
router.get('/resumo', wrap(req => en.resumo(req.usuario.empresa_id, { ini: req.query.ini || iniMes(), fim: req.query.fim || hoje(), lojaId: req.query.loja || null })));
router.get('/entregadores', wrap(req => en.porEntregador(req.usuario.empresa_id, { ini: req.query.ini || iniMes(), fim: req.query.fim || hoje(), lojaId: req.query.loja || null })));
router.get('/tempo', wrap(req => en.tempoDistribuicao(req.usuario.empresa_id, { ini: req.query.ini || iniMes(), fim: req.query.fim || hoje(), lojaId: req.query.loja || null })));
router.get('/vendas-entrega', wrap(req => en.vendasEntrega(req.usuario.empresa_id, { ini: req.query.ini || iniMes(), fim: req.query.fim || hoje(), lojaId: req.query.loja || null })));
router.get('/cancelados', wrap(req => en.cancelados(req.usuario.empresa_id, { ini: req.query.ini || iniMes(), fim: req.query.fim || hoje(), lojaId: req.query.loja || null })));
router.get('/vendas-colaborador', wrap(req => en.vendasPorColaborador(req.usuario.empresa_id, { ini: req.query.ini || iniMes(), fim: req.query.fim || hoje(), lojaId: req.query.loja || null })));
// Funil do bot de conversas (BotVendas) — pedidos por status, por faixa de tempo e vendas por atendente.
router.get('/botvendas', wrap(async req => {
  if (!bv.habilitado()) return { ok: false, habilitado: false };
  const shops = (req.query.shops || '').split(',').map(s => s.trim()).filter(Boolean);
  return { habilitado: true, ...(await bv.painel(req.query.ini || iniMes(), req.query.fim || hoje(), shops)) };
}));

module.exports = router;
