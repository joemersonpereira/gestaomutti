// compras.js — Painel de Compras (comprador/comercial). Fase 1: vínculo comprador↔grupos.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { listarGruposCompra, listarClassificacoes, transferenciasPendentes, itensTransferencia } = require('../lib/comprasErp');
const { termometroFornecedores, compraAnoCorrente, FAIXA_VISITA, divergenciasFornecedor } = require('../lib/fornecedorErp');
const { eficienciaCompradores, capturarSnapshot } = require('../lib/eficienciaCompradorErp');
const { orcamentoCompra, getConfig, salvarConfig } = require('../lib/orcamentoErp');
const { sincronizarAlertas, itensAlerta } = require('../lib/alertasCompra');
const { getMetas, setMeta, metaVals } = require('../lib/metasCompra');
const { indicadoresEstoque } = require('../lib/indicadoresCompraErp');
const { evolucaoEstoque } = require('../lib/estoqueEvolucaoErp');
const { lojasEmpresa, unisEmpresa } = require('../lib/escopoCompras');
const { faltasComprador } = require('../lib/faltasCompra');
const { analiseVencidos, clientesProduto } = require('../lib/vencidosErp');
const _ultimoSync = {}; // empresa_id -> timestamp (throttle do sync de alertas)

const GESTAO_COMPRAS = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria'];
const anoAtual = () => new Date().getFullYear();
router.use(auth);

// Lojas da empresa (para os filtros do painel).
router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));

