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
const awrap = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(e.message && e.message.includes('FECHADO') ? 400 : (e.message && e.message.includes('ERP') ? 503 : 400)).json({ erro: e.message }); } };

const ACESSO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Gerente', 'Financeiro', 'RH', 'Controladoria'];

router.get('/', exigePerfil(...ACESSO), awrap(req => pf.listar(emp(req), { mes: req.query.mes, ano: req.query.ano })));
router.post('/importar', exigePerfil(...ACESSO), wrap(req => pf.importar(emp(req), req.body)));
router.post('/item', exigePerfil(...ACESSO), wrap(req => pf.salvarItem(emp(req), req.body)));
router.post('/item-lote', exigePerfil(...ACESSO), wrap(req => pf.salvarItemLote(emp(req), req.body)));
router.get('/config', exigePerfil(...ACESSO), wrap(req => ({ cfg: pf.getCfg(emp(req)) })));
router.post('/config', exigePerfil('Diretor Geral', 'Gestor Geral', 'Supervisor', 'Financeiro'), wrap(req => ({ cfg: pf.salvarCfg(emp(req), req.body) })));

// regras dos planos de remuneração (ERP, só leitura) — composição de cada plano
router.get('/planos-erp', exigePerfil(...ACESSO), async (req, res) => {
  try { res.json(await pf.planosErp(req.query.force === '1')); }
  catch (e) { res.status(503).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// puxar as bases AO VIVO do ERP (planos de remuneração) para o mês — grava o snapshot
router.post('/puxar-erp', exigePerfil(...ACESSO), async (req, res) => {
  try { res.json(await pf.puxarDoErp(emp(req), req.body)); }
  catch (e) { res.status(e.message && e.message.includes('FECHADO') ? 400 : 503).json({ erro: e.message }); }
});

// importar IDs e vínculos Pay X das cargas preenchidas (casa por CPF)
router.post('/importar-ids', exigePerfil(...ACESSO), wrap(req => pf.importarIds(emp(req), req.body)));
// subir planilha de diferencas de caixa (desconta por colaborador)
router.post('/dif-caixa', exigePerfil(...ACESSO), wrap(req => pf.importarDifCaixa(emp(req), req.body)));
// contas Pay X (cabeçalho por CNPJ: empresa/produto/código/taxa)
router.get('/contas', exigePerfil(...ACESSO), wrap(req => ({ contas: pf.listarContas(emp(req)) })));
router.post('/contas', exigePerfil('Diretor Geral', 'Gestor Geral', 'Supervisor', 'Financeiro'), wrap(req => pf.salvarConta(emp(req), req.body)));

// export no modelo da operadora (Pay X Virtual com PIX) — xlsx, uma aba por loja/CNPJ
router.get('/exportar', exigePerfil(...ACESSO), async (req, res) => {
  try {
    const r = await pf.exportarCarga(emp(req), req.query.mes, req.query.ano);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="cargas_premiacao_${String(req.query.mes).padStart(2, '0')}_${req.query.ano}.zip"`);
    res.setHeader('X-Sem-Id', String((r.sem_id || []).length)); // quantos pagáveis sem ID Premiação
    res.send(r.buffer);
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

// fechar/reabrir o mês (trava as decisões). Reabrir só gestão/financeiro.
const FECHA = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Financeiro'];
router.post('/fechar', exigePerfil(...FECHA), awrap(req => pf.fechar(emp(req), { ...req.body, usuario: req.usuario })));
router.post('/reabrir', exigePerfil(...FECHA), awrap(req => pf.fechar(emp(req), { ...req.body, usuario: req.usuario, reabrir: true })));

module.exports = router;
