// acordos.js — Acordos e Negociações com fornecedores (Kanban de trade marketing).
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { auth, exigePerfil } = require('../middleware/auth');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing'];
const STATUS = ['novo', 'negociacao', 'vigente', 'concluido', 'cancelado'];
router.use(auth);

function proximoCodigo(emp) {
  const ano = new Date().getFullYear();
  const n = db.prepare("SELECT COUNT(*) c FROM acordos WHERE empresa_id=? AND codigo LIKE ?").get(emp, `ACO-${ano}-%`).c + 1;
  return `ACO-${ano}-${String(n).padStart(5, '0')}`;
}
function valorAcordo(id) {
  return db.prepare('SELECT COALESCE(SUM(valor),0) v FROM acordo_condicoes WHERE acordo_id=?').get(id).v || 0;
}
// Responsável de um setor (1º colaborador ativo com a função) — p/ direcionar tarefas.
function responsavelSetor(emp, funcoes) {
  const ph = funcoes.map(() => '?').join(',');
  const r = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.ativo=1 AND f.nome IN (${ph}) ORDER BY c.nome LIMIT 1`).get(emp, ...funcoes);
  return r ? r.id : null;
}
function criarTarefa(emp, titulo, descricao, refId, responsavelId) {
  const tid = uuid();
  db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
    VALUES (?,?, 'tarefa','acordo',?,?,?,?,'aberto',datetime('now'),datetime('now'))`)
    .run(tid, emp, 'acordo:' + (refId || ''), String(titulo).slice(0, 140), descricao || null, responsavelId || null);
  return tid;
}
const moeda = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// Kanban: todos os acordos com condições e valor.
// Dashboard: visão de TODOS os acordos (totais, por status, por fornecedor/comprador, vencendo).
router.get('/dashboard', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare('SELECT * FROM acordos WHERE empresa_id=?').all(emp);
  const pgSum = db.prepare('SELECT COALESCE(SUM(valor),0) v FROM acordo_pagamentos WHERE acordo_id=?');
  const acs = rows.map(a => ({ ...a, valor: valorAcordo(a.id), pago: pgSum.get(a.id).v }));
  const somaBy = (campoNome) => {
    const m = new Map();
    for (const a of acs) { const k = a[campoNome] || '—'; if (!m.has(k)) m.set(k, { nome: k, n: 0, valor: 0 }); const o = m.get(k); o.n++; o.valor += a.valor; }
    return [...m.values()].sort((x, y) => y.valor - x.valor);
  };
  const porStatus = {};
  for (const st of STATUS) porStatus[st.id || st] = { n: 0, valor: 0, label: st.label || st.id || st };
  for (const a of acs) { const k = a.status || 'novo'; (porStatus[k] = porStatus[k] || { n: 0, valor: 0, label: k }); porStatus[k].n++; porStatus[k].valor += a.valor; }
  const hoje = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const vencendo = acs.filter(a => a.status !== 'concluido' && a.status !== 'cancelado' && a.data_fim && a.data_fim >= hoje && a.data_fim <= em30)
    .sort((x, y) => (x.data_fim || '').localeCompare(y.data_fim || ''))
    .map(a => ({ id: a.id, codigo: a.codigo, fornecedor: a.fornecedor_nome, data_fim: a.data_fim, valor: a.valor }));
  const totais = {
    acordos: acs.length,
    ativos: acs.filter(a => a.status !== 'concluido' && a.status !== 'cancelado').length,
    valorContratado: Math.round(acs.reduce((s, a) => s + a.valor, 0)),
    totalPago: Math.round(acs.reduce((s, a) => s + (Number(a.pago) || 0), 0)),
  };
  res.json({ totais, porStatus: Object.entries(porStatus).map(([id, v]) => ({ id, ...v })), porFornecedor: somaBy('fornecedor_nome').slice(0, 12), porComprador: somaBy('comprador_nome').slice(0, 12), vencendo });
});

router.get('/', (req, res) => {
  const emp = req.usuario.empresa_id;
  const cond = ['empresa_id=?']; const args = [emp];
  if (req.query.busca) { cond.push('(fornecedor_nome LIKE ? OR codigo LIKE ? OR comprador_nome LIKE ?)'); const b = `%${req.query.busca}%`; args.push(b, b, b); }
  const rows = db.prepare(`SELECT * FROM acordos WHERE ${cond.join(' AND ')} ORDER BY criado_em DESC`).all(...args);
  const cCount = db.prepare('SELECT COUNT(*) n FROM acordo_condicoes WHERE acordo_id=?');
  res.json({
    status: STATUS,
    acordos: rows.map(a => ({ ...a, valor_total: valorAcordo(a.id), condicoes: cCount.get(a.id).n })),
  });
});

