// Módulo de Devoluções de mercadorias (Suporte).
// Cadastro (conferente) → fluxo de status → reembolso/perda. Produtos vêm do ERP
// (busca por código de barras/descrição) ou de um XML de NF-e importado.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { erpQuery, habilitado } = require('../db/erp');
const { gerarTarefa } = require('./tarefas');

router.use(auth);

// Fluxo principal de status (a devolução já abre em "andamento").
const STATUS = ['andamento', 'analise_fornecedor', 'coleta', 'reembolso', 'concluido'];
const STATUS_LABEL = {
  andamento: 'Andamento', analise_fornecedor: 'Análise Fornecedor', coleta: 'Coleta', reembolso: 'Reembolso',
  concluido: 'Concluído', perdas: 'Perdas', cancelado: 'Cancelado', novo: 'Novo', aguardando_solicitante: 'Aguardando Solicitante',
};
// SLA padrão por status (horas) — usado pra marcar "atrasada".
const SLA_HORAS = { andamento: 72, analise_fornecedor: 120, coleta: 120, reembolso: 168 };

// Acha um colaborador ativo por função (prioriza a mesma loja), p/ direcionar tarefas.
function colabPorFuncao(empresaId, funcoesIds, lojaId) {
  const ph = funcoesIds.map(() => '?').join(',');
  return db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id IN (${ph}) AND ativo=1
    ORDER BY (loja_id=?) DESC LIMIT 1`).get(empresaId, ...funcoesIds, lojaId || '')?.id || null;
}

function recalcValor(devolucaoId) {
  const r = db.prepare('SELECT COALESCE(SUM(valor_total),0) v FROM devolucao_itens WHERE devolucao_id=?').get(devolucaoId);
  db.prepare('UPDATE devolucoes SET valor_total=?, atualizado_em=datetime(\'now\') WHERE id=?').run(r.v, devolucaoId);
  return r.v;
}
function hist(devolucaoId, status, deStatus, texto, req) {
  db.prepare(`INSERT INTO devolucao_historico (id,devolucao_id,status,de_status,texto,autor_id,autor_nome,criado_em)
    VALUES (?,?,?,?,?,?,?,datetime('now'))`).run(uuidv4(), devolucaoId, status, deStatus || null, texto || null, req.usuario.id, req.usuario.nome || null);
}
function proximoCodigo(empresaId, ano) {
  const like = `RET-${ano}-%`;
  const row = db.prepare(`SELECT codigo FROM devolucoes WHERE empresa_id=? AND codigo LIKE ? ORDER BY codigo DESC LIMIT 1`).get(empresaId, like);
  let seq = 1;
  if (row && row.codigo) { const m = row.codigo.match(/(\d+)$/); if (m) seq = parseInt(m[1], 10) + 1; }
  return `RET-${ano}-${String(seq).padStart(4, '0')}`;
}

// ── BUSCA DE PRODUTO NO ERP (código de barras ou descrição) ──
router.get('/produtos', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ produtos: [] });
  if (!habilitado()) return res.json({ produtos: [] });
  try {
    const rows = await erpQuery(`
      SELECT e.codigobarras AS ean, COALESCE(e.descricao, p.descricao) AS descricao, e.precovenda
      FROM embalagem e JOIN produto p ON p.id = e.produtoid
      WHERE e.codigobarras = $1 OR COALESCE(e.descricao, p.descricao) ILIKE $2
      ORDER BY (e.codigobarras = $1) DESC, descricao LIMIT 20`, [q, `%${q}%`]);
    res.json({ produtos: rows.map(r => ({ ean: r.ean, descricao: r.descricao, preco: Number(r.precovenda) || 0 })) });
  } catch (e) { res.json({ produtos: [], erro: e.message }); }
});

// ── INDICADORES de devolução (valor parado, perdas, pago, atrasos por loja/conferente…) ──
router.get('/indicadores', (req, res) => {
  const { empresa_id, funcao_nome, loja_id } = req.usuario;
  const soLoja = ['Gerente', 'Subgerente', 'Conferente'].includes(funcao_nome);
  let filtro = 'WHERE d.empresa_id=?'; const p = [empresa_id];
  if (soLoja) { filtro += ' AND d.loja_id=?'; p.push(loja_id); }
  else if (req.query.loja_id) { filtro += ' AND d.loja_id=?'; p.push(req.query.loja_id); }
  const rows = db.prepare(`SELECT d.*, l.nome loja_nome, c.nome conferente_nome FROM devolucoes d
    LEFT JOIN lojas l ON l.id=d.loja_id LEFT JOIN colaboradores c ON c.id=d.conferente_id ${filtro}`).all(...p);
  const agora = Date.now();
  const ativo = s => !['concluido', 'perdas', 'cancelado'].includes(s);
  rows.forEach(r => { const desde = r.status_desde ? new Date(r.status_desde + 'Z').getTime() : agora; const h = (agora - desde) / 36e5; r._atras = ativo(r.status) && SLA_HORAS[r.status] && h > SLA_HORAS[r.status]; });
  const r2 = v => Math.round(v * 100) / 100;
  const kpi = pred => { const a = rows.filter(pred); return { n: a.length, v: r2(a.reduce((s, x) => s + (x.valor_total || 0), 0)) }; };
  function agrupar(keyFn) {
    const m = {};
    rows.forEach(r => { const k = keyFn(r) || '(sem)'; const o = m[k] || (m[k] = { k, n: 0, valor: 0, atras: 0, concl: 0 }); o.n++; o.valor += r.valor_total || 0; if (r._atras) o.atras++; if (r.status === 'concluido') o.concl++; });
    return Object.values(m).map(o => ({ ...o, valor: r2(o.valor) }));
  }
  const porLoja = agrupar(r => r.loja_nome), porConf = agrupar(r => r.conferente_nome);
  res.json({
    valor_parado: kpi(r => ativo(r.status)),
    reembolso_aberto: kpi(r => r.status === 'reembolso' && !r.pago),
    pago: kpi(r => r.status === 'concluido' && r.pago),
    perdas: kpi(r => r.status === 'perdas'),
    atrasadas: kpi(r => r._atras),
    lojas_atraso: porLoja.filter(x => x.atras > 0).sort((a, b) => b.atras - a.atras).map(x => ({ k: x.k, atras: x.atras, total: x.n })),
    conferentes_atraso: porConf.filter(x => x.atras > 0).sort((a, b) => b.atras - a.atras).map(x => ({ k: x.k, atras: x.atras, total: x.n })),
    conferentes_resolucao: porConf.filter(x => x.concl > 0).sort((a, b) => b.concl - a.concl).slice(0, 10).map(x => ({ k: x.k, concluidas: x.concl, total: x.n })),
    por_motivo: agrupar(r => r.motivo).sort((a, b) => b.valor - a.valor),
    por_fornecedor: agrupar(r => r.fornecedor_nome).sort((a, b) => b.valor - a.valor).slice(0, 10),
    por_status: agrupar(r => r.status).sort((a, b) => b.valor - a.valor),
  });
});

// ── FORNECEDORES do ERP (busca por nome / razão social / CNPJ) ──
router.get('/fornecedores', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2 || !habilitado()) return res.json({ fornecedores: [] });
  const dig = q.replace(/\D/g, '');
  try {
    const rows = await erpQuery(`
      SELECT COALESCE(p.razaosocial, p.nome) AS nome, p.nome AS fantasia, COALESCE(p.cnpj, p.cpf) AS documento
      FROM fornecedor f JOIN pessoa p ON p.id = f.pessoaid
      WHERE f.status='A' AND (p.nome ILIKE $1 OR p.razaosocial ILIKE $1 ${dig.length >= 3 ? "OR COALESCE(p.cnpj,p.cpf) LIKE $2" : ''})
      ORDER BY nome LIMIT 15`, dig.length >= 3 ? [`%${q}%`, `%${dig}%`] : [`%${q}%`]);
    res.json({ fornecedores: rows.map(r => ({ nome: r.nome, fantasia: r.fantasia, documento: r.documento })) });
  } catch (e) { res.json({ fornecedores: [], erro: e.message }); }
});

// ── MOTIVOS de devolução (cadastro padrão) ──
router.get('/motivos', (req, res) => {
  const rows = db.prepare('SELECT id, nome, ativo FROM devolucao_motivos WHERE empresa_id=? ORDER BY ordem, nome').all(req.usuario.empresa_id);
  res.json({ motivos: rows });
});
router.post('/motivos', exigePerfil('Suporte', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Gerente'), (req, res) => {
  const nome = (req.body && req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o motivo.' });
  const ordem = (db.prepare('SELECT MAX(ordem) m FROM devolucao_motivos WHERE empresa_id=?').get(req.usuario.empresa_id).m || 0) + 1;
  const id = uuidv4();
  db.prepare('INSERT INTO devolucao_motivos (id,empresa_id,nome,ordem) VALUES (?,?,?,?)').run(id, req.usuario.empresa_id, nome, ordem);
  res.status(201).json({ id });
});
router.patch('/motivos/:id', exigePerfil('Suporte', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Gerente'), (req, res) => {
  const b = req.body || {};
  if (b.nome !== undefined) db.prepare('UPDATE devolucao_motivos SET nome=? WHERE id=? AND empresa_id=?').run(b.nome, req.params.id, req.usuario.empresa_id);
  if (b.ativo !== undefined) db.prepare('UPDATE devolucao_motivos SET ativo=? WHERE id=? AND empresa_id=?').run(b.ativo ? 1 : 0, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── BUSCAR NF DE ENTRADA NO ERP (por nº + loja) → itens com CUSTO p/ marcar o que devolver ──
// GET /devolucoes/nf-erp?numero=&loja_id=&serie=
router.get('/nf-erp', async (req, res) => {
  const numero = (req.query.numero || '').toString().replace(/\D/g, '');
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  if (!numero) return res.status(400).json({ erro: 'Informe o número da NF.' });
  if (!habilitado()) return res.status(503).json({ erro: 'ERP indisponível.' });
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  if (!loja || !loja.erp_unidadenegocio_id) return res.status(400).json({ erro: 'Loja sem vínculo com o ERP.' });
  try {
    const params = [Number(numero), loja.erp_unidadenegocio_id];
    let filtroSerie = '';
    if (req.query.serie) { filtroSerie = ' AND nf.serie = $3'; params.push(String(req.query.serie)); }
    const nfs = await erpQuery(`
      SELECT nf.id, nf.numero, nf.serie, nf.valortotal, nf.datahoraemissao, forn.nome AS fornecedor
      FROM notafiscal nf LEFT JOIN pessoa forn ON forn.id = nf.fornecedorid
      WHERE nf.numero = $1 AND nf.unidadenegocioid = $2${filtroSerie}
      ORDER BY nf.datahorainclusao DESC LIMIT 5`, params);
    if (!nfs.length) return res.json({ encontrada: false });
    const nf = nfs[0];
    const itens = await erpQuery(`
      SELECT COALESCE(i.descricao, '') AS descricao, i.codigobarras AS ean,
             i.quantidade, i.valorunitario, i.valortotal
      FROM itemnotafiscal i WHERE i.notafiscalid = $1 ORDER BY i.descricao`, [nf.id]);
    res.json({
      encontrada: true,
      nf: { numero: nf.numero, serie: nf.serie, fornecedor: nf.fornecedor, valor_total: Number(nf.valortotal) || 0, emissao: nf.datahoraemissao },
      candidatas: nfs.length > 1 ? nfs.map(n => ({ numero: n.numero, serie: n.serie, fornecedor: n.fornecedor, valor: Number(n.valortotal) || 0 })) : [],
      itens: itens.map(i => ({
        ean: i.ean || null, descricao: i.descricao,
        quantidade_nf: Number(i.quantidade) || 0,
        valor_unit: Number(i.valorunitario) || 0,       // CUSTO da NF (p/ indicadores de valor parado)
        valor_total_nf: Number(i.valortotal) || 0,
      })),
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── LISTA (kanban): agrupa por status + SLA "tempo no status" ──
router.get('/', (req, res) => {
  const { empresa_id, funcao_nome, loja_id } = req.usuario;
  const soLoja = ['Gerente', 'Subgerente', 'Conferente'].includes(funcao_nome);
  let q = `SELECT d.*, l.nome AS loja_nome, c.nome AS conferente_nome FROM devolucoes d
    LEFT JOIN lojas l ON l.id=d.loja_id LEFT JOIN colaboradores c ON c.id=d.conferente_id
    WHERE d.empresa_id=?`;
  const p = [empresa_id];
  if (soLoja) { q += ' AND d.loja_id=?'; p.push(loja_id); }
  else if (req.query.loja_id) { q += ' AND d.loja_id=?'; p.push(req.query.loja_id); }
  if (req.query.status) { q += ' AND d.status=?'; p.push(req.query.status); }
  q += ' ORDER BY d.atualizado_em DESC';
  const agora = Date.now();
  const linhas = db.prepare(q).all(...p).map(d => {
    const desde = d.status_desde ? new Date(d.status_desde + 'Z').getTime() : agora;
    const horasNoStatus = Math.max(0, Math.round((agora - desde) / 36e5));
    const sla = SLA_HORAS[d.status];
    return { ...d, status_label: STATUS_LABEL[d.status] || d.status, horas_no_status: horasNoStatus, atrasada: sla ? horasNoStatus > sla : false };
  });
  const resumo = {};
  [...STATUS, 'perdas', 'cancelado'].forEach(s => { resumo[s] = { label: STATUS_LABEL[s], n: 0, valor: 0 }; });
  linhas.forEach(d => { if (resumo[d.status]) { resumo[d.status].n++; resumo[d.status].valor += d.valor_total || 0; } });
  res.json({ devolucoes: linhas, resumo, status_fluxo: STATUS.map(s => ({ id: s, label: STATUS_LABEL[s] })) });
});

// ── DETALHE completo ──
router.get('/:id', (req, res) => {
  const d = db.prepare(`SELECT d.*, l.nome AS loja_nome, c.nome AS conferente_nome FROM devolucoes d
    LEFT JOIN lojas l ON l.id=d.loja_id LEFT JOIN colaboradores c ON c.id=d.conferente_id WHERE d.id=? AND d.empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!d) return res.status(404).json({ erro: 'Devolução não encontrada.' });
  d.status_label = STATUS_LABEL[d.status] || d.status;
  d.itens = db.prepare('SELECT * FROM devolucao_itens WHERE devolucao_id=? ORDER BY descricao').all(d.id);
  d.fornecedor = db.prepare('SELECT * FROM devolucao_fornecedor WHERE devolucao_id=?').get(d.id) || {};
  d.reembolsos = db.prepare('SELECT * FROM devolucao_reembolsos WHERE devolucao_id=? ORDER BY data').all(d.id);
  d.historico = db.prepare('SELECT * FROM devolucao_historico WHERE devolucao_id=? ORDER BY criado_em DESC').all(d.id);
  res.json(d);
});

