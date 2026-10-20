// tesouraria.js — Módulo Tesouraria: quebras de caixa (cobrança do operador) + indicadores do setor.
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const { lojasEmpresa } = require('../lib/escopoCompras');
const t = require('../lib/tesourariaErp');
const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const fsNode = require('fs');
const pathNode = require('path');
const { erpQuery } = require('../db/erp');

// Chefe de tesouraria + gestão (veem tudo, todas as lojas). O GERENTE também acessa, mas SÓ a parte
// de anexar depósitos/despesas e SÓ as lojas configuradas pra ele (colaborador_lojas). Os indicadores
// e quebras de caixa continuam só da gestão (middleware soGestao nas rotas de análise).
const GESTAO_TES = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Tesouraria', 'Supervisor', 'Financeiro'];
const ACESSO_ANEXO = [...GESTAO_TES, 'Gerente', 'Subgerente'];
router.use(auth);
router.use(exigePerfil(...ACESSO_ANEXO));
// cache de ERP por rota (aplicado DEPOIS do soGestao, pra não vazar dado de gestão em cache hit).
// invalidação router-wide: qualquer escrita limpa o cache 'tes:'.
const { cacheMiddleware: _tesCacheMw, invalidarMiddleware: _tesInvMw } = require('../lib/erpCache');
const tesCache = _tesCacheMw('tes');
router.use(_tesInvMw('tes:'));
const soGestao = exigePerfil(...GESTAO_TES); // bloqueia gerente nas telas de indicador/quebra

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDoMes = () => hoje().slice(0, 8) + '01';

// lojas que ESTE usuário pode operar na Tesouraria: gestão = todas; gerente = só as configuradas.
function lojasDoUsuario(req) {
  const todas = lojasEmpresa(req.usuario.empresa_id);
  if (GESTAO_TES.includes(req.usuario.funcao_nome) || req.usuario.lideranca) return todas;
  const ids = new Set(db.prepare('SELECT loja_id FROM colaborador_lojas WHERE colaborador_id=?').all(req.usuario.id).map(r => r.loja_id));
  if (req.usuario.loja_id) ids.add(req.usuario.loja_id);
  return todas.filter(l => ids.has(l.id));
}
function podeLoja(req, lojaId) { return !!lojaId && lojasDoUsuario(req).some(l => l.id === lojaId); }

router.get('/lojas', (req, res) => res.json({ lojas: lojasDoUsuario(req) }));

router.get('/config', soGestao, (req, res) => res.json(t.getConfig(req.usuario.empresa_id)));
router.post('/config', soGestao, (req, res) => res.json(t.setConfig(req.usuario.empresa_id, { limiar: req.body.limiar, pontosTopOperador: req.body.pontosTopOperador, pontosDescontoQuebra: req.body.pontosDescontoQuebra, pontosCaixaZerado: req.body.pontosCaixaZerado, escalaNotaCaixa: req.body.escalaNotaCaixa })));

// Débitos do operador (quebras cobradas em aberto) — "contas a receber do funcionário".
router.get('/debitos', soGestao, (req, res) => res.json(t.debitosOperador(req.usuario.empresa_id, { lojaId: req.query.loja || null, incluirPagos: req.query.incluirPagos === '1' })));
router.post('/debitos/:id/pagar', soGestao, (req, res) => res.json(t.marcarPagoCobranca(req.usuario.empresa_id, req.params.id, { pago: req.body.pago !== false, usuarioId: req.usuario.id })));

