// conciliacaoCartao.js — Conciliação de Cartões: sobe o relatório da operadora, confronta com o ERP
// e devolve as divergências (forma de pagamento, parcelamento, valor) + o BI de erros por operador.
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const { lojasEmpresa } = require('../lib/escopoCompras');
const cc = require('../lib/conciliacaoCartao');
const rp = require('../lib/repasseCartao');
const { wrapCache, invalidar } = require('../lib/erpCache');

const GESTAO_CONC = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Tesouraria', 'Financeiro', 'Contabilidade'];
router.use(auth);
router.use(exigePerfil(...GESTAO_CONC));
// qualquer escrita (import de relatório, correção, remanejo, ajustes, repasses…) invalida o cache
// da Conciliação, pra o painel refletir na hora o que acabou de mudar.
router.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) { try { invalidar(req.usuario.empresa_id, 'cc-'); } catch (e) { /* ignore */ } } });
  next();
});

const wrap = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(502).json({ erro: e.message }); } };
// período padrão: mês corrente
const hoje = () => new Date().toISOString().slice(0, 10);
const periodo = req => ({
  ini: req.query.ini || hoje().slice(0, 8) + '01',
  fim: req.query.fim || hoje(),
  lojaId: req.query.loja || null,
  conferirTaxa: req.query.taxa === '1',
  grupo: req.query.grupo || null,   // forma de pagamento (DEBITO, CREDITO, PIX...) — filtro opcional
});

router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));

// BI do período: o que ainda está errado + o que já foi corrigido no ERP
router.get('/painel', wrapCache('cc-painel')(req => cc.painel(req.usuario.empresa_id, periodo(req))));
// divergências dos relatórios importados no período
router.get('/divergencias', wrapCache('cc-divergencias')(req => cc.confrontarPeriodo(req.usuario.empresa_id, { ...periodo(req), operadora: req.query.operadora || null })));
// confronto usando os arquivos que o próprio ERP já importa (não depende de upload)
router.get('/edi', wrapCache('cc-edi')(req => cc.edi(req.usuario.empresa_id, periodo(req))));
// toda venda de cartão do ERP sem nenhum cruzamento de relatório ainda (manual ou EDI automático)
router.get('/pendentes', wrapCache('cc-pendentes')(req => cc.pendentesPorOperadora(req.usuario.empresa_id, periodo(req))));
// vendas de cartão cuja modalidade não bate em nenhuma operadora conhecida (falta mapear em Ajustes)
router.get('/sem-operadora', wrapCache('cc-sem-operadora')(req => cc.semOperadoraIdentificada(req.usuario.empresa_id, periodo(req))));

router.get('/taxas', wrapCache('cc-taxas')(req => cc.taxasCobradas(req.usuario.empresa_id, { ...periodo(req), lojaId: req.query.loja || null })));

router.get('/recebimentos-futuros', wrapCache('cc-receb-fut')(req => cc.recebimentosFuturos(req.usuario.empresa_id, { lojaId: req.query.loja || null, dias: req.query.dias, ini: req.query.rini || null, fim: req.query.rfim || null })));
router.get('/recebimentos-futuros/itens', wrapCache('cc-receb-fut-itens')(req => cc.recebimentosFuturosItens(req.usuario.empresa_id, { lojaId: req.query.loja || null, dias: req.query.dias, ini: req.query.rini || null, fim: req.query.rfim || null })));

router.get('/custo-maquinas', wrapCache('cc-custo-maq')(req => cc.custoMaquinas(req.usuario.empresa_id, { ...periodo(req), lojaId: req.query.loja || null })));

