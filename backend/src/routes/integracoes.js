// integracoes.js — Status das integrações do sistema (saber se estão rodando ou travadas).
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

router.use(auth);
const GATE = ['Diretor Geral', 'Gestor Geral', 'Suporte', 'Controladoria'];

router.get('/status', async (req, res) => {
  if (!GATE.includes(req.usuario.funcao_nome)) return res.status(403).json({ erro: 'Sem permissão.' });
  const out = [];
  const simples = (chave, nome, cfg, okMsg, offMsg) => out.push({ chave, nome, configurado: cfg, ok: cfg, detalhe: cfg ? okMsg : offMsg });

  // ERP (Postgres) — testa a conexão de fato
  try {
    const erp = require('../db/erp');
    const item = { chave: 'erp', nome: 'ERP (Postgres)', configurado: erp.habilitado() };
    if (erp.habilitado()) {
      try {
        await Promise.race([erp.erpPing(), new Promise((_, rej) => setTimeout(() => rej(new Error('ERP não respondeu em 6s (lento/travado)')), 6000))]);
        item.ok = true; item.detalhe = 'Conectado' + (erp.bancoAtual ? ' · banco ' + erp.bancoAtual : '');
      } catch (e) { item.ok = false; item.detalhe = 'Erro na conexão: ' + String(e.message || e).slice(0, 140); }
    } else { item.ok = false; item.detalhe = 'Não configurado (.env)'; }
    out.push(item);
  } catch (e) { out.push({ chave: 'erp', nome: 'ERP (Postgres)', configurado: false, ok: false, detalhe: 'Módulo indisponível' }); }

  try { const t = require('../lib/tangerino'); simples('tangerino', 'Ponto (Tangerino)', t.habilitado(), 'Token configurado', 'Sem token (.env)'); } catch { simples('tangerino', 'Ponto (Tangerino)', false, '', 'Indisponível'); }
  try { const t = require('../lib/trivioPdv'); simples('trivio', 'Trivio PDV+ (taxa de conversão)', t.habilitado(), 'Ativo', 'Desativado'); } catch { simples('trivio', 'Trivio PDV+', false, '', 'Indisponível'); }
  try { const b = require('../lib/botvendas'); simples('botvendas', 'BotVendas (delivery/atendimento)', b.habilitado(), 'Credenciais configuradas', 'Sem credenciais (.env)'); } catch { simples('botvendas', 'BotVendas', false, '', 'Indisponível'); }
  try { const r = require('../lib/rhia'); simples('rhia', 'Rhia (IA · Claude)', r.iaHabilitada(), 'API key ativa', 'Sem API key (.env)'); } catch { simples('rhia', 'Rhia (IA)', false, '', 'Indisponível'); }

  res.json({ verificadoEm: new Date().toISOString(), integracoes: out });
});

module.exports = router;
