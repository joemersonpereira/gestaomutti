// premiacaoFechamento.js — Fechamento mensal de Premiação: importa os relatórios do ERP,
// mostra o cálculo por colaborador (% 3/4/5, perfumaria, kits do caixa, gestão, descontos) e
// salva as decisões do operador. Fonte da base = os relatórios que o Joe baixa (upload).
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const pf = require('../lib/premiacaoFechamento');

router.use(auth);
const emp = req => req.usuario.empresa_id;
const wrap = fn => (req, res) => { try { res.json(fn(req)); } catch (e) { res.status(400).json({ erro: e.message }); } };

const ACESSO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Gerente', 'Financeiro', 'RH', 'Controladoria'];

router.get('/', exigePerfil(...ACESSO), wrap(req => pf.listar(emp(req), { mes: req.query.mes, ano: req.query.ano })));
router.post('/importar', exigePerfil(...ACESSO), wrap(req => pf.importar(emp(req), req.body)));
router.post('/item', exigePerfil(...ACESSO), wrap(req => pf.salvarItem(emp(req), req.body)));
router.get('/config', exigePerfil(...ACESSO), wrap(req => ({ cfg: pf.getCfg(emp(req)) })));
router.post('/config', exigePerfil('Diretor Geral', 'Gestor Geral', 'Supervisor', 'Financeiro'), wrap(req => ({ cfg: pf.salvarCfg(emp(req), req.body) })));

module.exports = router;
