// precificacao.js — área de Precificação (relatórios de preço + marcar corrigido).
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const prec = require('../lib/precificacaoErp');
const { lojasEmpresa } = require('../lib/escopoCompras');
const { cacheMiddleware: _ccMw, invalidarMiddleware: _ccInv } = require('../lib/erpCache');
const pCache = _ccMw('prec');
const pInval = _ccInv('prec:');
const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar'];

router.use(auth);
router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));

const comParams = req => ({ lojaId: req.query.loja || '', compradorId: req.query.comprador || null, classificacaoId: req.query.classificacao || null, dias: req.query.dias, ini: req.query.ini || '', fim: req.query.fim || '' });

router.get('/abaixo-custo', pCache, async (req, res) => {
  try { const r = await prec.vendidoAbaixoCusto(req.usuario.empresa_id, comParams(req)); r.corrigidos = prec.listarCorrigidos(req.usuario.empresa_id, 'abaixo_custo'); res.json(r); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/abaixo-margem', pCache, async (req, res) => {
  try { const r = await prec.vendidoAbaixoMargem(req.usuario.empresa_id, { ...comParams(req), margemMin: req.query.margem }); r.corrigidos = prec.listarCorrigidos(req.usuario.empresa_id, 'abaixo_margem'); res.json(r); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/comprado', pCache, async (req, res) => {
  try { const r = await prec.compradoVariacao(req.usuario.empresa_id, { ...comParams(req), dir: req.query.dir }); r.corrigidos = prec.listarCorrigidos(req.usuario.empresa_id, 'comprado_caro'); res.json(r); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.put('/corrigir', exigePerfil(...GESTAO), pInval, (req, res) => { try { res.json(prec.marcarCorrigido(req.usuario.empresa_id, req.body, req.usuario)); } catch (e) { res.status(400).json({ erro: e.message }); } });
router.delete('/corrigir', exigePerfil(...GESTAO), pInval, (req, res) => res.json(prec.desmarcarCorrigido(req.usuario.empresa_id, { tipo: req.query.tipo, produto_id: req.query.produto_id, uni: req.query.uni })));

// ── Meu Setor da Precificação (por COMPRADOR): pilares/metas/premiação ──────────────────────────
const ms = require('../lib/precificacaoMeuSetor');
const GESTAO_MS = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Supervisor'];
router.get('/meu-setor/compradores', (req, res) => res.json({ compradores: ms.compradores(req.usuario.empresa_id) }));
router.get('/meu-setor/:comprador/apurar', async (req, res) => {
  try { res.json(await ms.apurar(req.usuario.empresa_id, req.params.comprador, { dias: Number(req.query.dias) || 30, ini: req.query.ini || '', fim: req.query.fim || '' })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/meu-setor/:comprador/config', (req, res) => res.json({ pilares: ms.PILARES, indicadores: ms.config(req.usuario.empresa_id, req.params.comprador) }));
router.post('/meu-setor/:comprador/config', exigePerfil(...GESTAO_MS), (req, res) => {
  try { res.json(ms.setConfig(req.usuario.empresa_id, req.params.comprador, req.body || {})); } catch (e) { res.status(400).json({ erro: e.message }); }
});
router.get('/meu-setor/premio', (req, res) => res.json({ premioValor: ms.premioPilar(req.usuario.empresa_id), bonusPct: ms.premioBonusPct(req.usuario.empresa_id) }));
router.put('/meu-setor/premio', exigePerfil(...GESTAO_MS), (req, res) => { try { res.json(ms.setPremio(req.usuario.empresa_id, req.body || {})); } catch (e) { res.status(400).json({ erro: e.message }); } });
router.post('/meu-setor/:comprador/pessoas', exigePerfil(...GESTAO_MS), (req, res) => { try { res.json(ms.addPessoa(req.usuario.empresa_id, req.params.comprador, req.body || {})); } catch (e) { res.status(400).json({ erro: e.message }); } });
router.delete('/meu-setor/:comprador/pessoas/:id', exigePerfil(...GESTAO_MS), (req, res) => { try { res.json(ms.rmPessoa(req.usuario.empresa_id, req.params.comprador, req.params.id)); } catch (e) { res.status(400).json({ erro: e.message }); } });

// ── Pesquisa de Preço (Fase 1): listar produtos do ERP + gerar a planilha da empresa ──────────────
const pq = require('../lib/pesquisaPrecoErp');
const cad = require('../lib/precificacaoCadernos');
router.get('/pesquisa/produtos', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const porTag = req.query.tag ? cad.produtosComTag(emp, req.query.tag) : null;
    const r = await pq.listarProdutos(emp, { compradorId: req.query.comprador || null, classificacaoId: req.query.classificacao || null,
      produtoIds: porTag, busca: req.query.busca || '', dias: Number(req.query.dias) || 90, limite: Number(req.query.limite) || 400 });
    // enriquece com as tags de cada produto
    const tags = cad.tagsDeProdutos(emp, (r.itens || []).map(i => i.produtoId));
    (r.itens || []).forEach(i => { i.tags = tags[i.produtoId] || []; });
    res.json(r);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});
// Tags de produto (formador de tráfego/opinião etc) — editáveis.
router.get('/pesquisa/tags', (req, res) => res.json({ tags: cad.tagsSugeridas(req.usuario.empresa_id) }));
router.post('/pesquisa/tag', exigePerfil(...GESTAO), (req, res) => { try { res.json(cad.setTag(req.usuario.empresa_id, req.body || {})); } catch (e) { res.status(400).json({ erro: e.message }); } });
// Cadernos de oferta: frequência + validador de execução.
router.get('/cadernos-erp', async (req, res) => { try { res.json({ cadernos: await pq.cadernosErp(req.usuario.empresa_id, { busca: req.query.busca || '' }) }); } catch (e) { res.status(500).json({ erro: e.message }); } });
router.get('/cadernos', (req, res) => res.json({ cadernos: cad.listarCadernos(req.usuario.empresa_id), resumo: cad.resumoCadernos(req.usuario.empresa_id) }));
router.post('/cadernos', exigePerfil(...GESTAO), (req, res) => { try { res.json(cad.salvarCaderno(req.usuario.empresa_id, req.body || {})); } catch (e) { res.status(400).json({ erro: e.message }); } });
router.delete('/cadernos/:id', exigePerfil(...GESTAO), (req, res) => { try { res.json(cad.removerCaderno(req.usuario.empresa_id, req.params.id)); } catch (e) { res.status(400).json({ erro: e.message }); } });
router.post('/cadernos/:id/exec', (req, res) => { try { res.json(cad.registrarExec(req.usuario.empresa_id, { caderno_id: req.params.id, ...(req.body || {}) }, req.usuario)); } catch (e) { res.status(400).json({ erro: e.message }); } });
router.get('/cadernos/:id/execs', (req, res) => res.json({ execs: cad.execsDoCaderno(req.usuario.empresa_id, req.params.id) }));
router.post('/pesquisa/planilha', async (req, res) => {
  try {
    const buf = await pq.gerarPlanilha(req.usuario.empresa_id, { produtoIds: (req.body && req.body.produtoIds) || [], filialRef: (req.body && req.body.filialRef) || 'entrerios' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="PRODUTOS_PESQUISA_PRECO.xlsx"');
    res.send(buf);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});
router.get('/pesquisa/filiais', (req, res) => res.json({ filiais: pq.FILIAIS }));
// Fase 3: cruzamento do retorno da empresa (xlsx base64) × preço atual do Alpha.
router.post('/pesquisa/cruzar', async (req, res) => {
  try { res.json(await pq.cruzar(req.usuario.empresa_id, { base64: (req.body && req.body.base64) || '', filialRef: (req.body && req.body.filialRef) || 'entrerios' })); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

module.exports = router;