// Cupons baixados por operador de caixa (avaliação de atendimento). Filtro por filial ou todas.
router.get('/cupons-operador', soGestao, tesCache, async (req, res) => {
  try {
    const { ini = primeiroDoMes(), fim = hoje(), loja } = req.query;
    res.json(await t.cuponsPorOperador(req.usuario.empresa_id, { ini, fim, lojaId: loja || null }));
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// Premia o operador que mais atendeu no mês (idempotente por ano-mês).
router.post('/cupons-operador/premiar', soGestao, async (req, res) => {
  try {
    const { ano, mes, loja } = req.body || {};
    res.json(await t.premiarTopOperador(req.usuario.empresa_id, { ano, mes, lojaId: loja || null, usuarioId: req.usuario.id }));
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// Quebras de caixa (sobra/falta) do período
router.get('/quebras', soGestao, tesCache, async (req, res) => {
  try {
    const { ini = primeiroDoMes(), fim = hoje(), loja } = req.query;
    res.json(await t.quebras(req.usuario.empresa_id, { ini, fim, lojaId: loja || null }));
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// Marca decisão de cobrança de uma quebra (cobrado/perdoado/pontuado/pendente)
router.post('/quebras/cobranca', soGestao, async (req, res) => {
  const { quebra, status, valorCobrado, observacao } = req.body || {};
  if (!quebra || !quebra.id) return res.status(400).json({ erro: 'Quebra inválida.' });
  const st = ['pendente', 'cobrado', 'perdoado', 'pontuado'].includes(status) ? status : 'pendente';
  const r = t.marcarCobranca(req.usuario.empresa_id, quebra, { status: st, valorCobrado, observacao, usuarioId: req.usuario.id });
  let pontos = null;
  try { pontos = await t.aplicarPontosQuebra(req.usuario.empresa_id, quebra, st, req.usuario.id); } catch (e) { pontos = { erro: e.message }; }
  res.json({ ...r, pontos });
});

// Indicadores do setor (cancelamentos, estornos, conciliação no prazo)
router.get('/indicadores', soGestao, tesCache, async (req, res) => {
  try {
    const { ini = primeiroDoMes(), fim = hoje(), loja } = req.query;
    res.json(await t.indicadoresSetor(req.usuario.empresa_id, { ini, fim, lojaId: loja || null }));
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// Cancelamentos × ponto (quem cancelou estava dentro do horário de trabalho?)
router.get('/cancelamentos', soGestao, tesCache, async (req, res) => {
  try {
    const { ini = primeiroDoMes(), fim = hoje(), loja } = req.query;
    res.json(await t.cancelamentos(req.usuario.empresa_id, { ini, fim, lojaId: loja || null }));
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// Cruzamento: sessões de caixa do dia (ERP) × operadores informados pelo gerente (checklist/lançamentos)
router.get('/sessoes', soGestao, tesCache, async (req, res) => {
  try {
    const { data = hoje(), loja } = req.query;
    res.json(await t.conferenciaCaixa(req.usuario.empresa_id, { data, lojaId: loja || null }));
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// ===== FECHAMENTO DO CAIXA DO DIA: anexos de depósitos e despesas =====
// Situação do dia: caixas (sessões) abertos/fechados da loja + se já tem depósito anexado.
router.get('/dia', tesCache, async (req, res) => {
  try {
    const data = req.query.data || hoje();
    const loja = req.query.loja;
    const r = await t.sessoesDia(req.usuario.empresa_id, { data, lojaId: loja });
    const sessoes = r.sessoes || [];
    const fechados = sessoes.filter(s => s.fechado).length;
    const anexos = db.prepare(`SELECT SUM(CASE WHEN tipo='deposito' THEN 1 ELSE 0 END) dep, SUM(CASE WHEN tipo='despesa' THEN 1 ELSE 0 END) desp, SUM(CASE WHEN tipo='recarga' THEN 1 ELSE 0 END) rec FROM tesouraria_anexo WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, loja || '', data);
    res.json({ data, sessoes, total_caixas: sessoes.length, fechados, todos_fechados: sessoes.length > 0 && fechados === sessoes.length,
      n_depositos: anexos ? (anexos.dep || 0) : 0, n_despesas: anexos ? (anexos.desp || 0) : 0, n_recargas: anexos ? (anexos.rec || 0) : 0 });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o fechamento do dia.', detalhe: String(e.message || e) }); }
});

// OCR do comprovante (foto/PDF) → lê o valor (e fornecedor) pra preencher na hora.
router.post('/ler-valor', async (req, res) => {
  const b = req.body || {};
  if (!b.dados) return res.status(400).json({ erro: 'Envie o arquivo.' });
  try {
    const lerNf = require('../lib/lerNf');
    const r = await lerNf.ocrComprovanteAny(b.dados, b.tipo_mime);
    if (!r) return res.json({ ok: false, aviso: 'Não consegui ler (sem OCR disponível ou imagem ruim).' });
    res.json({ ok: true, ...r });
  } catch (e) { res.status(503).json({ erro: 'Erro ao ler o comprovante.', detalhe: String(e.message || e) }); }
});

// Planos de contas de DESPESA do ERP (código começa com "2.") — p/ o datalist da despesa.
router.get('/planos', async (req, res) => {
  try { res.json({ planos: await erpQuery(`SELECT id, nome FROM planocontas WHERE nome IS NOT NULL AND nome ~ '^2\\.' ORDER BY nome LIMIT 1000`) }); }
  catch (e) { res.json({ planos: [] }); }
});

// Lista os anexos do dia (sem o base64, só metadados).
router.get('/anexos', (req, res) => {
  const rows = db.prepare(`SELECT id, loja_id, data, tipo, descricao, valor, plano_contas, nome, tipo_mime, origem, arquivo_salvo, fiscal, tipo_doc, criado_em FROM tesouraria_anexo
    WHERE empresa_id=? AND loja_id=? AND data=? ORDER BY tipo, criado_em DESC`).all(req.usuario.empresa_id, req.query.loja || '', req.query.data || hoje());
  const total = { deposito: 0, despesa: 0 };
  rows.forEach(r => { total[r.tipo] = (total[r.tipo] || 0) + (Number(r.valor) || 0); });
  res.json({ anexos: rows, total });
});
router.get('/anexo/:id', (req, res) => {
  const a = db.prepare(`SELECT nome, tipo_mime AS tipo, dados FROM tesouraria_anexo WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a || !a.dados) return res.status(404).json({ erro: 'Sem anexo.' });
  res.json(a);
});
router.post('/anexos', (req, res) => {
  const b = req.body || {};
  if (!b.loja_id || !b.data || !b.tipo) return res.status(400).json({ erro: 'Loja, data e tipo são obrigatórios.' });
  if (!podeLoja(req, b.loja_id)) return res.status(403).json({ erro: 'Você não tem acesso a essa loja.' });
  if (!['deposito', 'despesa', 'recarga'].includes(b.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (!b.dados) return res.status(400).json({ erro: 'Anexe o arquivo/foto.' });
  // Não permite 2º anexo do mesmo tipo na mesma data/loja (a não ser que exclua o anterior).
  const ROT = { deposito: 'depósito', despesa: 'despesa', recarga: 'recarga' };
  const ja = db.prepare(`SELECT 1 FROM tesouraria_anexo WHERE empresa_id=? AND loja_id=? AND data=? AND tipo=? LIMIT 1`).get(req.usuario.empresa_id, b.loja_id, b.data, b.tipo);
  if (ja) return res.status(409).json({ erro: `Já existe ${ROT[b.tipo]} anexado para esta loja em ${String(b.data).split('-').reverse().join('/')}. Exclua o anterior para anexar outro.` });
  const id = uuidv4();
  // Salva organizado em <ano>/<mês>/<loja>/ — despesa→pasta do Orçamento; depósito/recarga→Controle de Caixa.
  const buf = base64ParaBuffer(b.dados);
  const salvo = salvarOrganizado(baseDe(req.usuario.empresa_id, b.tipo), lojaNomeDe(req.usuario.empresa_id, b.loja_id), b.data, b.nome || (b.tipo + '.jpg'), buf);
  db.prepare(`INSERT INTO tesouraria_anexo (id,empresa_id,loja_id,data,tipo,descricao,valor,plano_contas,nome,tipo_mime,dados,origem,criado_por,arquivo_salvo,fiscal,tipo_doc)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.usuario.empresa_id, b.loja_id, b.data, b.tipo, b.descricao || null, b.valor != null ? Number(b.valor) : null, b.plano_contas || null,
      b.nome || 'anexo', b.tipo_mime || null, String(b.dados).slice(0, 8000000), b.origem || 'anexo', req.usuario.id, salvo,
      (b.fiscal == null ? null : (b.fiscal ? 1 : 0)), b.tipo_doc || null);
  res.status(201).json({ id, mensagem: salvo ? 'Anexado e salvo na pasta.' : 'Anexado.', arquivo_salvo: salvo });
});
router.delete('/anexos/:id', (req, res) => {
  db.prepare(`DELETE FROM tesouraria_anexo WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Pasta da nuvem (OneDrive sincronizado) de onde o gerente sobe as fotos de despesa.
function cfgGet(emp, chave) { const r = db.prepare(`SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave=?`).get(emp, chave); return r ? r.valor : null; }
function cfgSet(emp, chave, valor) { db.prepare(`INSERT INTO tesouraria_config (empresa_id,chave,valor) VALUES (?,?,?) ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(emp, chave, String(valor || '')); }
router.get('/pasta-config', (req, res) => res.json({
  base: cfgGet(req.usuario.empresa_id, 'despesa_pasta_base') || '',
  salvarBase: cfgGet(req.usuario.empresa_id, 'despesa_salvar_base') || '',
  depositoBase: cfgGet(req.usuario.empresa_id, 'deposito_salvar_base') || '',
}));
router.put('/pasta-config', soGestao, (req, res) => {
  if (req.body.base !== undefined) cfgSet(req.usuario.empresa_id, 'despesa_pasta_base', req.body.base);
  if (req.body.salvarBase !== undefined) cfgSet(req.usuario.empresa_id, 'despesa_salvar_base', req.body.salvarBase);
  if (req.body.depositoBase !== undefined) cfgSet(req.usuario.empresa_id, 'deposito_salvar_base', req.body.depositoBase);
  res.json({ ok: true });
});

// Salva a despesa ORGANIZADA em <base>/<ano>/<loja>/<N - Mês>/ (reutiliza pastas que já existem).
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
function subdir(parent, exato, matchFn) {
  let itens = []; try { itens = fsNode.readdirSync(parent, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { /* cria abaixo */ }
  const hit = itens.find(matchFn);
  const full = pathNode.join(parent, hit || exato);
  try { fsNode.mkdirSync(full, { recursive: true }); } catch { /* ok */ }
  return full;
}
function lojaKey(nome) { return String(nome || '').toLowerCase().replace(/^(mutti|ultra)\s*-?\s*/i, '').replace(/[^a-zà-ú0-9]+/gi, ' ').trim(); }
// Salva o arquivo em <base>/<ano>/<N - Mês>/<loja>/ (reutiliza pastas que já existem).
function salvarOrganizado(base, lojaNome, dataStr, nomeArq, buffer) {
  if (!base || !buffer) return null;
  try { if (!fsNode.existsSync(base)) return null; } catch { return null; }
  const [ano, mesN] = [dataStr.slice(0, 4), parseInt(dataStr.slice(5, 7), 10)];
  const mesNome = MESES[mesN - 1] || String(mesN);
  const anoDir = subdir(base, ano, n => n === ano);
  const mesDir = subdir(anoDir, `${mesN} - ${mesNome}`, n => n.startsWith(mesN + ' ') || n.replace(/\s/g, '').startsWith(mesN + '-') || n.toLowerCase().includes(mesNome.toLowerCase()));
  const key = lojaKey(lojaNome);
  const lojaDir = subdir(mesDir, lojaNome, n => key && lojaKey(n).includes(key));
  let destino = pathNode.join(lojaDir, nomeArq);
  if (fsNode.existsSync(destino)) { const e = pathNode.extname(nomeArq); destino = pathNode.join(lojaDir, pathNode.basename(nomeArq, e) + '_' + Date.now() + e); }
  try { fsNode.writeFileSync(destino, buffer); return destino; } catch { return null; }
}
// Pasta de destino conforme o tipo: despesa→orçamento; depósito/recarga→controle de caixa.
function baseDe(emp, tipo) { return cfgGet(emp, tipo === 'despesa' ? 'despesa_salvar_base' : 'deposito_salvar_base'); }
function lojaNomeDe(emp, lojaId) { const l = lojasEmpresa(emp).find(x => x.id === lojaId); return l ? l.nome : lojaId; }
function base64ParaBuffer(dados) { const b64 = String(dados || '').replace(/^data:[^;]+;base64,/, ''); try { return Buffer.from(b64, 'base64'); } catch { return null; } }
// Lista imagens/PDFs da pasta (recursivo, até 200) p/ o gerente/tesouraria escolher e importar.
router.get('/pasta/listar', (req, res) => {
  const base = cfgGet(req.usuario.empresa_id, 'despesa_pasta_base');
  if (!base) return res.status(400).json({ erro: 'Configure a pasta primeiro.' });
  const raiz = pathNode.join(base, req.query.sub || '');
  const out = [];
  const anda = (d) => { let it = []; try { it = fsNode.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const i of it) { if (out.length >= 200) return; const p = pathNode.join(d, i.name); if (i.isDirectory()) anda(p); else if (/\.(pdf|jpe?g|png|webp|heic)$/i.test(i.name)) { let st; try { st = fsNode.statSync(p); } catch { st = null; } out.push({ caminho: p, arquivo: i.name, pasta: pathNode.relative(base, pathNode.dirname(p)), tamanho: st ? st.size : 0, mtime: st ? Math.floor(st.mtimeMs) : 0 }); } } };
  try { anda(raiz); } catch { return res.status(400).json({ erro: 'Pasta inválida.' }); }
  out.sort((a, b) => b.mtime - a.mtime);
  res.json({ base, total: out.length, arquivos: out });
});
// Importa um arquivo da pasta → salva como anexo de despesa (ou depósito) do dia.
router.post('/pasta/importar', (req, res) => {
  const b = req.body || {};
  const base = cfgGet(req.usuario.empresa_id, 'despesa_pasta_base');
  if (!base || !b.caminho || !b.loja_id || !b.data) return res.status(400).json({ erro: 'Dados incompletos.' });
  if (!podeLoja(req, b.loja_id)) return res.status(403).json({ erro: 'Você não tem acesso a essa loja.' });
  if (!pathNode.resolve(b.caminho).startsWith(pathNode.resolve(base))) return res.status(400).json({ erro: 'Arquivo fora da pasta configurada.' });
  let buf; try { buf = fsNode.readFileSync(b.caminho); } catch { return res.status(400).json({ erro: 'Não foi possível ler o arquivo.' }); }
  const ext = pathNode.extname(b.caminho).toLowerCase();
  const mime = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const id = uuidv4();
  const tipo = b.tipo === 'deposito' ? 'deposito' : b.tipo === 'recarga' ? 'recarga' : 'despesa';
  const jaImp = db.prepare(`SELECT 1 FROM tesouraria_anexo WHERE empresa_id=? AND loja_id=? AND data=? AND tipo=? LIMIT 1`).get(req.usuario.empresa_id, b.loja_id, b.data, tipo);
  if (jaImp) return res.status(409).json({ erro: `Já existe ${tipo} anexado para esta loja nessa data. Exclua o anterior para anexar outro.` });
  const salvo = salvarOrganizado(baseDe(req.usuario.empresa_id, tipo), lojaNomeDe(req.usuario.empresa_id, b.loja_id), b.data, pathNode.basename(b.caminho), buf);
  db.prepare(`INSERT INTO tesouraria_anexo (id,empresa_id,loja_id,data,tipo,descricao,valor,plano_contas,nome,tipo_mime,dados,origem,criado_por,arquivo_salvo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pasta', ?, ?)`)
    .run(id, req.usuario.empresa_id, b.loja_id, b.data, tipo, b.descricao || pathNode.basename(b.caminho),
      b.valor != null ? Number(b.valor) : null, b.plano_contas || null, pathNode.basename(b.caminho), mime, (`data:${mime};base64,` + buf.toString('base64')).slice(0, 8000000), req.usuario.id, salvo);
  res.status(201).json({ id, mensagem: salvo ? 'Importado e salvo na pasta.' : 'Importado da pasta.', arquivo_salvo: salvo });
});

module.exports = router;