router.get('/:id', (req, res) => {
  const emp = req.usuario.empresa_id;
  const a = db.prepare('SELECT * FROM acordos WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!a) return res.status(404).json({ erro: 'Acordo não encontrado.' });
  a.condicoes = db.prepare('SELECT * FROM acordo_condicoes WHERE acordo_id=? ORDER BY criado_em').all(a.id);
  a.lojas = db.prepare('SELECT * FROM acordo_lojas WHERE acordo_id=? ORDER BY loja_nome').all(a.id);
  a.pagamentos = db.prepare('SELECT * FROM acordo_pagamentos WHERE acordo_id=? ORDER BY data_vencimento').all(a.id);
  a.assinaturas = db.prepare('SELECT id,nome,papel,criado_em, (assinatura IS NOT NULL) tem FROM acordo_assinaturas WHERE acordo_id=? ORDER BY criado_em').all(a.id);
  a.valor_total = valorAcordo(a.id);
  a.total_pago = db.prepare('SELECT COALESCE(SUM(valor),0) v FROM acordo_pagamentos WHERE acordo_id=?').get(a.id).v;
  a.historico = db.prepare('SELECT de_status, para_status, colaborador_nome, criado_em FROM acordo_historico WHERE acordo_id=? ORDER BY criado_em DESC').all(a.id);
  res.json({ acordo: a });
});

// Gera o texto do CONTRATO do acordo (preenche o template com os dados). Usa template_contrato
// do acordo se houver; senão um padrão de trade marketing. Placeholders: {fornecedor} {comprador}
// {periodo} {condicoes} {pagamentos} {lojas} {valor} {codigo} {hoje}.
const brlN = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dBR = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const TEMPLATE_PADRAO = `CONTRATO DE PARCERIA COMERCIAL / TRADE MARKETING — Nº {codigo}

Pelo presente instrumento, de um lado o GRUPO MUTTI (rede de farmácias) e de outro o FORNECEDOR {fornecedor}, ajustam a presente parceria comercial, sob a gestão do comprador {comprador}, nas condições abaixo.

VIGÊNCIA: {periodo}

OBJETO E CONDIÇÕES ACORDADAS:
{condicoes}

VALOR TOTAL DA PARCERIA: {valor}

FORMAS DE PAGAMENTO:
{pagamentos}

LOJAS PARTICIPANTES:
{lojas}

As partes declaram estar de acordo com as condições acima. Os valores de retorno serão apurados pelas compras efetivas do período conforme registrado no ERP.

Data: {hoje}

______________________________          ______________________________
        GRUPO MUTTI                                 {fornecedor}`;

router.get('/:id/contrato', (req, res) => {
  const emp = req.usuario.empresa_id;
  const a = db.prepare('SELECT * FROM acordos WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!a) return res.status(404).json({ erro: 'Acordo não encontrado.' });
  const conds = db.prepare('SELECT * FROM acordo_condicoes WHERE acordo_id=? ORDER BY criado_em').all(a.id);
  const pags = db.prepare('SELECT * FROM acordo_pagamentos WHERE acordo_id=? ORDER BY data_vencimento').all(a.id);
  const lojas = db.prepare('SELECT * FROM acordo_lojas WHERE acordo_id=? ORDER BY loja_nome').all(a.id);
  const valor = valorAcordo(a.id);
  const condTxt = conds.length ? conds.map((c, i) => `  ${i + 1}. ${c.descricao || c.tipo || 'Condição'}${c.percentual ? ` — ${c.percentual}%` : ''}${c.valor ? ` — ${brlN(c.valor)}` : ''}${c.meta_global ? ` (meta ${brlN(c.meta_global)})` : ''}`).join('\n') : '  (sem condições cadastradas)';
  const pagTxt = pags.length ? pags.map(p => `  • ${p.forma || 'pagamento'} — ${brlN(p.valor)}${p.data_vencimento ? ` (venc. ${dBR(p.data_vencimento)})` : ''}${p.observacao ? ` — ${p.observacao}` : ''}`).join('\n') : '  (a combinar)';
  const lojaTxt = lojas.length ? lojas.map(l => `  • ${l.loja_nome}`).join('\n') : '  Todas as lojas da rede';
  const tpl = (a.template_contrato && a.template_contrato.trim()) ? a.template_contrato : TEMPLATE_PADRAO;
  const texto = tpl
    .replace(/{codigo}/g, a.codigo || '—').replace(/{fornecedor}/g, a.fornecedor_nome || '—')
    .replace(/{comprador}/g, a.comprador_nome || '—')
    .replace(/{periodo}/g, `${dBR(a.data_inicio)} a ${dBR(a.data_fim)}`)
    .replace(/{condicoes}/g, condTxt).replace(/{pagamentos}/g, pagTxt).replace(/{lojas}/g, lojaTxt)
    .replace(/{valor}/g, brlN(valor)).replace(/{hoje}/g, new Date().toLocaleDateString('pt-BR'));
  res.json({ ok: true, codigo: a.codigo, texto });
});

// Apuração automática do retorno pelas COMPRAS reais do ERP (por condição + consolidado).
router.get('/:id/apuracao', async (req, res) => {
  try { res.json(await require('../lib/acordoApuracao').apurarAcordo(req.usuario.empresa_id, req.params.id)); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.post('/', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  if (!b.fornecedor_nome) return res.status(400).json({ erro: 'Informe o fornecedor.' });
  const id = uuid();
  db.prepare(`INSERT INTO acordos (id,empresa_id,codigo,fornecedor_id,fornecedor_nome,comprador_id,comprador_nome,status,tipo,data_inicio,data_fim,observacao,data_cadastro,template_contrato,url_contrato,apuracao,status_desde,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'))`)
    .run(id, emp, proximoCodigo(emp), b.fornecedor_id || null, b.fornecedor_nome, b.comprador_id || null, b.comprador_nome || null,
      STATUS.includes(b.status) ? b.status : 'novo', b.tipo || null, b.data_inicio || null, b.data_fim || null, b.observacao || null,
      b.data_cadastro || null, b.template_contrato || null, b.url_contrato || null, b.apuracao || null, req.usuario.id);
  (b.condicoes || []).forEach(c => { if (c && (c.descricao || c.valor)) db.prepare('INSERT INTO acordo_condicoes (id,empresa_id,acordo_id,tipo,descricao,valor,criado_em) VALUES (?,?,?,?,?,?,datetime(\'now\'))').run(uuid(), emp, id, c.tipo || null, c.descricao || null, Number(c.valor) || 0); });
  res.json({ ok: true, id });
});

router.put('/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const campos = ['fornecedor_id', 'fornecedor_nome', 'comprador_id', 'comprador_nome', 'tipo', 'data_inicio', 'data_fim', 'observacao', 'status', 'data_cadastro', 'template_contrato', 'url_contrato', 'apuracao'];
  const set = [], vals = [];
  campos.forEach(c => { if (c in req.body) { set.push(`${c}=?`); vals.push(req.body[c] === '' ? null : req.body[c]); } });
  if (set.length) { set.push("atualizado_em=datetime('now')"); db.prepare(`UPDATE acordos SET ${set.join(',')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp); }
  res.json({ ok: true });
});

// Mover de status (Kanban) — registra histórico e reinicia o "tempo no status".
router.post('/:id/mover', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const a = db.prepare('SELECT status FROM acordos WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!a) return res.status(404).json({ erro: 'Acordo não encontrado.' });
  const novo = req.body.status;
  if (!STATUS.includes(novo)) return res.status(400).json({ erro: 'Status inválido.' });
  db.prepare("UPDATE acordos SET status=?, status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=?").run(novo, req.params.id);
  db.prepare('INSERT INTO acordo_historico (id,empresa_id,acordo_id,de_status,para_status,colaborador_id,colaborador_nome,criado_em) VALUES (?,?,?,?,?,?,?,datetime(\'now\'))')
    .run(uuid(), emp, req.params.id, a.status, novo, req.usuario.id, req.usuario.nome);
  res.json({ ok: true });
});

// Condições (ricas: dimensão + alvo do ERP, estratégia, apuração/metas, escopo/exceções por EAN, %, comissão)
router.post('/:id/condicoes', exigePerfil(...GESTAO), (req, res) => {
  const cid = uuid(), b = req.body;
  db.prepare(`INSERT INTO acordo_condicoes (id,empresa_id,acordo_id,tipo,dimensao,alvo_id,alvo_nome,estrategia,apuracao,periodo,meta_global,meta_mensal,periodo_ini,periodo_fim,escopo,excecoes,descricao,valor,percentual,comissao_unitaria,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(cid, req.usuario.empresa_id, req.params.id, b.tipo || null, b.dimensao || null, b.alvo_id || null, b.alvo_nome || null,
      b.estrategia || 'global', b.apuracao || null, b.periodo || 'global', Number(b.meta_global) || 0, Number(b.meta_mensal) || 0,
      b.periodo_ini || null, b.periodo_fim || null,
      b.escopo ? JSON.stringify(b.escopo) : null, b.excecoes ? JSON.stringify(b.excecoes) : null,
      b.descricao || null, Number(b.valor) || 0, Number(b.percentual) || 0, Number(b.comissao_unitaria) || 0);
  res.json({ ok: true, id: cid });
});

// Busca no ERP por dimensão (para escolher o alvo da condição).
router.get('/erp/buscar', async (req, res) => {
  const dim = req.query.dim, q = (req.query.q || '').trim();
  if (!habilitado() || q.length < 2) return res.json({ itens: [] });
  const like = `%${q}%`;
  let sql;
  if (dim === 'fornecedor') sql = `SELECT f.id, p.nome FROM fornecedor f JOIN pessoa p ON p.id=f.pessoaid WHERE f.status='A' AND p.nome ILIKE $1 ORDER BY p.nome LIMIT 20`;
  else if (dim === 'fabricante') sql = `SELECT f.id, p.nome FROM fabricante f JOIN pessoa p ON p.id=f.pessoaid WHERE p.nome ILIKE $1 ORDER BY p.nome LIMIT 20`;
  else if (dim === 'grupo_pai') sql = `SELECT id, nome FROM classificacao WHERE principal=true AND folha=false AND nome ILIKE $1 ORDER BY nome LIMIT 20`;
  else if (dim === 'grupo_filho') sql = `SELECT id, nome FROM classificacao WHERE principal=true AND folha=true AND nome ILIKE $1 ORDER BY nome LIMIT 20`;
  else if (dim === 'grupo_preco') sql = `SELECT id, nome FROM classificacao WHERE principal=true AND nome ILIKE $1 ORDER BY nome LIMIT 20`;
  else if (dim === 'produtos') sql = `SELECT DISTINCT ON (p.id) p.id, p.descricao nome, e.codigobarras ean FROM produto p JOIN embalagem e ON e.produtoid=p.id WHERE p.descricao ILIKE $1 OR e.codigobarras ILIKE $1 ORDER BY p.id, length(e.codigobarras) DESC LIMIT 30`;
  else return res.json({ itens: [] });
  try {
    const r = await erpQuery(sql, [like]);
    res.json({ itens: r.map(x => ({ id: String(x.id), nome: x.nome, ean: x.ean || null })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.delete('/:id/condicoes/:cid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM acordo_condicoes WHERE id=? AND acordo_id=? AND empresa_id=?').run(req.params.cid, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Lojas participantes
router.post('/:id/lojas', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const lojas = Array.isArray(req.body.lojas) ? req.body.lojas : [req.body];
  const ins = db.prepare('INSERT INTO acordo_lojas (id,empresa_id,acordo_id,loja_id,loja_nome,criado_em) VALUES (?,?,?,?,?,datetime(\'now\'))');
  lojas.forEach(l => { if (l && l.loja_id) ins.run(uuid(), emp, req.params.id, l.loja_id, l.loja_nome || null); });
  res.json({ ok: true });
});
router.delete('/:id/lojas/:lid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM acordo_lojas WHERE id=? AND acordo_id=? AND empresa_id=?').run(req.params.lid, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Pagamentos — com efeitos por forma: depósito → tarefa Financeiro; brinde → tarefa p/ lançar no controle de brindes.
router.post('/:id/pagamentos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body, pid = uuid();
  db.prepare(`INSERT INTO acordo_pagamentos (id,empresa_id,acordo_id,forma,data_vencimento,data_pagamento,valor,valor_credito,nf_ref,anexo_url,status,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(pid, emp, req.params.id, b.forma || null, b.data_vencimento || null, b.data_pagamento || null,
      Number(b.valor) || 0, Number(b.valor_credito) || 0, b.nf_ref || null, b.anexo_url || null, b.data_pagamento ? 'pago' : 'previsto');

  const ac = db.prepare('SELECT codigo, fornecedor_nome FROM acordos WHERE id=?').get(req.params.id) || {};
  const forma = (b.forma || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // sem acento
  let tarefa = null;
  if (forma.includes('deposito')) {
    const resp = responsavelSetor(emp, ['Controladoria', 'Gestor Geral', 'Diretor Geral']);
    tarefa = criarTarefa(emp, `💰 Depósito do acordo ${ac.codigo || ''} — ${ac.fornecedor_nome || ''}`,
      `Efetuar/baixar o DEPÓSITO de ${moeda(b.valor)} do acordo ${ac.codigo || ''} (${ac.fornecedor_nome || ''}). Vencimento ${b.data_vencimento || '—'}.`, req.params.id, resp);
  } else if (forma.includes('brinde')) {
    tarefa = criarTarefa(emp, `🎁 Lançar brinde no controle — acordo ${ac.codigo || ''}`,
      `Buscar a NF ${b.nf_ref || '(informar)'} onde vieram os brindes do acordo ${ac.codigo || ''} (${ac.fornecedor_nome || ''}) e cadastrar no controle de brindes (Meu Mercado).`, req.params.id, responsavelSetor(emp, ['Marketing', 'Gestor Geral', 'Diretor Geral']));
  }
  res.json({ ok: true, id: pid, tarefa });
});

// NF do ERP (pagamento por brinde: onde estão os brindes).
router.get('/erp/nf', async (req, res) => {
  const numero = (req.query.numero || '').toString().replace(/\D/g, '');
  if (!habilitado() || !numero) return res.json({ nfs: [] });
  try {
    const r = await erpQuery(`SELECT nf.id, nf.numero, forn.nome fornecedor FROM notafiscal nf
      LEFT JOIN pessoa forn ON forn.id=nf.fornecedorid WHERE nf.numero=$1 ORDER BY nf.datahorainclusao DESC LIMIT 10`, [Number(numero)]);
    res.json({ nfs: r.map(x => ({ id: String(x.id), numero: x.numero, fornecedor: x.fornecedor })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// Boletos (contas a pagar em aberto) do fornecedor do acordo — pagamento por desconto em boleto.
router.get('/erp/boletos', async (req, res) => {
  const fid = req.query.fornecedor_id, q = (req.query.q || '').replace(/\D/g, '');
  if (!habilitado() || !fid) return res.json({ boletos: [] });
  const params = [fid]; let filtro = '';
  if (q) { params.push(`%${q}%`); filtro = ' AND cp.numerodocumento ILIKE $2'; }
  try {
    const r = await erpQuery(`SELECT cp.id, cp.numerodocumento doc, cp.datavencimento venc, cp.valor, cp.codigobarras
      FROM contapagar cp WHERE cp.status='A' AND cp.pessoaid=(SELECT pessoaid FROM fornecedor WHERE id=$1)${filtro}
      ORDER BY cp.datavencimento LIMIT 30`, params);
    res.json({ boletos: r.map(x => ({ id: String(x.id), doc: x.doc, venc: x.venc, valor: Number(x.valor) || 0, barras: x.codigobarras })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.delete('/:id/pagamentos/:pid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM acordo_pagamentos WHERE id=? AND acordo_id=? AND empresa_id=?').run(req.params.pid, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Assinaturas
router.post('/:id/assinaturas', exigePerfil(...GESTAO), (req, res) => {
  const aid = uuid();
  db.prepare('INSERT INTO acordo_assinaturas (id,empresa_id,acordo_id,nome,papel,assinatura,criado_em) VALUES (?,?,?,?,?,?,datetime(\'now\'))')
    .run(aid, req.usuario.empresa_id, req.params.id, req.body.nome || null, req.body.papel || null, req.body.assinatura || null);
  res.json({ ok: true, id: aid });
});
router.delete('/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM acordo_condicoes WHERE acordo_id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  db.prepare('DELETE FROM acordos WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Busca de fornecedor no ERP + compradores
router.get('/erp/fornecedores', async (req, res) => {
  if (!habilitado() || !req.query.q || req.query.q.length < 2) return res.json({ fornecedores: [] });
  try {
    const r = await erpQuery(`SELECT f.id, p.nome FROM fornecedor f JOIN pessoa p ON p.id=f.pessoaid WHERE f.status='A' AND p.nome ILIKE $1 ORDER BY p.nome LIMIT 20`, [`%${req.query.q}%`]);
    res.json({ fornecedores: r.map(x => ({ id: String(x.id), nome: x.nome })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.get('/erp/compradores', (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.ativo=1 AND (f.nome LIKE 'Comprador%' OR f.nome IN ('Supervisor','Gestor Geral','Diretor Geral')) ORDER BY c.nome`).all(req.usuario.empresa_id);
  res.json({ compradores: rows });
});

module.exports = router;