// Grupos de compra disponíveis no ERP.
router.get('/grupos-erp', async (req, res) => {
  try { res.json({ grupos: await listarGruposCompra() }); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Classificações do ERP (árvore PRINCIPAL) — vínculo por classificação (principal/individual).
router.get('/classificacoes-erp', async (req, res) => {
  try { res.json({ classificacoes: await listarClassificacoes() }); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Compradores (colaboradores cuja função começa com "Comprador") + os grupos de cada.
router.get('/compradores', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT c.id, c.nome, f.nome funcao FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.nome LIKE 'Comprador%' ORDER BY c.nome`).all(emp);
  const stmt = db.prepare(`SELECT grupocompra_id, grupo_nome, tipo FROM comprador_grupos WHERE empresa_id=? AND comprador_id=? ORDER BY grupo_nome`);
  res.json({ compradores: rows.map(c => ({ ...c, grupos: stmt.all(emp, c.id) })) });
});

// Define os grupos de um comprador (substitui a lista inteira). Só gestão de compras.
router.put('/compradores/:id/grupos', exigePerfil(...GESTAO_COMPRAS), (req, res) => {
  const emp = req.usuario.empresa_id;
  const c = db.prepare('SELECT id FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!c) return res.status(404).json({ erro: 'Comprador não encontrado.' });
  const grupos = Array.isArray(req.body.grupos) ? req.body.grupos : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM comprador_grupos WHERE empresa_id=? AND comprador_id=?').run(emp, c.id);
    const ins = db.prepare(`INSERT OR IGNORE INTO comprador_grupos (id,empresa_id,comprador_id,grupocompra_id,grupo_nome,tipo,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`);
    grupos.forEach(g => { if (g && g.id != null) ins.run(uuidv4(), emp, c.id, Number(g.id), (g.nome || '').toString().slice(0, 200) || null, ['classificacao', 'laboratorio', 'fornecedor'].includes(g.tipo) ? g.tipo : 'grupo'); });
  });
  tx();
  res.json({ ok: true });
});

// ── Termômetro do Fornecedor ────────────────────────────────────────────
router.get('/fornecedores/termometro', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const dados = await termometroFornecedores({ busca: req.query.busca || '', limite: Number(req.query.limite) || 300, metas: metaVals(emp) });
    // Anexa a última visita e a próxima agendada (do sqlite local) a cada fornecedor.
    const ult = db.prepare(`SELECT fornecedor_id, MAX(data_visita) d FROM fornecedor_visitas WHERE empresa_id=? AND status='realizada' GROUP BY fornecedor_id`).all(emp);
    const prox = db.prepare(`SELECT fornecedor_id, MIN(data_visita) d FROM fornecedor_visitas WHERE empresa_id=? AND status='agendada' AND data_visita IS NOT NULL GROUP BY fornecedor_id`).all(emp);
    const mU = new Map(ult.map(r => [r.fornecedor_id, r.d])), mP = new Map(prox.map(r => [r.fornecedor_id, r.d]));
    dados.fornecedores.forEach(f => { f.ultimaVisita = mU.get(f.id) || null; f.proximaVisita = mP.get(f.id) || null; });
    res.json(dados);
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Divergência NF × pedido de um fornecedor (sobra/falta + diferença de preço) — drill do termômetro.
router.get('/fornecedores/:id/divergencias', async (req, res) => {
  try { res.json(await divergenciasFornecedor({ fornecedorId: Number(req.params.id), dias: Number(req.query.dias) || 90 })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Eficiência por comprador (compras, NF sem pedido, divergência, ruptura, conversão…).
router.get('/eficiencia-compradores', async (req, res) => {
  try { res.json(await eficienciaCompradores(req.usuario.empresa_id, { dias: Number(req.query.dias) || 90, de: req.query.de || undefined, ate: req.query.ate || undefined, mes: req.query.mes || undefined })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Captura manual da FOTO dos indicadores do mês corrente (gestão) — p/ montar o histórico agora.
router.post('/eficiencia-compradores/capturar', exigePerfil(...GESTAO_COMPRAS), async (req, res) => {
  try { res.json(await capturarSnapshot(req.usuario.empresa_id)); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Sincroniza gatilhos de visita: cria uma sugestão na faixa atingida (a cada meta visita_faixa YTD).
async function sincronizarVisitas(emp) {
  const lista = await compraAnoCorrente();
  const ano = anoAtual();
  const faixaValor = getMetas(emp).visita_faixa.usado || FAIXA_VISITA;
  const existe = db.prepare(`SELECT 1 FROM fornecedor_visitas WHERE empresa_id=? AND fornecedor_id=? AND gatilho_ano=? AND gatilho_faixa=? AND origem='gatilho'`);
  const ins = db.prepare(`INSERT OR IGNORE INTO fornecedor_visitas
    (id,empresa_id,fornecedor_id,fornecedor_nome,status,origem,gatilho_ano,gatilho_faixa,compra_acumulada,criado_em)
    VALUES (?,?,?,?,'sugerida','gatilho',?,?,?,datetime('now'))`);
  let criadas = 0;
  const tx = db.transaction(() => {
    for (const f of lista) {
      const faixa = Math.floor(f.ytd / faixaValor);
      if (faixa < 1) continue;
      if (!existe.get(emp, f.id, ano, faixa)) { ins.run(uuidv4(), emp, f.id, f.nome, ano, faixa, f.ytd); criadas++; }
    }
  });
  tx();
  return criadas;
}

// ── Alertas → tarefas automáticas ───────────────────────────────────────
router.get('/alertas', async (req, res) => {
  const emp = req.usuario.empresa_id;
  // Sincroniza no máx. 1x/hora ao abrir a tela (o resto é sob demanda pelo botão).
  const agora = Date.now();
  if (!_ultimoSync[emp] || agora - _ultimoSync[emp] > 3600000) {
    _ultimoSync[emp] = agora;
    try { await sincronizarAlertas(emp); } catch (_) { /* ERP fora: mostra o já criado */ }
  }
  const rows = db.prepare(`SELECT id, tipo, titulo, descricao, responsavel_id, apoio_id, status, referencia_id, criado_em
    FROM tarefas WHERE empresa_id=? AND origem='compras' ORDER BY criado_em DESC LIMIT 200`).all(emp);
  const nomes = new Map(db.prepare('SELECT id, nome FROM colaboradores WHERE empresa_id=?').all(emp).map(c => [c.id, c.nome]));
  const alertas = rows.map(r => ({ ...r, responsavel: nomes.get(r.responsavel_id) || null, apoio: nomes.get(r.apoio_id) || null,
    categoria: (r.referencia_id || '').split(':')[0] }));
  res.json({ alertas, abertos: alertas.filter(a => a.status !== 'concluido').length });
});

// Itens completos (nome + EAN) de um alerta — p/ a tarefa expandir e mostrar tudo.
router.get('/alertas/itens', (req, res) => {
  res.json({ itens: itensAlerta(req.usuario.empresa_id, req.query.ref || '') });
});

router.post('/alertas/sincronizar', exigePerfil(...GESTAO_COMPRAS), async (req, res) => {
  try {
    _ultimoSync[req.usuario.empresa_id] = Date.now();
    res.json(await sincronizarAlertas(req.usuario.empresa_id));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Faltas da loja × comprador (cobrança) ───────────────────────────────
router.get('/faltas', async (req, res) => {
  try { res.json(await faltasComprador(req.usuario.empresa_id, { lojaId: req.query.loja || undefined, compradorId: req.query.comprador || undefined })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Orçamento de compra ─────────────────────────────────────────────────
router.get('/orcamento', async (req, res) => {
  try {
    const r = await orcamentoCompra(req.usuario.empresa_id, {
      ano: Number(req.query.ano) || undefined, mes: Number(req.query.mes) || undefined,
      lojaId: req.query.loja || undefined, compradorId: req.query.comprador || undefined,
    });
    res.json(r);
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/orcamento/config', (req, res) => res.json({ config: getConfig(req.usuario.empresa_id) }));

// Aprovação do Diretor para o carry (excedente que empurra p/ o mês seguinte). Só Diretor/Gestor.
router.post('/orcamento/carry', exigePerfil('Diretor Geral', 'Gestor Geral'), (req, res) => {
  const emp = req.usuario.empresa_id;
  const ano = parseInt(req.body.ano), mes = parseInt(req.body.mes);
  if (!ano || !mes) return res.status(400).json({ erro: 'Informe ano e mês.' });
  const aprovado = req.body.aprovado !== false;
  db.prepare(`INSERT INTO compras_carry_aprovacao (id,empresa_id,ano,mes,valor,aprovado,observacao,aprovado_por,aprovado_em)
    VALUES (?,?,?,?,?,?,?,?,${aprovado ? "datetime('now')" : 'NULL'})
    ON CONFLICT(empresa_id,ano,mes) DO UPDATE SET valor=excluded.valor, aprovado=excluded.aprovado, observacao=excluded.observacao, aprovado_por=excluded.aprovado_por, aprovado_em=${aprovado ? "datetime('now')" : 'NULL'}`)
    .run(uuidv4(), emp, ano, mes, Number(req.body.valor) || 0, aprovado ? 1 : 0, (req.body.observacao || '').toString().slice(0, 500) || null, aprovado ? req.usuario.id : null);
  res.json({ ok: true });
});

router.put('/orcamento/config', exigePerfil(...GESTAO_COMPRAS), (req, res) => {
  const emp = req.usuario.empresa_id;
  if ('cmv_meta' in req.body) setMeta(emp, 'cmv_meta', req.body.cmv_meta);
  if ('crescimento_meta' in req.body) setMeta(emp, 'crescimento_meta', req.body.crescimento_meta);
  res.json({ ok: true });
});

// ── Metas (sugeridas + editáveis) ───────────────────────────────────────
router.get('/metas', (req, res) => res.json({ metas: getMetas(req.usuario.empresa_id, req.query.comprador || null), comprador: req.query.comprador || null }));

router.put('/metas', exigePerfil(...GESTAO_COMPRAS), (req, res) => {
  const emp = req.usuario.empresa_id;
  const comprador = req.query.comprador || null;   // sem comprador = meta GERAL; com = override do comprador
  const alteradas = [];
  for (const [k, v] of Object.entries(req.body || {})) if (setMeta(emp, k, v, comprador)) alteradas.push(k);
  res.json({ ok: true, alteradas, comprador, metas: getMetas(emp, comprador) });
});

// ── Indicadores de estoque (ruptura, cobertura, curva ABC, orçamento de estoque) ──
router.get('/estoque-indicadores', async (req, res) => {
  try { res.json(await indicadoresEstoque(req.usuario.empresa_id, { lojaId: req.query.loja || undefined, compradorId: req.query.comprador || undefined })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Evolução do estoque: cresceu/diminuiu + qual linha impacta (gráfico) ──
router.get('/estoque-evolucao', async (req, res) => {
  try { res.json(await evolucaoEstoque(req.usuario.empresa_id, { lojaId: req.query.loja || undefined, compradorId: req.query.comprador || undefined, meses: Number(req.query.meses) || 6 })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Análise de vencidos (comprador + gerente): validade × demanda + clientes p/ ligar ──
router.get('/vencidos', async (req, res) => {
  try { res.json(await analiseVencidos(req.usuario.empresa_id, { lojaId: req.query.loja || undefined, dias: Number(req.query.dias) || 90 })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/vencidos/clientes', async (req, res) => {
  if (!req.query.produto) return res.status(400).json({ erro: 'Informe o produto.' });
  try { res.json(await clientesProduto(req.usuario.empresa_id, req.query.produto, { lojaId: req.query.loja || undefined })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Estoque & Remanejamento ─────────────────────────────────────────────
router.get('/transferencias-pendentes', async (req, res) => {
  try {
    const dias = Number(req.query.dias) || 7;
    const unis = req.query.loja ? unisEmpresa(req.usuario.empresa_id, req.query.loja) : null;
    res.json(await transferenciasPendentes(dias, unis));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});
// Produtos de uma transferência (drill ao clicar na linha do remanejamento).
router.get('/transferencias/:id/itens', async (req, res) => {
  try { res.json(await itensTransferencia(req.params.id)); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Agenda de visitas ──────────────────────────────────────────────────
router.get('/visitas', async (req, res) => {
  const emp = req.usuario.empresa_id;
  try { await sincronizarVisitas(emp); } catch (_) { /* ERP fora: mostra o que já existe */ }
  const status = req.query.status;
  const where = status ? ' AND status=?' : '';
  const rows = db.prepare(`SELECT * FROM fornecedor_visitas WHERE empresa_id=?${where}
    ORDER BY CASE status WHEN 'agendada' THEN 0 WHEN 'sugerida' THEN 1 WHEN 'realizada' THEN 2 ELSE 3 END,
             COALESCE(data_visita, criado_em) DESC`).all(...(status ? [emp, status] : [emp]));
  res.json({ visitas: rows, faixaVisita: getMetas(emp).visita_faixa.usado || FAIXA_VISITA });
});

// Cria visita manual.
router.post('/visitas', exigePerfil(...GESTAO_COMPRAS), (req, res) => {
  const emp = req.usuario.empresa_id;
  const { fornecedor_id, fornecedor_nome, data_visita, hora_visita, responsavel_id, responsavel_nome, observacao } = req.body;
  if (!fornecedor_nome) return res.status(400).json({ erro: 'Informe o fornecedor.' });
  const id = uuidv4();
  db.prepare(`INSERT INTO fornecedor_visitas
    (id,empresa_id,fornecedor_id,fornecedor_nome,status,origem,data_visita,hora_visita,responsavel_id,responsavel_nome,observacao,criado_em)
    VALUES (?,?,?,?,?,'manual',?,?,?,?,?,datetime('now'))`)
    .run(id, emp, Number(fornecedor_id) || 0, fornecedor_nome, data_visita ? 'agendada' : 'sugerida',
         data_visita || null, hora_visita || null, responsavel_id || null, responsavel_nome || null, observacao || null);
  res.json({ ok: true, id });
});

// Atualiza visita (agendar / marcar realizada / dispensar / editar).
router.put('/visitas/:id', exigePerfil(...GESTAO_COMPRAS), (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT * FROM fornecedor_visitas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Visita não encontrada.' });
  const campos = ['status', 'data_visita', 'hora_visita', 'responsavel_id', 'responsavel_nome', 'observacao'];
  const set = [], vals = [];
  campos.forEach(c => { if (c in req.body) { set.push(`${c}=?`); vals.push(req.body[c] === '' ? null : req.body[c]); } });
  if (!set.length) return res.json({ ok: true });
  set.push(`atualizado_em=datetime('now')`);
  db.prepare(`UPDATE fornecedor_visitas SET ${set.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});

router.delete('/visitas/:id', exigePerfil(...GESTAO_COMPRAS), (req, res) => {
  db.prepare('DELETE FROM fornecedor_visitas WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

module.exports = router;