// ── CRIAR (dados básicos) ──
router.post('/', (req, res) => {
  const { empresa_id, id: userId, loja_id: userLoja } = req.usuario;
  const b = req.body || {};
  const lojaId = b.loja_id || userLoja;
  if (!lojaId || !b.fornecedor_nome) return res.status(400).json({ erro: 'Loja e fornecedor são obrigatórios.' });
  if (!b.motivo) return res.status(400).json({ erro: 'O motivo da devolução é obrigatório.' });
  const ano = new Date().getFullYear();
  const id = uuidv4();
  const codigo = proximoCodigo(empresa_id, ano);
  db.prepare(`INSERT INTO devolucoes (id,empresa_id,loja_id,codigo,fornecedor_nome,fornecedor_cnpj,nf_numero,tipo,motivo,observacoes_loja,status,status_desde,conferente_id,criado_por,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'andamento', datetime('now'), ?, ?, datetime('now'), datetime('now'))`)
    .run(id, empresa_id, lojaId, codigo, b.fornecedor_nome, b.fornecedor_cnpj || null, b.nf_numero || null, b.tipo || 'total', b.motivo || null, b.observacoes_loja || null, b.conferente_id || userId, userId);
  hist(id, 'andamento', null, 'Devolução cadastrada.', req);
  res.status(201).json({ id, codigo });
});