// BI: taxa combinada (cadastro) × taxa praticada (ERP) — quanto a credenciadora cobrou a mais
router.get('/bi-taxa', wrapCache('cc-bi-taxa')(req => cc.biTaxaCombinada(req.usuario.empresa_id, { ...periodo(req), lojaId: req.query.loja || null })));
// contratos de negociação (anexo + validade) por operadora/loja
router.get('/repasses/contratos', wrap(req => ({ ok: true, contratos: rp.contratosTaxa(req.usuario.empresa_id) })));
router.post('/repasses/contrato', wrap(req => rp.salvarContratoTaxa(req.usuario.empresa_id, { ...req.body, usuarioId: req.usuario.id })));
router.post('/repasses/contrato/excluir', wrap(req => rp.excluirContratoTaxa(req.usuario.empresa_id, req.body)));
router.get('/repasses/contrato/arquivo', (req, res) => {
  try {
    const c = rp.getContratoTaxa(req.usuario.empresa_id, { operadora: req.query.operadora, lojaId: req.query.loja || '*' });
    if (!c || !c.dados) return res.status(404).json({ erro: 'Sem arquivo anexado.' });
    const buf = Buffer.from(c.dados, 'base64');
    res.setHeader('Content-Type', c.tipo_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(c.nome || 'contrato').replace(/[^\w.\-]/g, '_')}"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});
// histórico de correções feitas no ERP
router.get('/correcoes', wrapCache('cc-correcoes')(req => cc.correcoes(req.usuario.empresa_id, periodo(req))));

// lotes importados
router.get('/lotes', wrap(req => ({ ok: true, lotes: cc.lotes(req.usuario.empresa_id) })));
router.get('/lotes/:id', wrap(req => cc.confrontarArquivo(req.usuario.empresa_id, Number(req.params.id), { conferirTaxa: req.query.taxa === '1' })));
router.delete('/lotes/:id', wrap(req => cc.apagarLote(req.usuario.empresa_id, Number(req.params.id))));

// upload do relatório (base64) — a loja só é necessária quando o arquivo não traz o CNPJ
router.post('/importar', wrap(req => cc.importar(req.usuario.empresa_id, {
  conteudoBase64: req.body.conteudo, nomeArquivo: req.body.nome,
  lojaId: req.body.loja || null, usuarioId: req.usuario.id,
})));

// de-para "loja como a operadora escreve no arquivo" → loja do ERP (Le Card mistura lojas num só arquivo)
router.get('/lojas-texto', wrap(req => ({ ok: true, lojas: cc.lojasTexto(req.usuario.empresa_id) })));
router.post('/lojas-texto', wrap(req => cc.salvarLojaTexto(req.usuario.empresa_id, req.body)));

// tratativa da divergência (o que a Tesouraria fez com ela)
router.post('/tratativa', wrap(req => cc.marcarTratativa(req.usuario.empresa_id, { ...req.body, usuarioId: req.usuario.id })));
// remaneja a transação para a loja certa (maquininha numa loja, venda lançada em outra)
router.post('/remanejar', wrap(req => cc.remanejarLoja(req.usuario.empresa_id, { ...req.body, usuarioId: req.usuario.id })));

// ajustes: de-para modalidade→grupo e operadora→modalidades
router.get('/ajustes', wrap(async req => {
  const emp = req.usuario.empresa_id;
  const modalidades = await cc.depara(emp);
  const operadoras = {};
  for (const op of ['Rede', 'Cielo', 'GetNet', 'Stone', 'Brasil Card', 'Le Card', 'Nutricash', 'Bracov', 'Alelo', 'Banese / Mulvi', 'Multi Mais / Uze']) {
    operadoras[op] = await cc.deparaOperadora(emp, op);
  }
  return { ok: true, modalidades, operadoras, grupos: cc.GRUPOS, rotulos: cc.ROTULO_GRUPO };
}));
router.post('/ajustes/modalidades', wrap(req => cc.salvarDepara(req.usuario.empresa_id, req.body.itens || [])));
router.post('/ajustes/operadora', wrap(req => cc.salvarDeparaOperadora(req.usuario.empresa_id, req.body.operadora, req.body.modalidades || [])));

// ── Repasses: o que a credenciadora pagou (trilha do dinheiro) ─────────────
router.get('/repasses', wrapCache('cc-repasses')(req => rp.conferir(req.usuario.empresa_id, periodo(req))));
router.get('/repasses/vencimentos', wrapCache('cc-repasses-venc')(req => rp.conferirVencimentos(req.usuario.empresa_id, { ...periodo(req), apenasDivergentes: req.query.todos !== '1' })));
router.get('/repasses/lotes', wrap(req => ({ ok: true, lotes: rp.lotes(req.usuario.empresa_id) })));
router.get('/repasses/deposito/:id', wrap(req => rp.detalheDeposito(req.usuario.empresa_id, Number(req.params.id))));
router.delete('/repasses/lotes/:id', wrap(req => rp.apagarLote(req.usuario.empresa_id, Number(req.params.id))));
router.post('/repasses/importar', wrap(req => rp.importar(req.usuario.empresa_id, {
  conteudoBase64: req.body.conteudo, nomeArquivo: req.body.nome, usuarioId: req.usuario.id,
  lojaId: req.body.loja || null,
})));
router.post('/repasses/conferencia', wrap(req => rp.marcarConferencia(req.usuario.empresa_id, { ...req.body, usuarioId: req.usuario.id })));
// confere de novo contra o extrato bancário do ERP (útil pra período já importado antes dessa função existir)
router.post('/repasses/auto-conferir', wrap(req => rp.autoConferirLotes(req.usuario.empresa_id, periodo(req))));

// taxas combinadas e de-para de estabelecimento (usados na aba Ajustes)
router.get('/repasses/config', wrap(req => ({ ok: true,
  taxas: rp.taxasContratadas(req.usuario.empresa_id),
  estabelecimentos: rp.estabelecimentos(req.usuario.empresa_id),
  lojas: lojasEmpresa(req.usuario.empresa_id),
  // credenciadoras e as bandeiras que REALMENTE aparecem nos arquivos dela
  credenciadoras: rp.credenciadoras(req.usuario.empresa_id) })));
router.post('/repasses/taxa', wrap(req => rp.salvarTaxa(req.usuario.empresa_id, req.body)));
router.post('/repasses/taxa/excluir', wrap(req => rp.excluirTaxa(req.usuario.empresa_id, req.body)));
router.post('/repasses/taxa/replicar', wrap(req => rp.replicarTaxas(req.usuario.empresa_id, req.body)));
router.get('/repasses/taxas-erp', wrap(req => rp.taxasDoErp(req.usuario.empresa_id)));

// Valida os depósitos de repasse contra o banco (extratobancario do Alpha): "caiu o lote?".
router.get('/repasses/conferir-banco', wrap(req => rp.conferirNoBanco(req.usuario.empresa_id, { ...periodo(req), lojaId: req.query.loja || null })));
// Validação humana de um lote que não cruzou com o banco (confirmar que caiu / ignorar / reabrir)
router.post('/repasses/banco-tratativa', wrap(req => rp.tratarLoteBanco(req.usuario.empresa_id, { ...req.body, usuarioId: req.usuario.id })));
// Regra por operadora: factoring/antecipação que não cai no banco → ignora sozinho
router.get('/repasses/banco-regras', wrap(req => ({ ok: true, regras: rp.regrasBancoOperadora(req.usuario.empresa_id) })));
router.post('/repasses/banco-regra', wrap(req => rp.salvarRegraBancoOperadora(req.usuario.empresa_id, { ...req.body, usuarioId: req.usuario.id })));
router.post('/repasses/taxas-erp/importar', wrap(req => rp.importarTaxasDoErp(req.usuario.empresa_id)));
router.post('/repasses/estabelecimento', wrap(req => rp.salvarEstabelecimento(req.usuario.empresa_id, req.body)));

module.exports = router;