// ── ATUALIZAR dados básicos ──
router.patch('/:id', (req, res) => {
  const b = req.body || {};
  const campos = ['fornecedor_nome', 'fornecedor_cnpj', 'nf_numero', 'tipo', 'motivo', 'observacoes_loja', 'conferente_id', 'reembolso_momento'];
  const sets = [], vals = [];
  campos.forEach(c => { if (b[c] !== undefined) { sets.push(`${c}=?`); vals.push(b[c]); } });
  if (!sets.length) return res.json({ ok: true });
  vals.push(req.params.id, req.usuario.empresa_id);
  db.prepare(`UPDATE devolucoes SET ${sets.join(',')}, atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(...vals);
  res.json({ ok: true });
});

// ── ITENS: adicionar / remover ──
function inserirItem(devolucaoId, b) {
  const qtd = Number(b.quantidade) || 0, vu = Number(b.valor_unit) || 0, qnf = Number(b.quantidade_nf) || 0;
  db.prepare(`INSERT INTO devolucao_itens (id,devolucao_id,ean,codigo_produto,descricao,quantidade_nf,quantidade,valor_unit,valor_total)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(uuidv4(), devolucaoId, b.ean || null, b.codigo_produto || null, b.descricao || '', qnf, qtd, vu, qtd * vu);
}
router.post('/:id/itens', (req, res) => {
  inserirItem(req.params.id, req.body || {});
  res.status(201).json({ ok: true, valor_total: recalcValor(req.params.id) });
});
// Inclusão em lote (marcar vários produtos da NF de uma vez)
router.post('/:id/itens-lote', (req, res) => {
  const itens = (req.body && req.body.itens) || [];
  itens.filter(i => (Number(i.quantidade) || 0) > 0).forEach(i => inserirItem(req.params.id, i));
  res.status(201).json({ ok: true, incluidos: itens.length, valor_total: recalcValor(req.params.id) });
});
router.delete('/:id/itens/:itemId', (req, res) => {
  db.prepare('DELETE FROM devolucao_itens WHERE id=? AND devolucao_id=?').run(req.params.itemId, req.params.id);
  res.json({ ok: true, valor_total: recalcValor(req.params.id) });
});


// ── MUDAR STATUS (avança/define no fluxo) ──
router.post('/:id/status', (req, res) => {
  const novo = (req.body && req.body.status) || '';
  if (!STATUS_LABEL[novo]) return res.status(400).json({ erro: 'Status inválido.' });
  const d = db.prepare('SELECT status FROM devolucoes WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!d) return res.status(404).json({ erro: 'Devolução não encontrada.' });
  db.prepare(`UPDATE devolucoes SET status=?, status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=?`).run(novo, req.params.id);
  hist(req.params.id, novo, d.status, (req.body && req.body.obs) || `Movida para ${STATUS_LABEL[novo]}.`, req);
  res.json({ ok: true });
});

// ── DADOS DO FORNECEDOR / NF de devolução / coleta ──
router.put('/:id/fornecedor', (req, res) => {
  const b = req.body || {};
  const campos = ['status_fornecedor', 'protocolo', 'data_resposta', 'observacoes_escritorio', 'nf_devolucao_numero', 'nf_devolucao_serie', 'nf_devolucao_emissao', 'previsao_coleta', 'url_nf_devolucao', 'url_ordem_coleta', 'url_ordem_assinada', 'data_coleta', 'url_comprovante_coleta'];
  const existe = db.prepare('SELECT 1 FROM devolucao_fornecedor WHERE devolucao_id=?').get(req.params.id);
  if (!existe) db.prepare('INSERT INTO devolucao_fornecedor (devolucao_id) VALUES (?)').run(req.params.id);
  const sets = [], vals = [];
  campos.forEach(c => { if (b[c] !== undefined) { sets.push(`${c}=?`); vals.push(b[c]); } });
  if (sets.length) { vals.push(req.params.id); db.prepare(`UPDATE devolucao_fornecedor SET ${sets.join(',')} WHERE devolucao_id=?`).run(...vals); }
  res.json({ ok: true });
});

// ── REEMBOLSOS ──
router.post('/:id/reembolsos', (req, res) => {
  const b = req.body || {};
  const emp = req.usuario.empresa_id;
  db.prepare(`INSERT INTO devolucao_reembolsos (id,devolucao_id,forma_pagamento,data,valor,credito,nota_fiscal) VALUES (?,?,?,?,?,?,?)`)
    .run(uuidv4(), req.params.id, b.forma_pagamento || null, b.data || null, Number(b.valor) || 0, Number(b.credito) || 0, b.nota_fiscal || null);

  // Efeitos por forma (igual aos Acordos): depósito → tarefa Financeiro; brinde → tarefa p/ lançar
  // no controle (Meu Mercado); desconto em boleto → tarefa Financeiro p/ abater no boleto do fornecedor.
  const d = getDevol(req.params.id, emp) || {};
  const forma = (b.forma_pagamento || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const val = Number(b.valor) || 0, vTxt = 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  let tarefa = null;
  if (forma.includes('deposito')) {
    const fin = colabPorFuncao(emp, ['func-financeiro', 'func-tesouraria', 'func-controladoria'], d.loja_id);
    tarefa = gerarTarefa({ empresa_id: emp, loja_id: d.loja_id, origem: 'devolucao_deposito', referencia_id: 'dev:' + d.id,
      titulo: `💰 Conferir depósito — devolução ${d.codigo || ''}`, descricao: `Confirmar o recebimento do DEPÓSITO de ${vTxt} referente à devolução ${d.codigo || ''} (${d.fornecedor_nome || ''}).`, responsavel_id: fin, criado_por: req.usuario.id });
  } else if (forma.includes('brinde')) {
    const sup = colabPorFuncao(emp, ['func-suporte', 'func-controladoria'], d.loja_id);
    tarefa = gerarTarefa({ empresa_id: emp, loja_id: d.loja_id, origem: 'devolucao_brinde', referencia_id: 'dev:' + d.id,
      titulo: `🎁 Lançar brinde no controle — devolução ${d.codigo || ''}`, descricao: `O reembolso da devolução ${d.codigo || ''} (${d.fornecedor_nome || ''}) veio em BRINDE${b.nota_fiscal ? ' (NF ' + b.nota_fiscal + ')' : ''}. Cadastrar a mercadoria no controle de brindes (Meu Mercado).`, responsavel_id: sup, criado_por: req.usuario.id });
  } else if (forma.includes('boleto')) {
    const fin = colabPorFuncao(emp, ['func-financeiro', 'func-tesouraria', 'func-controladoria'], d.loja_id);
    tarefa = gerarTarefa({ empresa_id: emp, loja_id: d.loja_id, origem: 'devolucao_boleto', referencia_id: 'dev:' + d.id,
      titulo: `🧾 Abater em boleto — devolução ${d.codigo || ''}`, descricao: `Abater ${vTxt} da devolução ${d.codigo || ''} (${d.fornecedor_nome || ''}) no boleto do fornecedor${b.nota_fiscal ? ' (doc ' + b.nota_fiscal + ')' : ''}.`, responsavel_id: fin, criado_por: req.usuario.id });
  }
  res.status(201).json({ ok: true, tarefa });
});

// ── ERP p/ o reembolso: boletos em aberto do fornecedor (desconto em boleto) e NF (brinde) ──
router.get('/erp/boletos', async (req, res) => {
  const cnpj = (req.query.cnpj || '').replace(/\D/g, ''), q = (req.query.q || '').replace(/\D/g, '');
  if (!habilitado() || cnpj.length < 8) return res.json({ boletos: [] });
  const params = [cnpj]; let filtro = '';
  if (q) { params.push(`%${q}%`); filtro = ' AND cp.numerodocumento ILIKE $2'; }
  try {
    const r = await erpQuery(`SELECT cp.id, cp.numerodocumento doc, cp.datavencimento venc, cp.valor, cp.codigobarras
      FROM contapagar cp WHERE cp.status='A'
        AND cp.pessoaid IN (SELECT id FROM pessoa WHERE regexp_replace(COALESCE(cnpj,cpf,''), '\\D', '', 'g') = $1)${filtro}
      ORDER BY cp.datavencimento LIMIT 30`, params);
    res.json({ boletos: r.map(x => ({ id: String(x.id), doc: x.doc, venc: x.venc, valor: Number(x.valor) || 0, barras: x.codigobarras })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.get('/erp/nf', async (req, res) => {
  const numero = (req.query.numero || '').toString().replace(/\D/g, '');
  if (!habilitado() || !numero) return res.json({ nfs: [] });
  try {
    const r = await erpQuery(`SELECT nf.id, nf.numero, forn.nome fornecedor FROM notafiscal nf
      LEFT JOIN pessoa forn ON forn.id=nf.fornecedorid WHERE nf.numero=$1 ORDER BY nf.datahorainclusao DESC LIMIT 10`, [Number(numero)]);
    res.json({ nfs: r.map(x => ({ id: String(x.id), numero: x.numero, fornecedor: x.fornecedor })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.delete('/:id/reembolsos/:reembId', (req, res) => {
  db.prepare('DELETE FROM devolucao_reembolsos WHERE id=? AND devolucao_id=?').run(req.params.reembId, req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLUXO com tarefas (comprador / conferente / suporte / financeiro)
// ─────────────────────────────────────────────────────────────────────────────
function getDevol(id, empresaId) { return db.prepare('SELECT * FROM devolucoes WHERE id=? AND empresa_id=?').get(id, empresaId); }
function setStatus(id, status) { db.prepare(`UPDATE devolucoes SET status=?, status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=?`).run(status, id); }
function fecharTarefasDevol(devolucaoId, origem) {
  db.prepare(`UPDATE tarefas SET status='concluido', reanalise_status='encerrada_auto', concluido_em=datetime('now'), atualizado_em=datetime('now')
    WHERE origem=? AND referencia_id=? AND status!='concluido'`).run(origem, 'dev:' + devolucaoId);
}
function tarefaFinanceiro(req, d) {
  fecharTarefasDevol(d.id, 'devolucao_reembolso_info');
  const fin = colabPorFuncao(req.usuario.empresa_id, ['func-financeiro', 'func-tesouraria'], d.loja_id);
  gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: d.loja_id, origem: 'devolucao_financeiro', referencia_id: 'dev:' + d.id,
    titulo: `Confirmar reembolso — devolução ${d.codigo}`, descricao: `Confirme o recebimento do reembolso da devolução ${d.codigo} (${d.fornecedor_nome}).`, responsavel_id: fin, criado_por: req.usuario.id });
}

// Enviar para análise do fornecedor
router.post('/:id/analise', (req, res) => {
  const d = getDevol(req.params.id, req.usuario.empresa_id); if (!d) return res.status(404).json({ erro: 'Não encontrada.' });
  setStatus(d.id, 'analise_fornecedor'); hist(d.id, 'analise_fornecedor', d.status, 'Enviada para análise do fornecedor.', req);
  res.json({ ok: true });
});

// Rejeitada pelo fornecedor → Perdas + tarefa ao comprador (ciência)
router.post('/:id/rejeitar', (req, res) => {
  const d = getDevol(req.params.id, req.usuario.empresa_id); if (!d) return res.status(404).json({ erro: 'Não encontrada.' });
  setStatus(d.id, 'perdas');
  const comprador = colabPorFuncao(req.usuario.empresa_id, ['func-compras-beleza', 'func-compras-bemestar'], d.loja_id)
    || colabPorFuncao(req.usuario.empresa_id, ['func-supervisor', 'func-gestor'], d.loja_id);
  gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: d.loja_id, origem: 'devolucao_perda', referencia_id: 'dev:' + d.id,
    titulo: `Ciência de perda — devolução ${d.codigo}`,
    descricao: `A devolução ${d.codigo} (${d.fornecedor_nome}) foi REJEITADA pelo fornecedor — R$ ${(d.valor_total || 0).toFixed(2)} de perda. ${req.body?.obs || ''} Dê ciência.`,
    responsavel_id: comprador, urgente: 1, criado_por: req.usuario.id });
  hist(d.id, 'perdas', d.status, `Rejeitada pelo fornecedor. ${req.body?.obs || ''} Ciência solicitada ao comprador.`, req);
  res.json({ ok: true });
});

// Liberar coleta → status coleta + tarefa ao conferente (prazo = previsão de coleta)
router.post('/:id/liberar-coleta', (req, res) => {
  const d = getDevol(req.params.id, req.usuario.empresa_id); if (!d) return res.status(404).json({ erro: 'Não encontrada.' });
  const forn = db.prepare('SELECT previsao_coleta FROM devolucao_fornecedor WHERE devolucao_id=?').get(d.id) || {};
  const prev = req.body?.previsao_coleta || forn.previsao_coleta;
  let sla = null;
  if (prev) { const ms = new Date(prev + 'T23:59:59').getTime() - Date.now(); sla = ms > 0 ? Math.round(ms / 36e5) : 24; }
  setStatus(d.id, 'coleta');
  gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: d.loja_id, origem: 'devolucao_coleta', referencia_id: 'dev:' + d.id,
    titulo: `Coleta da devolução ${d.codigo}`,
    descricao: `Aguardar a coleta da devolução ${d.codigo} (${d.fornecedor_nome})${prev ? ' · previsão ' + prev : ''}. Ao coletar, registre a data e anexe o comprovante de recolhimento.`,
    responsavel_id: d.conferente_id, sla_horas: sla, urgente: sla != null && sla <= 24 ? 1 : 0, criado_por: req.usuario.id });
  hist(d.id, 'coleta', d.status, `Liberada para coleta${prev ? ' (previsão ' + prev + ')' : ''}. Tarefa enviada ao conferente.`, req);
  res.json({ ok: true });
});

// Registrar coleta (conferente conclui) → fecha tarefa coleta → encaminha reembolso
router.post('/:id/registrar-coleta', (req, res) => {
  const d = getDevol(req.params.id, req.usuario.empresa_id); if (!d) return res.status(404).json({ erro: 'Não encontrada.' });
  const b = req.body || {};
  if (!db.prepare('SELECT 1 FROM devolucao_fornecedor WHERE devolucao_id=?').get(d.id)) db.prepare('INSERT INTO devolucao_fornecedor (devolucao_id) VALUES (?)').run(d.id);
  db.prepare('UPDATE devolucao_fornecedor SET data_coleta=?, url_comprovante_coleta=? WHERE devolucao_id=?')
    .run(b.data_coleta || new Date().toISOString().slice(0, 10), b.url_comprovante_coleta || null, d.id);
  fecharTarefasDevol(d.id, 'devolucao_coleta');
  hist(d.id, null, null, `Coleta registrada${b.url_comprovante_coleta ? ' (comprovante anexado)' : ''}.`, req);
  setStatus(d.id, 'reembolso');
  if (d.reembolso_momento === 'antes') {
    tarefaFinanceiro(req, d);
    hist(d.id, 'reembolso', 'coleta', 'Reembolso já informado — tarefa enviada ao financeiro.', req);
  } else {
    const sup = colabPorFuncao(req.usuario.empresa_id, ['func-suporte'], d.loja_id);
    gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: d.loja_id, origem: 'devolucao_reembolso_info', referencia_id: 'dev:' + d.id,
      titulo: `Informar reembolso — devolução ${d.codigo}`, descricao: `Coleta concluída. Informe os dados de reembolso da devolução ${d.codigo} (${d.fornecedor_nome}) e envie ao financeiro.`, responsavel_id: sup, criado_por: req.usuario.id });
    hist(d.id, 'reembolso', 'coleta', 'Coleta concluída — tarefa ao suporte para informar o reembolso.', req);
  }
  res.json({ ok: true });
});

// Suporte terminou de informar reembolso (fluxo "depois") → gera tarefa financeiro
router.post('/:id/enviar-financeiro', (req, res) => {
  const d = getDevol(req.params.id, req.usuario.empresa_id); if (!d) return res.status(404).json({ erro: 'Não encontrada.' });
  tarefaFinanceiro(req, d);
  hist(d.id, null, null, 'Dados de reembolso enviados ao financeiro.', req);
  res.json({ ok: true });
});

// Financeiro confirma o pagamento → PAGO + Concluído
router.post('/:id/confirmar-pagamento', exigePerfil('Financeiro', 'Tesouraria', 'Gestor Geral', 'Diretor Geral', 'Suporte'), (req, res) => {
  const d = getDevol(req.params.id, req.usuario.empresa_id); if (!d) return res.status(404).json({ erro: 'Não encontrada.' });
  db.prepare(`UPDATE devolucoes SET pago=1, status='concluido', status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=?`).run(d.id);
  fecharTarefasDevol(d.id, 'devolucao_financeiro');
  hist(d.id, 'concluido', d.status, 'Reembolso confirmado pelo financeiro (PAGO).', req);
  res.json({ ok: true });
});

// Solicitar informação ao conferente (substitui "aguardando solicitante")
router.post('/:id/solicitar-conferente', (req, res) => {
  const d = getDevol(req.params.id, req.usuario.empresa_id); if (!d) return res.status(404).json({ erro: 'Não encontrada.' });
  gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: d.loja_id, origem: 'devolucao_info', referencia_id: 'dev:' + d.id,
    titulo: `Info da devolução ${d.codigo}`, descricao: (req.body?.texto || 'O suporte precisa de uma informação sobre esta devolução.'), responsavel_id: d.conferente_id, criado_por: req.usuario.id });
  hist(d.id, null, null, `Informação solicitada ao conferente: ${req.body?.texto || ''}`, req);
  res.json({ ok: true });
});

module.exports = router;
