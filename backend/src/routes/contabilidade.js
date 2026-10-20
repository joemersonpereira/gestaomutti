// contabilidade.js — Módulo Contabilidade (acesso do contador/contabilidade + direção).
// Fatia 1: Créditos a recuperar (crédito de devolução × abatimento no contas a pagar + NF vinculada).
// ERP SOMENTE LEITURA — nada é escrito no A7.
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { unisEmpresa, lojasEmpresa } = require('../lib/escopoCompras');
const { erpQuery } = require('../db/erp');
const { parseSpedHeader, soDigitos, classificarErroSped, referenciaErro, linhasDeErro, verificarSped, chavesEntradaSped } = require('../lib/spedArquivo');
const espiao = require('../lib/espiaoNfe');
const { validarSpedArquivo } = require('../lib/spedValidadorErp');
const contab = require('../lib/contabilidadeErp');
const cofre = require('../lib/cofreErp');
const auditoria = require('../lib/auditoriaErp');
const orcamento = require('../lib/orcamentoErp');

// Acesso ao módulo: contabilidade entra para ACESSAR (read-only). Lançar/editar é do financeiro/direção.
const PERFIS = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Contabilidade'];
const PERFIS_ESCRITA = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro'];
router.use(auth);
router.use(exigePerfil(...PERFIS));

// Lojas para o seletor (id do app + nome + id do ERP).
router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));

// Mapa erp_unidadenegocio_id → nome da loja, para rotular as linhas do ERP.
function mapaLojas(empresaId) {
  const m = {};
  lojasEmpresa(empresaId).forEach(l => { if (l.erp_unidadenegocio_id != null) m[Number(l.erp_unidadenegocio_id)] = l.nome; });
  return m;
}

function rotular(rows, mapa) {
  return rows.map(r => ({ ...r, loja: mapa[Number(r.loja_erp)] || r.loja_erp }));
}

// Planos de contas que não têm NF por natureza (folha/impostos/sócio…). termo = substring do nome.
function planosSemNf(emp) { return db.prepare(`SELECT termo, motivo FROM contabil_conta_sem_nf WHERE empresa_id=?`).all(emp); }
function motivoPlano(planoNome, lista) {
  if (!planoNome) return null;
  const p = String(planoNome).toLowerCase();
  const hit = (lista || []).find(x => p.includes(String(x.termo).toLowerCase()));
  return hit ? (hit.motivo || 'Não emite') : null;
}

// GET /contabilidade/creditos?loja=&saldo=aberto|todos&de=&ate=&busca=
router.get('/creditos', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ creditos: [] });
    const rows = await contab.creditos(unis, { saldo: req.query.saldo || 'aberto', de: req.query.de, ate: req.query.ate, busca: req.query.busca });
    res.json({ creditos: rotular(rows, mapaLojas(req.usuario.empresa_id)) });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para créditos.', detalhe: String(e.message || e) }); }
});

// GET /contabilidade/creditos/utilizacoes?loja=&de=&ate=&busca= — abatimentos + NF vinculada
router.get('/creditos/utilizacoes', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ utilizacoes: [] });
    const rows = await contab.utilizacoes(unis, { de: req.query.de, ate: req.query.ate, busca: req.query.busca });
    res.json({ utilizacoes: rotular(rows, mapaLojas(req.usuario.empresa_id)) });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para abatimentos.', detalhe: String(e.message || e) }); }
});

// GET /contabilidade/creditos/resumo?loja=
router.get('/creditos/resumo', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ resumo: [], total: { saldo_aberto: 0, utilizado: 0, n_aberto: 0 } });
    const rows = rotular(await contab.resumo(unis), mapaLojas(req.usuario.empresa_id));
    const total = rows.reduce((a, r) => ({
      saldo_aberto: a.saldo_aberto + Number(r.saldo_aberto || 0),
      utilizado: a.utilizado + Number(r.utilizado || 0),
      n_aberto: a.n_aberto + Number(r.n_aberto || 0),
    }), { saldo_aberto: 0, utilizado: 0, n_aberto: 0 });
    res.json({ resumo: rows, total });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

// ============================ BI / PAINEL (tela central) ============================
// % com nota × sem nota das despesas (contas a pagar), total e por loja, no período.
router.get('/bi', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp, req.query.loja);
    const vazio = { total: { n: 0, valor: 0, com_valor: 0, sem_valor: 0, nao_emite_valor: 0, pct: null }, por_loja: [], por_motivo: [] };
    if (!unis.length) return res.json(vazio);
    const mapa = mapaLojas(emp);
    const periodo = { de: req.query.de, ate: req.query.ate };
    // flags por fornecedor: emite_nf / motivo
    const flags = {}; db.prepare(`SELECT pessoa_id, emite_nf, motivo, consumo FROM contabil_fornecedor WHERE empresa_id=?`).all(emp).forEach(f => { flags[String(f.pessoa_id)] = f; });
    const planoList = planosSemNf(emp); // planos sem NF por natureza (folha/impostos/sócio…)
    // agregado por loja (total + com NF do ERP)
    const agg = await contab.biNfContaPagar(unis, periodo);
    const L = {}; // loja -> buckets
    const bucket = () => ({ valor: 0, com_valor: 0, sem_valor: 0, nao_emite_valor: 0, n: 0, com_n: 0 });
    for (const a of agg) { const loja = mapa[Number(a.loja_erp)] || String(a.loja_erp) || '—'; L[loja] = L[loja] || bucket(); L[loja].valor += Number(a.valor) || 0; L[loja].n += Number(a.n) || 0; L[loja].com_valor += Number(a.com_valor) || 0; L[loja].com_n += Number(a.com_n) || 0; }
    // sem NF por fornecedor → classifica em "não emite (por motivo)" x "sem nota (perda)"
    const porMotivo = {};
    const sem = await contab.semNfPorFornecedor(unis, periodo);
    // overlay: notas de serviço anexadas (viram com nota) — desconta do grupo (loja|pessoa)
    const anex = {};
    const locaisIds = db.prepare(`SELECT contapagar_id FROM contabil_nf_contapagar WHERE empresa_id=? AND validade_fiscal=1`).all(emp).map(r => r.contapagar_id);
    if (locaisIds.length) { const dd = await contab.contaPagarPorIds(locaisIds); for (const d of dd) { if (d.tem_nf_erp) continue; anex[d.loja_erp + '|' + d.pessoa_id] = (anex[d.loja_erp + '|' + d.pessoa_id] || 0) + (Number(d.valor) || 0); } }
    for (const g of sem) {
      const loja = mapa[Number(g.loja_erp)] || String(g.loja_erp) || '—';
      L[loja] = L[loja] || bucket();
      let v = Number(g.valor) || 0;
      const descAnex = anex[g.loja_erp + '|' + g.pessoa_id]; if (descAnex) { const usa = Math.min(descAnex, v); v -= usa; L[loja].com_valor += usa; anex[g.loja_erp + '|' + g.pessoa_id] -= usa; }
      if (v <= 0) continue;
      const f = flags[String(g.pessoa_id)];
      const motPlano = motivoPlano(g.plano, planoList);
      if (f && (f.emite_nf === 0 || f.consumo === 1)) { const mot = f.motivo || (f.consumo === 1 ? 'Conta de consumo' : 'Não emite'); L[loja].nao_emite_valor += v; porMotivo[mot] = (porMotivo[mot] || 0) + v; }
      else if (motPlano) { L[loja].nao_emite_valor += v; porMotivo[motPlano] = (porMotivo[motPlano] || 0) + v; }
      else { L[loja].sem_valor += v; }
    }
    // + Despesas da TESOURARIA (foto/comprovante do gerente): fiscal=1 → com nota; senão → sem nota (perda).
    try {
      const mapaLojaNome = {}; lojasEmpresa(emp).forEach(l => { mapaLojaNome[l.id] = l.nome; });
      let wt = 'empresa_id=? AND tipo=?'; const pt = [emp, 'despesa'];
      if (periodo.de) { pt.push(periodo.de); wt += ' AND data >= ?'; }
      if (periodo.ate) { pt.push(periodo.ate); wt += ' AND data <= ?'; }
      const lojasFiltro = new Set((req.query.loja ? lojasEmpresa(emp).filter(l => unis.includes(Number(l.erp_unidadenegocio_id))) : lojasEmpresa(emp)).map(l => l.id));
      db.prepare(`SELECT loja_id, fiscal, COALESCE(SUM(valor),0) v, COUNT(*) n FROM tesouraria_anexo WHERE ${wt} GROUP BY loja_id, fiscal`).all(...pt).forEach(row => {
        if (req.query.loja && !lojasFiltro.has(row.loja_id)) return;
        const loja = mapaLojaNome[row.loja_id] || row.loja_id || '—';
        L[loja] = L[loja] || bucket();
        const v = Number(row.v) || 0; L[loja].valor += v;
        if (row.fiscal === 1) L[loja].com_valor += v; else { L[loja].sem_valor += v; }
      });
    } catch (e) { /* tabela pode não existir ainda */ }
    Object.keys(L).forEach(k => { L[k].loja = k; });
    // pct fiscal = com / (com + sem) — só entre quem DEVERIA ter nota (exclui "não emite")
    const pct = b => (b.com_valor + b.sem_valor) > 0 ? Math.round(b.com_valor / (b.com_valor + b.sem_valor) * 1000) / 10 : null;
    const por_loja = Object.values(L).map(b => ({ loja: b.loja, valor: round2(b.valor), com_valor: round2(b.com_valor), sem_valor: round2(b.sem_valor), nao_emite_valor: round2(b.nao_emite_valor), pct: pct(b) })).sort((a, b) => b.sem_valor - a.sem_valor);
    const T = Object.values(L).reduce((a, b) => ({ valor: a.valor + b.valor, com_valor: a.com_valor + b.com_valor, sem_valor: a.sem_valor + b.sem_valor, nao_emite_valor: a.nao_emite_valor + b.nao_emite_valor }), { valor: 0, com_valor: 0, sem_valor: 0, nao_emite_valor: 0 });
    const total = { valor: round2(T.valor), com_valor: round2(T.com_valor), sem_valor: round2(T.sem_valor), nao_emite_valor: round2(T.nao_emite_valor), pct: pct(T) };
    const por_motivo = Object.entries(porMotivo).map(([motivo, valor]) => ({ motivo, valor: round2(valor) })).sort((a, b) => b.valor - a.valor);
    res.json({ total, por_loja, por_motivo });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o BI.', detalhe: String(e.message || e) }); }
});
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ===== Fornecedores: marcar se emite NF ou não (sócio/internacional/imposto…) =====
router.get('/fornecedores', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp, req.query.loja);
    if (!unis.length) return res.json({ fornecedores: [] });
    const lista = await contab.fornecedoresContaPagar(unis, { de: req.query.de, ate: req.query.ate });
    const flags = {}; db.prepare(`SELECT pessoa_id, emite_nf, motivo, consumo FROM contabil_fornecedor WHERE empresa_id=?`).all(emp).forEach(f => { flags[String(f.pessoa_id)] = f; });
    const nRec = {}; db.prepare(`SELECT pessoa_id, COUNT(*) n FROM contabil_fornecedor_recibo WHERE empresa_id=? GROUP BY pessoa_id`).all(emp).forEach(r => { nRec[String(r.pessoa_id)] = r.n; });
    res.json({ fornecedores: lista.map(f => { const fl = flags[String(f.pessoa_id)]; return { ...f, emite_nf: fl ? fl.emite_nf : 1, motivo: fl ? fl.motivo : null, consumo: fl ? (fl.consumo || 0) : 0, n_recibos: nRec[String(f.pessoa_id)] || 0 }; }) });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});
router.put('/fornecedores/:pessoaId', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const b = req.body || {};
  db.prepare(`INSERT INTO contabil_fornecedor (empresa_id,pessoa_id,nome,cnpj,emite_nf,motivo,consumo,atualizado_em) VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,pessoa_id) DO UPDATE SET nome=excluded.nome, cnpj=excluded.cnpj, emite_nf=excluded.emite_nf, motivo=excluded.motivo, consumo=excluded.consumo, atualizado_em=datetime('now')`)
    .run(req.usuario.empresa_id, req.params.pessoaId, b.nome || null, b.cnpj || null, b.emite_nf ? 1 : 0, b.motivo || null, b.consumo ? 1 : 0);
  res.json({ ok: true });
});

// ── Recibo/boleto do fornecedor que não emite NF tradicional (conta de consumo) ──────────────────
// O boleto traz os dados fiscais; guardamos o comprovante por fornecedor + competência (mês).
const b64Buf = d => { try { return Buffer.from(String(d || '').replace(/^data:[^;]+;base64,/, ''), 'base64'); } catch { return null; } };
router.get('/fornecedores/:pessoaId/recibos', (req, res) => {
  const rows = db.prepare(`SELECT id, competencia, nome, tipo_mime, tamanho, criado_em FROM contabil_fornecedor_recibo
    WHERE empresa_id=? AND pessoa_id=? ORDER BY competencia DESC, id DESC`).all(req.usuario.empresa_id, req.params.pessoaId);
  res.json({ recibos: rows });
});
router.post('/fornecedores/:pessoaId/recibos', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const b = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(b.competencia || '')) return res.status(400).json({ erro: 'Informe a competência (AAAA-MM).' });
  if (!b.dados) return res.status(400).json({ erro: 'Anexe o recibo/boleto (PDF ou foto).' });
  const dados = String(b.dados).slice(0, 8000000);
  const info = db.prepare(`INSERT INTO contabil_fornecedor_recibo (empresa_id,pessoa_id,competencia,nome,tipo_mime,dados,tamanho,usuario_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(req.usuario.empresa_id, req.params.pessoaId, b.competencia, b.nome || 'recibo', b.tipo_mime || null, dados, b64Buf(dados) ? b64Buf(dados).length : null, req.usuario.id);
  res.json({ ok: true, id: info.lastInsertRowid });
});
router.get('/fornecedores/recibo/:id', (req, res) => {
  const a = db.prepare(`SELECT nome, tipo_mime, dados FROM contabil_fornecedor_recibo WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a || !a.dados) return res.status(404).json({ erro: 'Recibo não encontrado.' });
  const buf = b64Buf(a.dados);
  if (!buf) return res.status(500).json({ erro: 'Arquivo corrompido.' });
  res.set('Content-Type', a.tipo_mime || 'application/octet-stream');
  res.set('Content-Disposition', 'inline; filename="' + String(a.nome || 'recibo').replace(/[^\w.\-]+/g, '_') + '"');
  res.send(buf);
});
router.delete('/fornecedores/recibo/:id', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  db.prepare(`DELETE FROM contabil_fornecedor_recibo WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
// RECHECAGEM: confere, mês a mês, se a despesa desse fornecedor (contas a pagar do ERP) tem o recibo na pasta.
// É pra conta de consumo (Luz/Água/Telefone) que emite mas o ERP não vincula a NF — a prova é o recibo anexado.
router.get('/fornecedores/:pessoaId/recheck', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp); // todas as lojas do grupo (a despesa pode estar em lojas diferentes)
    if (!unis.length) return res.json({ ok: true, meses: [], faltando: 0 });
    const rows = await erpQuery(`SELECT to_char(cp.dataemissao,'YYYY-MM') AS comp, COUNT(*) AS n, COALESCE(SUM(cp.valordocumento),0) AS valor
      FROM contapagar cp WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND CAST(cp.pessoaid AS text) = $2 AND cp.dataemissao IS NOT NULL
      GROUP BY 1 ORDER BY 1 DESC LIMIT 36`, [unis, String(req.params.pessoaId)]);
    const comRecibo = new Set(db.prepare(`SELECT DISTINCT competencia FROM contabil_fornecedor_recibo WHERE empresa_id=? AND pessoa_id=?`)
      .all(emp, req.params.pessoaId).map(r => r.competencia));
    const meses = rows.map(r => ({ competencia: r.comp, n: Number(r.n) || 0, valor: Number(r.valor) || 0, tem_recibo: comRecibo.has(r.comp) }));
    res.json({ ok: true, meses, faltando: meses.filter(m => !m.tem_recibo).length });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para a rechecagem.', detalhe: String(e.message || e) }); }
});

// ============================ EXTRATO DE CONTAS ============================
// GET /contabilidade/extrato/contas?loja= — contas (banco/cofre/orçamento) p/ o seletor
router.get('/extrato/contas', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ contas: [] });
    res.json({ contas: rotular(await contab.contasLista(unis), mapaLojas(req.usuario.empresa_id)) });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

// GET /contabilidade/extrato?loja=&de=&ate=&conta=&busca=&somentePagos=
router.get('/extrato', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ lancamentos: [] });
    const rows = await contab.extratoContas(unis, {
      de: req.query.de, ate: req.query.ate, conta: req.query.conta, busca: req.query.busca,
      somentePagos: req.query.somentePagos === '1',
    });
    // Mescla a nota de serviço anexada localmente (casos que não dão entrada no ERP / sem chave).
    const locais = {};
    db.prepare(`SELECT contapagar_id, validade_fiscal, nf_lida_numero, nf_lida_valor, (anexo_dados IS NOT NULL) AS tem_anexo FROM contabil_nf_contapagar WHERE empresa_id=?`)
      .all(req.usuario.empresa_id).forEach(l => { locais[String(l.contapagar_id)] = l; });
    // "Não emite NF" (não conta como perda): por fornecedor marcado OU por plano de contas (folha/impostos/sócio…).
    const naoEmite = {};
    db.prepare(`SELECT pessoa_id, motivo, consumo FROM contabil_fornecedor WHERE empresa_id=? AND (emite_nf=0 OR consumo=1)`)
      .all(req.usuario.empresa_id).forEach(f => { naoEmite[String(f.pessoa_id)] = f.motivo || (f.consumo ? 'Conta de consumo' : 'Não emite'); });
    const planoList = planosSemNf(req.usuario.empresa_id);
    const out = rows.map(r => {
      const loc = locais[String(r.id)];
      const temNfErp = !!r.nf_numero;
      const com_nf = temNfErp || (loc && !!loc.validade_fiscal);
      const motForn = (!com_nf && r.pessoa_id != null) ? naoEmite[String(r.pessoa_id)] : null;
      const motPlano = !com_nf ? motivoPlano(r.plano_contas, planoList) : null;
      const motivo_nao_emite = motForn || motPlano || null;
      return { ...r, nf_servico_anexo: loc ? !!loc.tem_anexo : false, nf_servico_valida: loc ? !!loc.validade_fiscal : false,
        com_nf, nao_emite: !!motivo_nao_emite, motivo_nao_emite };
    });
    res.json({ lancamentos: out });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o extrato.', detalhe: String(e.message || e) }); }
});

// GET /contabilidade/extrato/movimento?conta=&de=&ate= — extrato COMPLETO de uma conta (tudo)
router.get('/extrato/movimento', async (req, res) => {
  try {
    if (!req.query.conta) return res.json({ movimento: [] });
    const rows = await contab.movimentoConta(req.query.conta, { de: req.query.de, ate: req.query.ate });
    res.json({ movimento: rows });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o movimento da conta.', detalhe: String(e.message || e) }); }
});

// ===== Importar NFs da pasta do OneDrive sincronizada no PC (Caminho A: lê do disco) =====
const fsNode = require('fs'); const pathNode = require('path');
function cfgGet(emp, chave) { const r = db.prepare(`SELECT valor FROM contabil_config WHERE empresa_id=? AND chave=?`).get(emp, chave); return r ? r.valor : null; }
// Caminho base configurado (pasta raiz das NFs).
router.get('/nf-pasta/config', (req, res) => res.json({ base: cfgGet(req.usuario.empresa_id, 'nf_pasta_base') || '' }));
router.put('/nf-pasta/config', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  db.prepare(`INSERT INTO contabil_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')`).run(req.usuario.empresa_id, 'nf_pasta_base', req.body.base || '');
  res.json({ ok: true });
});
// Lista as subpastas (p/ o usuário navegar: ano, mês, loja) dentro do base + sub.
router.get('/nf-pasta/listar', (req, res) => {
  const base = cfgGet(req.usuario.empresa_id, 'nf_pasta_base');
  if (!base) return res.status(400).json({ erro: 'Configure o caminho da pasta primeiro.' });
  const dir = pathNode.join(base, req.query.sub || '');
  try {
    const itens = fsNode.readdirSync(dir, { withFileTypes: true });
    res.json({ pastas: itens.filter(i => i.isDirectory()).map(i => i.name).sort(), pdfs: itens.filter(i => i.isFile() && /\.pdf$/i.test(i.name)).map(i => i.name).sort() });
  } catch (e) { res.status(400).json({ erro: 'Pasta não encontrada: ' + dir }); }
});
// Varre a pasta (recursivo), lê cada PDF e tenta casar com um contas a pagar por CNPJ+valor.
// Helper reutilizado pelo /scan (lista) e pelo /nf-pasta/resumo (agregado p/ o BI).
async function varrerPasta(emp, { sub, de, ate, ocr } = {}) {
  const base = cfgGet(emp, 'nf_pasta_base');
  if (!base) { const e = new Error('Configure o caminho da pasta primeiro.'); e.semPasta = true; throw e; }
  const raiz = pathNode.join(base, sub || '');
  const lerNf = require('../lib/lerNf');
  const pdfs = [];
  const anda = (d) => { let it = []; try { it = fsNode.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const i of it) { if (pdfs.length >= 300) return; const p = pathNode.join(d, i.name); if (i.isDirectory()) anda(p); else if (/\.pdf$/i.test(i.name)) pdfs.push(p); } };
  anda(raiz);
  let cands = [];
  try { const unis = unisEmpresa(emp); cands = await contab.candidatosContaPagar(unis, { de, ate }); } catch (e) { cands = []; }
  const jaLig = new Set(db.prepare(`SELECT contapagar_id FROM contabil_nf_contapagar WHERE empresa_id=?`).all(emp).map(r => String(r.contapagar_id)));
  // Cache: o que já foi lido fica salvo por arquivo (revalida por tamanho+mtime) — não reprocessa a pasta toda.
  const getCache = db.prepare(`SELECT * FROM contabil_nf_pasta_cache WHERE empresa_id=? AND caminho=?`);
  const upCache = db.prepare(`INSERT INTO contabil_nf_pasta_cache (empresa_id,caminho,arquivo,pasta,tamanho,mtime,eh_nf,tem_texto,via_ocr,numero,cnpj,fornecedor,valor,lido_em)
    VALUES (@empresa_id,@caminho,@arquivo,@pasta,@tamanho,@mtime,@eh_nf,@tem_texto,@via_ocr,@numero,@cnpj,@fornecedor,@valor,datetime('now'))
    ON CONFLICT(empresa_id,caminho) DO UPDATE SET arquivo=excluded.arquivo,pasta=excluded.pasta,tamanho=excluded.tamanho,mtime=excluded.mtime,
      eh_nf=excluded.eh_nf,tem_texto=excluded.tem_texto,via_ocr=excluded.via_ocr,numero=excluded.numero,cnpj=excluded.cnpj,fornecedor=excluded.fornecedor,valor=excluded.valor,lido_em=datetime('now')`);
  const out = [];
  let lidosAgora = 0, doCache = 0;
  for (const p of pdfs) {
    let st; try { st = fsNode.statSync(p); } catch { st = null; }
    const tamanho = st ? st.size : 0, mtime = st ? Math.floor(st.mtimeMs) : 0;
    let r = null, cached = false;
    const c = getCache.get(emp, p);
    // Já lido e arquivo não mudou → usa o cache (pula pdf-parse/OCR). Se ainda não lemos por OCR e agora pediram, relê.
    if (c && Number(c.tamanho) === tamanho && Number(c.mtime) === mtime && !(ocr && !c.via_ocr && !c.tem_texto)) {
      r = { ehNf: !!c.eh_nf, temTexto: !!c.tem_texto, via_ocr: !!c.via_ocr, numero: c.numero, cnpj: c.cnpj, fornecedor: c.fornecedor, valor: c.valor };
      cached = true; doCache++;
    } else {
      // ocr=true → PDF-imagem (sem texto) é lido pela visão do Claude (valor/CNPJ/fornecedor).
      try { r = await lerNf.lerArquivoPdf(p, { ocr: !!ocr }); } catch { r = { ehNf: false, temTexto: false }; }
      lidosAgora++;
      try { upCache.run({ empresa_id: emp, caminho: p, arquivo: pathNode.basename(p), pasta: pathNode.relative(base, pathNode.dirname(p)), tamanho, mtime,
        eh_nf: r.ehNf ? 1 : 0, tem_texto: r.temTexto ? 1 : 0, via_ocr: r.via_ocr ? 1 : 0, numero: r.numero || null, cnpj: r.cnpj || null, fornecedor: r.fornecedor || null, valor: r.valor != null ? r.valor : null }); } catch { /* ok */ }
    }
    const cnpjNf = (r.cnpj || '').replace(/\D/g, '');
    let match = null;
    if (r.valor != null) {
      const perto = cands.filter(c2 => Math.abs(Number(c2.valor) - Number(r.valor)) < 0.02 && !jaLig.has(String(c2.id)));
      match = perto.find(c2 => cnpjNf && c2.cnpj === cnpjNf) || perto[0] || null;
    }
    out.push({ caminho: p, arquivo: pathNode.basename(p), pasta: pathNode.relative(base, pathNode.dirname(p)),
      ehNf: r.ehNf, temTexto: r.temTexto, via_ocr: !!r.via_ocr, do_cache: cached, numero: r.numero || null, cnpj: r.cnpj || null, fornecedor: r.fornecedor || null, valor: r.valor != null ? r.valor : null,
      match: match ? { contapagar_id: match.id, fornecedor: match.fornecedor, valor: match.valor, numerodocumento: match.numerodocumento, data: match.data } : null,
      ja_vinculado: match ? jaLig.has(String(match.id)) : false });
  }
  return { raiz, itens: out, lidosAgora, doCache };
}
router.get('/nf-pasta/scan', async (req, res) => {
  try {
    const { raiz, itens, lidosAgora, doCache } = await varrerPasta(req.usuario.empresa_id, { sub: req.query.sub, de: req.query.de, ate: req.query.ate, ocr: req.query.ocr === '1' });
    res.json({ raiz, total: itens.length, itens, lidosAgora, doCache });
  } catch (e) { res.status(e.semPasta ? 400 : 400).json({ erro: e.message || 'Pasta inválida.' }); }
});
// Resumo agregado da pasta p/ o BI: quantos PDFs, quantos casaram com título sem nota (recuperável) etc.
router.get('/nf-pasta/resumo', async (req, res) => {
  try {
    const { itens } = await varrerPasta(req.usuario.empresa_id, { de: req.query.de, ate: req.query.ate });
    const nf = itens.filter(i => i.ehNf);
    const casam = itens.filter(i => i.match && !i.ja_vinculado); // casaram e dá pra vincular (vira "com nota")
    const semCruz = itens.filter(i => i.ehNf && !i.match && !i.ja_vinculado); // é NF mas não achou título
    const semTexto = itens.filter(i => !i.temTexto); // PDF imagem (precisa OCR)
    const recuperavel = casam.reduce((a, i) => a + Number(i.match.valor || 0), 0);
    res.json({
      total_pdfs: itens.length, total_nf: nf.length,
      casaram: casam.length, recuperavel,
      sem_cruzamento: semCruz.length, sem_texto: semTexto.length,
    });
  } catch (e) { res.status(400).json({ erro: e.message || 'Pasta indisponível.', semPasta: !!e.semPasta }); }
});
// Busca títulos do contas a pagar p/ VÍNCULO MANUAL (quando a NF não casou automático).
// Filtra por fornecedor (texto) e/ou valor aproximado; ignora os já vinculados.
router.get('/nf-pasta/titulos', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp, req.query.loja);
    if (!unis.length) return res.json({ titulos: [] });
    const cands = await contab.candidatosContaPagar(unis, { de: req.query.de, ate: req.query.ate });
    const jaLig = new Set(db.prepare(`SELECT contapagar_id FROM contabil_nf_contapagar WHERE empresa_id=?`).all(emp).map(r => String(r.contapagar_id)));
    const q = String(req.query.q || '').trim().toLowerCase();
    const valor = req.query.valor != null && req.query.valor !== '' ? Number(req.query.valor) : null;
    let out = cands.filter(c => !jaLig.has(String(c.id)));
    if (q) out = out.filter(c => String(c.fornecedor || '').toLowerCase().includes(q) || String(c.numerodocumento || '').toLowerCase().includes(q));
    if (valor != null && !isNaN(valor)) out = out.filter(c => Math.abs(Number(c.valor) - valor) <= Math.max(0.5, valor * 0.05)); // ±5% ou 50 centavos
    res.json({ titulos: out.slice(0, 60) });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para buscar títulos.', detalhe: String(e.message || e) }); }
});

// Vincula um PDF da pasta a um contas a pagar (lê e grava em contabil_nf_contapagar).
router.post('/nf-pasta/vincular', exigePerfil(...PERFIS_ESCRITA), async (req, res) => {
  const emp = req.usuario.empresa_id; const base = cfgGet(emp, 'nf_pasta_base');
  const { caminho, contapagar_id } = req.body || {};
  if (!base || !caminho || !contapagar_id) return res.status(400).json({ erro: 'Dados incompletos.' });
  if (!pathNode.resolve(caminho).startsWith(pathNode.resolve(base))) return res.status(400).json({ erro: 'Arquivo fora da pasta configurada.' });
  const lerNf = require('../lib/lerNf');
  let r; try { r = await lerNf.lerArquivoPdf(caminho); } catch (e) { return res.status(400).json({ erro: 'Não foi possível ler o PDF.' }); }
  db.prepare(`INSERT INTO contabil_nf_contapagar (id,empresa_id,contapagar_id,anexo_nome,anexo_tipo,anexo_dados,nf_lida_numero,nf_lida_cnpj,nf_lida_valor,validade_fiscal,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,contapagar_id) DO UPDATE SET anexo_nome=excluded.anexo_nome, anexo_tipo=excluded.anexo_tipo, anexo_dados=excluded.anexo_dados,
      nf_lida_numero=excluded.nf_lida_numero, nf_lida_cnpj=excluded.nf_lida_cnpj, nf_lida_valor=excluded.nf_lida_valor, validade_fiscal=excluded.validade_fiscal`)
    .run(uuidv4(), emp, contapagar_id, pathNode.basename(caminho), 'application/pdf', ('data:application/pdf;base64,' + r.base64).slice(0, 8000000),
      r.numero || null, r.cnpj || null, r.valor != null ? r.valor : null, r.ehNf ? 1 : 0, req.usuario.id);
  res.json({ ok: true, ehNf: r.ehNf, numero: r.numero, valor: r.valor });
});

// Nota (de serviço) anexada a um contas a pagar do ERP — para os casos sem entrada/chave.
// POST /contabilidade/extrato/nf/:cpId  body {anexo_nome,anexo_tipo,anexo_dados} → salva e já tenta ler.
router.post('/extrato/nf/:cpId', exigePerfil(...PERFIS_ESCRITA), async (req, res) => {
  const emp = req.usuario.empresa_id; const b = req.body || {};
  if (!b.anexo_dados) return res.status(400).json({ erro: 'Envie o PDF da nota.' });
  const lerNf = require('../lib/lerNf');
  const r = await lerNf.lerComprovante(b.anexo_dados);
  db.prepare(`INSERT INTO contabil_nf_contapagar (id,empresa_id,contapagar_id,anexo_nome,anexo_tipo,anexo_dados,nf_lida_numero,nf_lida_cnpj,nf_lida_valor,validade_fiscal,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,contapagar_id) DO UPDATE SET anexo_nome=excluded.anexo_nome, anexo_tipo=excluded.anexo_tipo, anexo_dados=excluded.anexo_dados,
      nf_lida_numero=excluded.nf_lida_numero, nf_lida_cnpj=excluded.nf_lida_cnpj, nf_lida_valor=excluded.nf_lida_valor, validade_fiscal=excluded.validade_fiscal`)
    .run(uuidv4(), emp, req.params.cpId, b.anexo_nome || 'nota.pdf', b.anexo_tipo || null, String(b.anexo_dados).slice(0, 8000000),
      r.numero || null, r.cnpj || null, r.valor != null ? r.valor : null, r.ehNf ? 1 : 0, req.usuario.id);
  res.json({ ok: true, ehNf: r.ehNf, numero: r.numero, cnpj: r.cnpj, valor: r.valor, temTexto: r.temTexto, aviso: r.temTexto ? null : 'PDF sem texto (imagem) — precisaria de OCR de imagem.' });
});
// GET anexo da nota do contapagar
router.get('/extrato/nf/:cpId', (req, res) => {
  const a = db.prepare(`SELECT anexo_nome AS nome, anexo_tipo AS tipo, anexo_dados AS dados, nf_lida_numero, nf_lida_valor, validade_fiscal FROM contabil_nf_contapagar WHERE empresa_id=? AND contapagar_id=?`).get(req.usuario.empresa_id, req.params.cpId);
  if (!a) return res.status(404).json({ erro: 'Sem nota anexada.' });
  res.json(a);
});
router.delete('/extrato/nf/:cpId', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  db.prepare(`DELETE FROM contabil_nf_contapagar WHERE empresa_id=? AND contapagar_id=?`).run(req.usuario.empresa_id, req.params.cpId);
  res.json({ ok: true });
});

// GET /contabilidade/extrato/lote?mov= — títulos quitados num lote de pagamento
router.get('/extrato/lote', async (req, res) => {
  try {
    if (!req.query.mov) return res.json({ titulos: [] });
    res.json({ titulos: await contab.loteDetalhe(req.query.mov) });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

// ============================ COFRE & SALDO EM CAIXA 30/31 ============================
// Fundo fixo por loja (local): o que sempre fica na loja; abatido no saldo em caixa 30/31.
function mapaFundoFixo(empresaId) {
  const m = {};
  db.prepare(`SELECT loja_id, valor FROM contabil_fundo_fixo WHERE empresa_id=?`).all(empresaId).forEach(r => { m[r.loja_id] = Number(r.valor) || 0; });
  return m;
}
// erp_unidadenegocio_id → id do app (p/ casar o fundo fixo, que é por loja do app).
function mapaErpParaApp(empresaId) {
  const m = {};
  lojasEmpresa(empresaId).forEach(l => { if (l.erp_unidadenegocio_id != null) m[Number(l.erp_unidadenegocio_id)] = l.id; });
  return m;
}

// GET /contabilidade/cofre/saldo?loja=&ate=YYYY-MM-DD (ate = fim de mês p/ "saldo 30/31"; vazio = agora)
router.get('/cofre/saldo', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp, req.query.loja);
    if (!unis.length) return res.json({ saldos: [], total: { saldo: 0, fundo_fixo: 0, caixa_liquido: 0 } });
    // ate (exclusivo): se vier uma data, usa o 1º dia do mês seguinte dela? Não — usa fim daquele dia.
    const ateISO = req.query.ate ? new Date(req.query.ate + 'T23:59:59').toISOString() : null;
    const rows = await cofre.saldo(unis, ateISO);
    const mapaNome = mapaLojas(emp), erpApp = mapaErpParaApp(emp), ff = mapaFundoFixo(emp);
    const saldos = rows.map(r => {
      const appId = erpApp[Number(r.loja_erp)];
      const fundo = ff[appId] || 0;
      const saldo = Number(r.saldo) || 0;
      return { ...r, loja: mapaNome[Number(r.loja_erp)] || r.loja_erp, loja_id: appId, fundo_fixo: fundo, caixa_liquido: saldo - fundo };
    });
    const total = saldos.reduce((a, r) => ({ saldo: a.saldo + Number(r.saldo || 0), fundo_fixo: a.fundo_fixo + Number(r.fundo_fixo || 0), caixa_liquido: a.caixa_liquido + Number(r.caixa_liquido || 0) }), { saldo: 0, fundo_fixo: 0, caixa_liquido: 0 });
    res.json({ saldos, total });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o cofre.', detalhe: String(e.message || e) }); }
});

// GET /contabilidade/cofre/extrato?loja=&de=&ate=
router.get('/cofre/extrato', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp, req.query.loja);
    if (!unis.length) return res.json({ extrato: [] });
    const rows = await cofre.extrato(unis, { de: req.query.de, ate: req.query.ate });
    res.json({ extrato: rotular(rows, mapaLojas(emp)) });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

// GET /contabilidade/cofre/fechamento?loja=&de=&ate=
router.get('/cofre/fechamento', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp, req.query.loja);
    if (!unis.length) return res.json({ fechamento: [] });
    const rows = await cofre.fechamentoDiario(unis, { de: req.query.de, ate: req.query.ate });
    const mapaNome = mapaLojas(emp);
    const fechamento = rows.map(r => {
      const retido = Number(r.entrou_caixa || 0) - Number(r.depositado_banco || 0) - Number(r.despesas || 0);
      return { ...r, loja: mapaNome[Number(r.loja_erp)] || r.loja_erp, retido };
    });
    res.json({ fechamento });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

// Fundo fixo (config local): GET e PUT (escrita restrita).
router.get('/cofre/fundo-fixo', (req, res) => {
  res.json({ fundos: db.prepare(`SELECT loja_id, valor FROM contabil_fundo_fixo WHERE empresa_id=?`).all(req.usuario.empresa_id) });
});
router.put('/cofre/fundo-fixo', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const { loja_id, valor } = req.body || {};
  if (!loja_id) return res.status(400).json({ erro: 'Informe a loja.' });
  db.prepare(`INSERT INTO contabil_fundo_fixo (empresa_id,loja_id,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,loja_id) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now')`)
    .run(req.usuario.empresa_id, loja_id, Number(valor) || 0);
  res.json({ mensagem: 'Fundo fixo atualizado.' });
});

// ============================ CARTÃO-DESPESAS / CONTA ORÇAMENTÁRIA ============================
// Mapa id do app → nome da loja (o cartão-despesa guarda o id do app, não o do ERP).
function mapaLojaAppNome(empresaId) {
  const m = {};
  lojasEmpresa(empresaId).forEach(l => { m[l.id] = l.nome; });
  return m;
}
// ============================ EMPRÉSTIMOS (local + anexos + parcelas) ============================
// Soma a data isso 'YYYY-MM-DD' de n meses (preservando dia quando possível).
function addMeses(iso, n) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const base = new Date(Date.UTC(y, (m - 1) + n, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimo));
  return base.toISOString().slice(0, 10);
}

// (Re)gera as parcelas de um empréstimo a partir de nº parcelas / 1ª data / valor. Preserva o
// status "pago" das parcelas que já existiam (pelo número) para não perder baixa feita.
function gerarParcelas(emp) {
  const antigas = {};
  db.prepare(`SELECT numero, pago, data_pagamento FROM contabil_emprestimo_parcela WHERE emprestimo_id=?`).all(emp.id)
    .forEach(p => { antigas[p.numero] = p; });
  db.prepare(`DELETE FROM contabil_emprestimo_parcela WHERE emprestimo_id=?`).run(emp.id);
  const n = Math.max(1, Number(emp.num_parcelas) || 1);
  const ins = db.prepare(`INSERT INTO contabil_emprestimo_parcela (id,emprestimo_id,numero,vencimento,valor,pago,data_pagamento) VALUES (?,?,?,?,?,?,?)`);
  for (let i = 1; i <= n; i++) {
    const a = antigas[i] || {};
    ins.run(uuidv4(), emp.id, i, addMeses(emp.data_primeira_parcela, i - 1), Number(emp.valor_parcela) || 0, a.pago || 0, a.data_pagamento || null);
  }
}

const CAMPOS_EMP = ['loja_id', 'descricao', 'credor', 'tipo', 'valor_principal', 'taxa_juros', 'num_parcelas', 'valor_parcela', 'data_contratacao', 'data_primeira_parcela', 'status', 'observacao'];

// GET /contabilidade/emprestimos?loja=&status=
router.get('/emprestimos', (req, res) => {
  const emp = req.usuario.empresa_id;
  let q = `SELECT e.*, l.nome AS loja_nome,
      (SELECT COUNT(*) FROM contabil_emprestimo_parcela p WHERE p.emprestimo_id=e.id) AS n_parcelas,
      (SELECT COUNT(*) FROM contabil_emprestimo_parcela p WHERE p.emprestimo_id=e.id AND p.pago=1) AS pagas,
      (SELECT COALESCE(SUM(p.valor),0) FROM contabil_emprestimo_parcela p WHERE p.emprestimo_id=e.id AND p.pago=0) AS saldo_devedor,
      (SELECT COUNT(*) FROM contabil_emprestimo_anexo a WHERE a.emprestimo_id=e.id) AS n_anexos
    FROM contabil_emprestimo e LEFT JOIN lojas l ON l.id=e.loja_id
    WHERE e.empresa_id=?`;
  const p = [emp];
  if (req.query.loja) { q += ` AND e.loja_id=?`; p.push(req.query.loja); }
  if (req.query.status) { q += ` AND e.status=?`; p.push(req.query.status); }
  q += ` ORDER BY e.data_contratacao DESC, e.criado_em DESC`;
  res.json({ emprestimos: db.prepare(q).all(...p) });
});

// POST /contabilidade/emprestimos — lança e gera as parcelas
router.post('/emprestimos', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const id = uuidv4();
  const b = req.body || {};
  db.prepare(`INSERT INTO contabil_emprestimo (id,empresa_id,loja_id,descricao,credor,tipo,valor_principal,taxa_juros,num_parcelas,valor_parcela,data_contratacao,data_primeira_parcela,status,observacao,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.usuario.empresa_id, b.loja_id || null, b.descricao || null, b.credor || null, b.tipo || 'bancario',
    Number(b.valor_principal) || 0, Number(b.taxa_juros) || 0, Number(b.num_parcelas) || 1, Number(b.valor_parcela) || 0,
    b.data_contratacao || null, b.data_primeira_parcela || null, b.status || 'ativo', b.observacao || null, req.usuario.id);
  const emp = db.prepare(`SELECT * FROM contabil_emprestimo WHERE id=?`).get(id);
  // Se o usuário revisou/ajustou as parcelas na tela antes de gerar, usa essas; senão gera automático.
  if (Array.isArray(b.parcelas) && b.parcelas.length) {
    const ins = db.prepare(`INSERT INTO contabil_emprestimo_parcela (id,emprestimo_id,numero,vencimento,valor,pago,data_pagamento) VALUES (?,?,?,?,?,0,NULL)`);
    b.parcelas.forEach((p, i) => ins.run(uuidv4(), id, Number(p.numero) || (i + 1), p.vencimento || null, Number(p.valor) || 0));
  } else {
    gerarParcelas(emp);
  }
  res.status(201).json({ id, mensagem: 'Empréstimo lançado.' });
});

// PUT /contabilidade/emprestimos/:id — edita (regenera parcelas se mudou nº/1ª data/valor)
router.put('/emprestimos/:id', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const emp = db.prepare(`SELECT * FROM contabil_emprestimo WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
  const b = req.body || {};
  const set = CAMPOS_EMP.filter(c => b[c] !== undefined);
  if (set.length) {
    db.prepare(`UPDATE contabil_emprestimo SET ${set.map(c => c + '=?').join(',')}, atualizado_em=datetime('now') WHERE id=?`)
      .run(...set.map(c => b[c]), emp.id);
  }
  const novo = db.prepare(`SELECT * FROM contabil_emprestimo WHERE id=?`).get(emp.id);
  if (b.num_parcelas !== undefined || b.data_primeira_parcela !== undefined || b.valor_parcela !== undefined) gerarParcelas(novo);
  res.json({ mensagem: 'Empréstimo atualizado.' });
});

// DELETE /contabilidade/emprestimos/:id
router.delete('/emprestimos/:id', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const emp = db.prepare(`SELECT id FROM contabil_emprestimo WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
  db.prepare(`DELETE FROM contabil_emprestimo_parcela WHERE emprestimo_id=?`).run(emp.id);
  db.prepare(`DELETE FROM contabil_emprestimo_anexo WHERE emprestimo_id=?`).run(emp.id);
  db.prepare(`DELETE FROM contabil_emprestimo WHERE id=?`).run(emp.id);
  res.json({ mensagem: 'Empréstimo removido.' });
});

// GET /contabilidade/emprestimos/:id/parcelas
router.get('/emprestimos/:id/parcelas', (req, res) => {
  const emp = db.prepare(`SELECT id FROM contabil_emprestimo WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
  res.json({ parcelas: db.prepare(`SELECT * FROM contabil_emprestimo_parcela WHERE emprestimo_id=? ORDER BY numero`).all(emp.id) });
});

// PUT /contabilidade/emprestimos/:id/parcela/:numero — baixa (pago) e/ou ajuste de vencimento/valor.
// body: { pago?, data_pagamento?, vencimento?, valor? } — só os campos enviados são alterados.
router.put('/emprestimos/:id/parcela/:numero', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const emp = db.prepare(`SELECT id FROM contabil_emprestimo WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
  const numero = Number(req.params.numero);
  if (req.body.vencimento !== undefined) db.prepare(`UPDATE contabil_emprestimo_parcela SET vencimento=? WHERE emprestimo_id=? AND numero=?`).run(req.body.vencimento || null, emp.id, numero);
  if (req.body.valor !== undefined) db.prepare(`UPDATE contabil_emprestimo_parcela SET valor=? WHERE emprestimo_id=? AND numero=?`).run(Number(req.body.valor) || 0, emp.id, numero);
  if (req.body.pago !== undefined) {
    const pago = req.body.pago ? 1 : 0;
    db.prepare(`UPDATE contabil_emprestimo_parcela SET pago=?, data_pagamento=? WHERE emprestimo_id=? AND numero=?`)
      .run(pago, pago ? (req.body.data_pagamento || new Date().toISOString().slice(0, 10)) : null, emp.id, numero);
  }
  // Quita o empréstimo quando todas as parcelas estiverem pagas.
  const falta = db.prepare(`SELECT COUNT(*) n FROM contabil_emprestimo_parcela WHERE emprestimo_id=? AND pago=0`).get(emp.id).n;
  db.prepare(`UPDATE contabil_emprestimo SET status=?, atualizado_em=datetime('now') WHERE id=? AND status<>'cancelado'`).run(falta ? 'ativo' : 'quitado', emp.id);
  res.json({ mensagem: 'Parcela atualizada.', quitado: !falta });
});

// Anexos
router.get('/emprestimos/:id/anexos', (req, res) => {
  res.json({ anexos: db.prepare(`SELECT id, nome, tipo, criado_em FROM contabil_emprestimo_anexo WHERE emprestimo_id=? ORDER BY criado_em`).all(req.params.id) });
});
router.get('/emprestimo-anexo/:anexoId', (req, res) => {
  const a = db.prepare(`SELECT nome, tipo, dados FROM contabil_emprestimo_anexo WHERE id=?`).get(req.params.anexoId);
  if (!a) return res.status(404).json({ erro: 'Anexo não encontrado.' });
  res.json(a);
});
router.post('/emprestimos/:id/anexo', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const emp = db.prepare(`SELECT id FROM contabil_emprestimo WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
  const { nome, tipo, dados } = req.body || {};
  if (!dados) return res.status(400).json({ erro: 'Arquivo vazio.' });
  const id = uuidv4();
  db.prepare(`INSERT INTO contabil_emprestimo_anexo (id,emprestimo_id,nome,tipo,dados) VALUES (?,?,?,?,?)`)
    .run(id, emp.id, nome || 'documento', tipo || null, String(dados).slice(0, 8000000));
  res.status(201).json({ id, mensagem: 'Anexo adicionado.' });
});
router.delete('/emprestimo-anexo/:anexoId', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  db.prepare(`DELETE FROM contabil_emprestimo_anexo WHERE id=?`).run(req.params.anexoId);
  res.json({ mensagem: 'Anexo removido.' });
});

// ===== ORÇAMENTO (conta "Orçamento - <loja>" do ERP) =====
// Resumo por loja: verba (créditos do escritório) × gasto (débitos do gerente) × saldo.
router.get('/orcamento/resumo', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ linhas: [], total: { verba: 0, gasto: 0, saldo: 0 } });
    const mapaErp = {};
    lojasEmpresa(req.usuario.empresa_id).forEach(l => { mapaErp[String(l.erp_unidadenegocio_id)] = l.nome; });
    const rows = await orcamento.orcamentoResumo(unis, { de: req.query.de, ate: req.query.ate });
    const linhas = rows.map(r => {
      const verba = Number(r.verba || 0), gasto = Number(r.gasto || 0);
      return { ...r, loja: mapaErp[String(r.loja_erp)] || r.conta, verba, gasto, saldo: Number(r.saldo || 0),
        pct_gasto: verba > 0 ? Math.round((gasto / verba) * 1000) / 10 : null };
    });
    const total = linhas.reduce((a, l) => ({ verba: a.verba + l.verba, gasto: a.gasto + l.gasto, saldo: a.saldo + l.saldo }), { verba: 0, gasto: 0, saldo: 0 });
    res.json({ linhas, total });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o orçamento.', detalhe: String(e.message || e) }); }
});

router.get('/orcamento/movimento', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ movimento: [] });
    const rows = await orcamento.orcamentoMovimento(unis, { de: req.query.de, ate: req.query.ate, contas: req.query.contas });
    res.json({ movimento: rows });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o movimento do orçamento.', detalhe: String(e.message || e) }); }
});

router.get('/orcamento/plano', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ planos: [] });
    const rows = await orcamento.orcamentoPorPlano(unis, { de: req.query.de, ate: req.query.ate });
    res.json({ planos: rows });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para as categorias do orçamento.', detalhe: String(e.message || e) }); }
});

// ===== AUDITORIA =====
// (A) Lançamentos MANUAIS na conta corrente (Lançamento de Entrada/Saída) — o que foi digitado à mão
//     na conciliação, em vez de vir como baixa automática (cartão) ou baixa de contas a pagar.
router.get('/auditoria/manuais', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ lancamentos: [] });
    const mapaErp = {};
    lojasEmpresa(req.usuario.empresa_id).forEach(l => { mapaErp[String(l.erp_unidadenegocio_id)] = l.nome; });
    const rows = await auditoria.lancamentosManuais(unis, { de: req.query.de, ate: req.query.ate, contas: req.query.contas, semCartao: req.query.semCartao === '1', plano: req.query.plano });
    const out = rows.map(r => ({ ...r, loja: mapaErp[String(r.loja_erp)] || r.conta }));
    res.json({ lancamentos: out });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para auditoria de lançamentos.', detalhe: String(e.message || e) }); }
});

// Planos de contas disponíveis nos lançamentos manuais (p/ o filtro; inclui "sem plano").
router.get('/auditoria/manuais/planos', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ planos: [] });
    const rows = await auditoria.lancamentosManuaisPlanos(unis, { de: req.query.de, ate: req.query.ate, contas: req.query.contas, semCartao: req.query.semCartao === '1' });
    res.json({ planos: rows });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para os planos.', detalhe: String(e.message || e) }); }
});

// (B) Conciliação de cartão: % conciliado × pendentes e atraso, por operadora.
router.get('/auditoria/conciliacao', async (req, res) => {
  try {
    const rows = await auditoria.conciliacaoTempo({ de: req.query.de, ate: req.query.ate });
    const tot = rows.reduce((a, r) => {
      a.itens += Number(r.itens || 0); a.conciliados += Number(r.conciliados || 0);
      a.pendentes += Number(r.pendentes || 0); a.valor += Number(r.valor || 0);
      a.valor_pendente += Number(r.valor_pendente || 0); return a;
    }, { itens: 0, conciliados: 0, pendentes: 0, valor: 0, valor_pendente: 0 });
    tot.pct = tot.itens ? Math.round((tot.conciliados / tot.itens) * 1000) / 10 : 0;
    res.json({ operadoras: rows, total: tot });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para auditoria de conciliação.', detalhe: String(e.message || e) }); }
});

// (C) Conciliação BANCÁRIA por conta/banco: % conciliado × pendentes.
router.get('/auditoria/bancaria', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ contas: [], total: { linhas: 0, conciliadas: 0, pendentes: 0, pct: 0, valor_pendente: 0 } });
    const mapaErp = {};
    lojasEmpresa(req.usuario.empresa_id).forEach(l => { mapaErp[String(l.erp_unidadenegocio_id)] = l.nome; });
    const rows = (await auditoria.conciliacaoBancaria(unis, { de: req.query.de, ate: req.query.ate }))
      .map(r => ({ ...r, loja: mapaErp[String(r.loja_erp)] || r.conta }));
    const tot = rows.reduce((a, r) => {
      a.linhas += Number(r.linhas || 0); a.conciliadas += Number(r.conciliadas || 0);
      a.pendentes += Number(r.pendentes || 0); a.valor_pendente += Number(r.valor_pendente || 0); return a;
    }, { linhas: 0, conciliadas: 0, pendentes: 0, valor_pendente: 0 });
    tot.pct = tot.linhas ? Math.round((tot.conciliadas / tot.linhas) * 1000) / 10 : 0;
    res.json({ contas: rows, total: tot });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para conciliação bancária.', detalhe: String(e.message || e) }); }
});

// Índice de conciliação bancária: todas as contas + dias úteis sem conciliar + nota 0–100.
router.get('/auditoria/bancaria/indice', async (req, res) => {
  try {
    const { diasUteisEntre } = require('../lib/feriados');
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ contas: [], total: { indice: null } });
    const mapaErp = {};
    lojasEmpresa(req.usuario.empresa_id).forEach(l => { mapaErp[String(l.erp_unidadenegocio_id)] = l.nome; });
    const extras = new Set(db.prepare(`SELECT data FROM contabil_feriado WHERE empresa_id=?`).all(req.usuario.empresa_id).map(r => r.data));
    const pontos = Number(cfgGet(req.usuario.empresa_id, 'indice_pontos_por_dia')) || 15; // calibrável (sem valor fixo)
    const hoje = new Date().toISOString().slice(0, 10);
    const rows = (await auditoria.conciliacaoBancariaIndice(unis)).map(r => {
      const base = r.conciliado_ate || r.ultima_linha || null;
      // dias úteis desde a última conciliação até hoje (0 se em dia ou conciliado no futuro).
      const atraso = base ? (diasUteisEntre(base, hoje, extras) || 0) : null;
      // nota: 100 em dia; cada dia útil de atraso tira `pontos`; sem nenhuma conciliação = 0.
      const indice = r.conciliado_ate == null ? (Number(r.linhas) ? 0 : null) : Math.max(0, 100 - (atraso || 0) * pontos);
      return { ...r, loja: mapaErp[String(r.loja_erp)] || r.conta, dias_uteis_atraso: atraso, indice };
    });
    const comLinhas = rows.filter(r => Number(r.linhas) > 0 && r.indice != null);
    const indiceGeral = comLinhas.length ? Math.round(comLinhas.reduce((a, r) => a + r.indice, 0) / comLinhas.length) : null;
    const emDia = comLinhas.filter(r => (r.dias_uteis_atraso || 0) === 0).length;
    res.json({ contas: rows, total: { indice: indiceGeral, contas: comLinhas.length, em_dia: emDia, hoje, pontos_por_dia: pontos } });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o índice.', detalhe: String(e.message || e) }); }
});

// Calibração do índice: pontos descontados por dia útil de atraso (padrão 15).
router.put('/auditoria/indice-config', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const pontos = Math.max(1, Math.min(100, Number(req.body.pontos) || 15));
  db.prepare(`INSERT INTO contabil_config (empresa_id,chave,valor) VALUES (?,?,?) ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`)
    .run(req.usuario.empresa_id, 'indice_pontos_por_dia', String(pontos));
  res.json({ ok: true, pontos });
});

router.get('/auditoria/bancaria/pendentes', async (req, res) => {
  try {
    const unis = unisEmpresa(req.usuario.empresa_id, req.query.loja);
    if (!unis.length) return res.json({ pendentes: [] });
    const rows = await auditoria.conciliacaoBancariaPendentes(unis, { de: req.query.de, ate: req.query.ate, conta: req.query.conta });
    res.json({ pendentes: rows });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para pendentes bancários.', detalhe: String(e.message || e) }); }
});

// Drill-down do BI: o que compõe uma fatia (bucket = 'com' | 'perda' | <motivo>), por fornecedor+plano.
router.get('/bi/detalhe', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp, req.query.loja);
    const bucket = String(req.query.bucket || '');
    if (!unis.length || !bucket) return res.json({ itens: [], total: 0 });
    const mapa = mapaLojas(emp);
    const periodo = { de: req.query.de, ate: req.query.ate };
    let itens = [];
    if (bucket === 'com') {
      const rows = await contab.comNfPorFornecedor(unis, periodo);
      itens = rows.map(g => ({ loja: mapa[Number(g.loja_erp)] || String(g.loja_erp), fornecedor: g.fornecedor, plano: g.plano, n: Number(g.n) || 0, valor: Math.round((Number(g.valor) || 0) * 100) / 100 }));
    } else {
      const flags = {}; db.prepare(`SELECT pessoa_id, emite_nf, motivo, consumo FROM contabil_fornecedor WHERE empresa_id=?`).all(emp).forEach(f => { flags[String(f.pessoa_id)] = f; });
      const planoList = planosSemNf(emp);
      const anex = {};
      const locaisIds = db.prepare(`SELECT contapagar_id FROM contabil_nf_contapagar WHERE empresa_id=? AND validade_fiscal=1`).all(emp).map(r => r.contapagar_id);
      if (locaisIds.length) { const dd = await contab.contaPagarPorIds(locaisIds); for (const d of dd) { if (d.tem_nf_erp) continue; anex[d.loja_erp + '|' + d.pessoa_id] = (anex[d.loja_erp + '|' + d.pessoa_id] || 0) + (Number(d.valor) || 0); } }
      const sem = await contab.semNfPorFornecedor(unis, periodo);
      for (const g of sem) {
        let v = Number(g.valor) || 0;
        const k = g.loja_erp + '|' + g.pessoa_id; if (anex[k]) { const usa = Math.min(anex[k], v); v -= usa; anex[k] -= usa; }
        if (v <= 0) continue;
        const f = flags[String(g.pessoa_id)];
        const mot = (f && (f.emite_nf === 0 || f.consumo === 1)) ? (f.motivo || (f.consumo === 1 ? 'Conta de consumo' : 'Não emite')) : motivoPlano(g.plano, planoList);
        const alvo = bucket === 'perda' ? !mot : (mot === bucket);
        if (!alvo) continue;
        itens.push({ loja: mapa[Number(g.loja_erp)] || String(g.loja_erp), fornecedor: g.fornecedor, plano: g.plano, n: Number(g.n) || 0, valor: Math.round(v * 100) / 100 });
      }
    }
    itens.sort((a, b) => b.valor - a.valor);
    const total = Math.round(itens.reduce((a, g) => a + g.valor, 0) * 100) / 100;
    res.json({ itens: itens.slice(0, 500), total, bucket });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para o detalhe.', detalhe: String(e.message || e) }); }
});

// ===== SEM NOTA (PERDA) — tela de apuração/classificação =====
// Grupos de títulos SEM NF que HOJE contam como perda (fornecedor não marcado + plano não listado).
// Agrupado por fornecedor + plano, pra classificar na hora (por fornecedor ou por plano).
router.get('/perda', async (req, res) => {
  try {
    const emp = req.usuario.empresa_id;
    const unis = unisEmpresa(emp, req.query.loja);
    if (!unis.length) return res.json({ grupos: [], total: 0 });
    const mapa = mapaLojas(emp);
    const flags = {}; db.prepare(`SELECT pessoa_id, emite_nf, consumo FROM contabil_fornecedor WHERE empresa_id=?`).all(emp).forEach(f => { flags[String(f.pessoa_id)] = f; });
    const planoList = planosSemNf(emp);
    const periodo = { de: req.query.de, ate: req.query.ate };
    const sem = await contab.semNfPorFornecedor(unis, periodo);
    // overlay: notas de serviço anexadas já contam como nota — desconta do grupo loja|pessoa.
    const anex = {};
    const locaisIds = db.prepare(`SELECT contapagar_id FROM contabil_nf_contapagar WHERE empresa_id=? AND validade_fiscal=1`).all(emp).map(r => r.contapagar_id);
    if (locaisIds.length) { const dd = await contab.contaPagarPorIds(locaisIds); for (const d of dd) { if (d.tem_nf_erp) continue; anex[d.loja_erp + '|' + d.pessoa_id] = (anex[d.loja_erp + '|' + d.pessoa_id] || 0) + (Number(d.valor) || 0); } }
    const grupos = [];
    for (const g of sem) {
      let v = Number(g.valor) || 0;
      const k = g.loja_erp + '|' + g.pessoa_id; if (anex[k]) { const usa = Math.min(anex[k], v); v -= usa; anex[k] -= usa; }
      if (v <= 0) continue;
      const f = flags[String(g.pessoa_id)];
      if (f && (f.emite_nf === 0 || f.consumo === 1)) continue;  // já marcado não-emite / conta de consumo (fornecedor)
      if (motivoPlano(g.plano, planoList)) continue;   // já classificado (plano)
      grupos.push({ loja: mapa[Number(g.loja_erp)] || String(g.loja_erp), pessoa_id: g.pessoa_id, fornecedor: g.fornecedor, plano: g.plano, n: Number(g.n) || 0, valor: Math.round(v * 100) / 100 });
    }
    grupos.sort((a, b) => b.valor - a.valor);
    const total = Math.round(grupos.reduce((a, g) => a + g.valor, 0) * 100) / 100;
    res.json({ grupos, total });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível para a apuração da perda.', detalhe: String(e.message || e) }); }
});

// Planos de contas sem NF (classificação por plano) — lista/cadastra/remove.
router.get('/planos-sem-nf', (req, res) => res.json({ planos: db.prepare(`SELECT termo, motivo FROM contabil_conta_sem_nf WHERE empresa_id=? ORDER BY motivo, termo`).all(req.usuario.empresa_id) }));
router.post('/planos-sem-nf', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const { termo, motivo } = req.body || {};
  if (!termo) return res.status(400).json({ erro: 'Informe o plano/termo.' });
  db.prepare(`INSERT INTO contabil_conta_sem_nf (empresa_id,termo,motivo) VALUES (?,?,?) ON CONFLICT(empresa_id,termo) DO UPDATE SET motivo=excluded.motivo`)
    .run(req.usuario.empresa_id, termo, motivo || 'Não emite');
  res.status(201).json({ ok: true });
});
router.delete('/planos-sem-nf/:termo', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  db.prepare(`DELETE FROM contabil_conta_sem_nf WHERE empresa_id=? AND termo=?`).run(req.usuario.empresa_id, req.params.termo);
  res.json({ ok: true });
});

// ===== FERIADOS (cadastro; usados no índice de conciliação) =====
// Lista os calculados (nacionais + Bahia) do ano atual e do próximo + os personalizados cadastrados.
router.get('/feriados', (req, res) => {
  const { feriadosBR } = require('../lib/feriados');
  const ano = new Date().getFullYear();
  const nomeCalc = { '01-01': 'Confraternização', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '07-02': 'Independência da Bahia', '09-07': 'Independência', '10-12': 'N. Sra. Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal' };
  const calc = [];
  [ano, ano + 1].forEach(y => { [...feriadosBR(y)].sort().forEach(d => calc.push({ data: d, nome: nomeCalc[d.slice(5)] || 'Feriado (móvel)', tipo: 'calculado' })); });
  const custom = db.prepare(`SELECT data, nome FROM contabil_feriado WHERE empresa_id=? ORDER BY data`).all(req.usuario.empresa_id).map(r => ({ ...r, tipo: 'cadastrado' }));
  res.json({ calculados: calc, cadastrados: custom });
});
router.post('/feriados', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const { data, nome } = req.body || {};
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ erro: 'Informe a data (AAAA-MM-DD).' });
  db.prepare(`INSERT INTO contabil_feriado (empresa_id,data,nome) VALUES (?,?,?) ON CONFLICT(empresa_id,data) DO UPDATE SET nome=excluded.nome`)
    .run(req.usuario.empresa_id, data, nome || 'Feriado');
  res.status(201).json({ ok: true });
});
router.delete('/feriados/:data', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  db.prepare(`DELETE FROM contabil_feriado WHERE empresa_id=? AND data=?`).run(req.usuario.empresa_id, req.params.data);
  res.json({ ok: true });
});

// ── SPED / EFD: repositório pra contabilidade baixar (o Alpha gera, a fiscal sobe, o contador pega) ──
const TIPOS_SPED = ['fiscal', 'contribuicoes', 'ecd', 'outro'];
const ETAPAS_SPED = ['envio', 'retorno', 'corrigido', 'final'];
// CNPJ (14 dígitos, do registro 0000) → loja do app
function cnpjParaLoja(empresaId, cnpj) {
  const d = soDigitos(cnpj); if (d.length !== 14) return null;
  const l = lojasEmpresa(empresaId).find(x => soDigitos(x.cnpj) === d);
  return l ? l.id : null;
}
// lista (metadados, sem o conteúdo) — acessível a todos os perfis do módulo (inclui Contabilidade)
router.get('/sped', (req, res) => {
  const { competencia, loja, tipo } = req.query;
  const w = ['empresa_id=?']; const p = [req.usuario.empresa_id];
  if (competencia) { w.push('competencia=?'); p.push(competencia); }
  if (loja) { w.push('loja_id=?'); p.push(loja); }
  if (tipo) { w.push('tipo=?'); p.push(tipo); }
  const mapLoja = {}; lojasEmpresa(req.usuario.empresa_id).forEach(l => { mapLoja[l.id] = l.nome; });
  const rows = db.prepare(`SELECT id, loja_id, competencia, tipo, etapa, nome, tipo_mime, tamanho, obs, usuario_id, fonte, criado_em
    FROM contabil_sped WHERE ${w.join(' AND ')} ORDER BY competencia DESC, tipo, criado_em DESC`).all(...p);
  res.json({ ok: true, arquivos: rows.map(r => ({ ...r, loja_nome: r.loja_id ? (mapLoja[r.loja_id] || r.loja_id) : 'Grupo (consolidado)' })) });
});
// competências que já têm arquivo (pro seletor)
router.get('/sped/competencias', (req, res) => {
  const rows = db.prepare(`SELECT competencia, COUNT(*) n FROM contabil_sped WHERE empresa_id=? GROUP BY competencia ORDER BY competencia DESC`).all(req.usuario.empresa_id);
  res.json({ ok: true, competencias: rows });
});
// "lê" o arquivo e devolve o que detectou (competência/tipo/loja) sem salvar — pra UI pré-preencher
router.post('/sped/detectar', (req, res) => {
  const { conteudo } = req.body || {};
  if (!conteudo) return res.status(400).json({ erro: 'Anexe o arquivo.' });
  let buf; try { buf = Buffer.from(conteudo, 'base64'); } catch { return res.status(400).json({ erro: 'Conteúdo inválido.' }); }
  const h = parseSpedHeader(buf);
  if (!h.ok) return res.json({ ok: false, erro: h.erro });
  res.json({ ok: true, ...h, loja: cnpjParaLoja(req.usuario.empresa_id, h.cnpj) });
});

// Insere um SPED no repositório com auto-detecção (competência/tipo/loja vêm do próprio arquivo se
// não forem informados) e dedupe por hash. Usado pelo upload manual E pelo vigia de pasta.
function ingerirSped(empresaId, { conteudo, competencia, loja, tipo, etapa, nome, obs, usuarioId, fonte }) {
  if (!conteudo) return { status: 400, body: { erro: 'Anexe o arquivo gerado no Alpha.' } };
  const buf = Buffer.from(conteudo, 'base64');
  const det = parseSpedHeader(buf);
  const comp = competencia && /^\d{4}-\d{2}$/.test(competencia) ? competencia : (det.ok ? det.competencia : null);
  if (!comp) return { status: 400, body: { erro: det.erro || 'Não consegui descobrir a competência — informe AAAA-MM.' } };
  const t = TIPOS_SPED.includes(tipo) ? tipo : (det.ok ? det.tipo : 'fiscal');
  // etapa: usa a informada; senão deduz da finalidade do arquivo (original→envio, substituto→corrigido)
  const e = ETAPAS_SPED.includes(etapa) ? etapa : (det.ok && det.etapa ? det.etapa : 'envio');
  const lojaId = loja || (det.ok ? cnpjParaLoja(empresaId, det.cnpj) : null);
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  const dup = db.prepare('SELECT id FROM contabil_sped WHERE empresa_id=? AND hash=?').get(empresaId, hash);
  if (dup) return { status: 200, body: { ok: true, id: dup.id, duplicado: true } };
  const dados = buf.toString('base64');
  const info = db.prepare(`INSERT INTO contabil_sped (empresa_id, loja_id, competencia, tipo, etapa, nome, tipo_mime, dados, tamanho, obs, usuario_id, hash, fonte)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(empresaId, lojaId || null, comp, t, e, nome || `sped-${t}-${comp}.txt`, 'text/plain', dados, buf.length, obs || null, usuarioId || null, hash, fonte || 'manual');
  // verificação automática: só pras categorias que a contabilidade já devolveu antes (banco de correção ensina o que procurar)
  let autoDetectado = 0;
  try {
    const cats = new Set(db.prepare(`SELECT DISTINCT categoria FROM contabil_sped_erro WHERE empresa_id=? AND origem='contabilidade'`).all(empresaId).map(r => r.categoria));
    if (cats.size) {
      const achados = verificarSped(buf, cats);
      const ins = db.prepare(`INSERT INTO contabil_sped_erro (empresa_id, competencia, tipo, loja_id, categoria, registro, descricao, referencia, status, origem, sped_id, usuario_id)
        VALUES (?,?,?,?,?,?,?,?, 'aberto','sistema', ?, ?)`);
      const jaExiste = db.prepare(`SELECT 1 FROM contabil_sped_erro WHERE empresa_id=? AND competencia=? AND categoria=? AND IFNULL(referencia,'')=IFNULL(?,'')`);
      const tx = db.transaction(() => {
        for (const a of achados) {
          if (jaExiste.get(empresaId, comp, a.categoria, a.referencia || '')) continue;
          ins.run(empresaId, comp, t, lojaId || null, a.categoria, a.registro || null, a.descricao, a.referencia || null, info.lastInsertRowid, usuarioId || null);
          autoDetectado++;
        }
      });
      tx();
    }
  } catch (e) { /* verificação é best-effort; não bloqueia o upload */ }
  return { status: 201, body: { ok: true, id: info.lastInsertRowid, competencia: comp, tipo: t, loja: lojaId, detectado: det.ok, autoDetectado } };
}

// upload do arquivo gerado no Alpha (equipe fiscal/direção)
router.post('/sped', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const r = ingerirSped(req.usuario.empresa_id, { ...req.body, usuarioId: req.usuario.id, fonte: 'manual' });
  res.status(r.status).json(r.body);
});

// Ingestão pelo VIGIA de pasta (robô local que observa onde o Alpha salva o SPED). Mesmo perfil de
// escrita; o robô usa um usuário do sistema. Auto-detecta tudo e ignora duplicado.
router.post('/sped/ingerir', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  const r = ingerirSped(req.usuario.empresa_id, { ...req.body, usuarioId: req.usuario.id, fonte: req.body.fonte || 'pasta' });
  res.status(r.status).json(r.body);
});
// download
router.get('/sped/:id/arquivo', (req, res) => {
  const r = db.prepare(`SELECT nome, tipo_mime, dados FROM contabil_sped WHERE empresa_id=? AND id=?`).get(req.usuario.empresa_id, Number(req.params.id));
  if (!r || !r.dados) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  res.setHeader('Content-Type', r.tipo_mime || 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${(r.nome || 'sped.txt').replace(/[^\w.\-]/g, '_')}"`);
  res.send(Buffer.from(r.dados, 'base64'));
});
router.delete('/sped/:id', exigePerfil(...PERFIS_ESCRITA), (req, res) => {
  db.prepare(`DELETE FROM contabil_sped WHERE empresa_id=? AND id=?`).run(req.usuario.empresa_id, Number(req.params.id));
  res.json({ ok: true });
});

// ── Retorno da contabilidade → banco de correção ────────────────────────────────────────────
// A contabilidade devolve as pendências (texto colado OU arquivo). O sistema quebra em linhas,
// classifica cada erro (categoria + registro SPED) e guarda — vira histórico que ensina o
// verificador automático. Acessível a todo o módulo (a contabilidade é a fonte).
router.post('/sped/retorno', (req, res) => {
  const { competencia, tipo, loja, texto, conteudo, nome, sped_id, obs } = req.body || {};
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) return res.status(400).json({ erro: 'Informe a competência (AAAA-MM).' });
  let linhas = [];
  if (texto && texto.trim()) {
    linhas = linhasDeErro(texto);
  } else if (conteudo) {
    let buf; try { buf = Buffer.from(conteudo, 'base64'); } catch { buf = null; }
    if (buf) {
      const ehExcel = /\.xlsx?$/i.test(nome || '') || (buf[0] === 0x50 && buf[1] === 0x4B) || (buf[0] === 0xD0 && buf[1] === 0xCF);
      if (ehExcel) {
        try {
          const wb = XLSX.read(buf, { type: 'buffer' });
          for (const aba of wb.SheetNames) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, blankrows: false, defval: '' });
            for (const row of rows) {
              const linha = (row || []).map(c => String(c == null ? '' : c).trim()).filter(Boolean).join(' - ');
              if (linha) linhas.push(linha);
            }
          }
        } catch (e) { return res.status(400).json({ erro: 'Não consegui ler a planilha: ' + e.message }); }
      } else {
        linhas = linhasDeErro(buf.toString('latin1')); // csv/txt
      }
    }
  }
  // remove cabeçalhos óbvios da planilha
  linhas = linhas.filter(l => !/^(descri[çc][aã]o|erro|pend[eê]ncia|item|registro|nota|observa)/i.test(l.trim()) || l.length > 40);
  if (!linhas.length) return res.status(400).json({ erro: 'Cole a lista de erros ou anexe o arquivo (Excel/CSV/texto) de retorno.' });
  const t = TIPOS_SPED.includes(tipo) ? tipo : 'fiscal';
  const ins = db.prepare(`INSERT INTO contabil_sped_erro (empresa_id, competencia, tipo, loja_id, categoria, registro, descricao, referencia, status, origem, sped_id, obs, usuario_id)
    VALUES (?,?,?,?,?,?,?,?, 'aberto','contabilidade', ?, ?, ?)`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const l of linhas) {
      const { categoria, registro } = classificarErroSped(l);
      ins.run(req.usuario.empresa_id, competencia, t, loja || null, categoria, registro || null, l, referenciaErro(l), sped_id || null, obs || null, req.usuario.id);
      n++;
    }
  });
  tx();
  res.status(201).json({ ok: true, inseridos: n });
});
// lista de erros (banco de correção), com filtros
router.get('/sped/erros', (req, res) => {
  const { competencia, status, categoria, tipo } = req.query;
  const w = ['empresa_id=?']; const p = [req.usuario.empresa_id];
  if (competencia) { w.push('competencia=?'); p.push(competencia); }
  if (status) { w.push('status=?'); p.push(status); }
  if (categoria) { w.push('categoria=?'); p.push(categoria); }
  if (tipo) { w.push('tipo=?'); p.push(tipo); }
  const mapLoja = {}; lojasEmpresa(req.usuario.empresa_id).forEach(l => { mapLoja[l.id] = l.nome; });
  const rows = db.prepare(`SELECT * FROM contabil_sped_erro WHERE ${w.join(' AND ')} ORDER BY competencia DESC, categoria, id DESC`).all(...p);
  res.json({ ok: true, erros: rows.map(r => ({ ...r, loja_nome: r.loja_id ? (mapLoja[r.loja_id] || r.loja_id) : '—' })) });
});
// adicionar um erro manual
router.post('/sped/erro', (req, res) => {
  const { competencia, tipo, loja, descricao, categoria, registro, referencia } = req.body || {};
  if (!competencia || !descricao) return res.status(400).json({ erro: 'Informe competência e descrição.' });
  const cls = categoria ? { categoria, registro } : classificarErroSped(descricao);
  const info = db.prepare(`INSERT INTO contabil_sped_erro (empresa_id, competencia, tipo, loja_id, categoria, registro, descricao, referencia, status, origem, usuario_id)
    VALUES (?,?,?,?,?,?,?,?, 'aberto','manual', ?)`)
    .run(req.usuario.empresa_id, competencia, TIPOS_SPED.includes(tipo) ? tipo : 'fiscal', loja || null, cls.categoria, cls.registro || null, descricao, referencia || referenciaErro(descricao), req.usuario.id);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});
// mudar status (corrigido / ignorado / reabrir)
router.patch('/sped/erro/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['aberto', 'corrigido', 'ignorado'].includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
  db.prepare(`UPDATE contabil_sped_erro SET status=?, corrigido_em=CASE WHEN ?='corrigido' THEN datetime('now') ELSE NULL END WHERE empresa_id=? AND id=?`)
    .run(status, status, req.usuario.empresa_id, Number(req.params.id));
  res.json({ ok: true });
});
router.delete('/sped/erro/:id', (req, res) => {
  db.prepare(`DELETE FROM contabil_sped_erro WHERE empresa_id=? AND id=?`).run(req.usuario.empresa_id, Number(req.params.id));
  res.json({ ok: true });
});
// banco de correção agregado: por categoria, com recorrência (quantas competências) e status
router.get('/sped/banco-correcao', (req, res) => {
  const rows = db.prepare(`SELECT categoria, registro,
      COUNT(*) total,
      SUM(CASE WHEN status='aberto' THEN 1 ELSE 0 END) abertos,
      SUM(CASE WHEN status='corrigido' THEN 1 ELSE 0 END) corrigidos,
      COUNT(DISTINCT competencia) competencias,
      MIN(competencia) desde, MAX(competencia) ate
    FROM contabil_sped_erro WHERE empresa_id=? GROUP BY categoria, registro ORDER BY total DESC`).all(req.usuario.empresa_id);
  const tot = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='aberto' THEN 1 ELSE 0 END) abertos, COUNT(DISTINCT competencia) competencias FROM contabil_sped_erro WHERE empresa_id=?`).get(req.usuario.empresa_id);
  res.json({ ok: true, categorias: rows, total: tot });
});

// ── Validador do SPED: confere o arquivo (C170) e aponta CFOP/CST errado antes de enviar ────────
router.post('/sped/:id/validar', (req, res) => {
  try {
    const row = db.prepare('SELECT dados FROM contabil_sped WHERE empresa_id=? AND id=?').get(req.usuario.empresa_id, Number(req.params.id));
    if (!row || !row.dados) return res.status(404).json({ erro: 'Arquivo SPED não encontrado.' });
    res.json(validarSpedArquivo(Buffer.from(row.dados, 'base64')));
  } catch (e) { res.status(500).json({ ok: false, erro: e.message }); }
});

// ── NF não lançada SEM precisar do SPED: cruza Espião (SEFAZ) × Alpha (notafiscal) direto ───────
// Por loja: lista o que a SEFAZ tem recebido no período e marca o que NÃO está no Alpha (por chave).
router.get('/sped/entradas-faltantes', async (req, res) => {
  try {
    if (!espiao.habilitado()) return res.status(400).json({ erro: 'Integração Espião não configurada (.env).' });
    const { competencia } = req.query;
    if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) return res.status(400).json({ erro: 'Informe a competência (AAAA-MM).' });
    const loja = req.query.loja;
    const cnpjMap = {}; db.prepare('SELECT id, cnpj FROM lojas WHERE empresa_id=?').all(req.usuario.empresa_id).forEach(r => { cnpjMap[r.id] = r.cnpj; });
    const lojas = lojasEmpresa(req.usuario.empresa_id)
      .map(l => ({ ...l, cnpj: cnpjMap[l.id] }))
      .filter(l => (!loja || l.id === loja) && soDigitos(l.cnpj || '').length === 14 && l.erp_unidadenegocio_id != null);
    if (!lojas.length) return res.status(400).json({ erro: 'Escolha uma loja com CNPJ cadastrado (14 dígitos).' });
    const [ano, mes] = competencia.split('-').map(Number);
    const ini = `${competencia}-01`, fim = `${competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
    const saida = [];
    for (const l of lojas) {
      const cnpj = soDigitos(l.cnpj);
      const sef = await espiao.nfeResumoPeriodo({ cnpjCpf: cnpj, dataInicial: ini, dataFinal: fim, emitidaRecebida: 0, modelo: 55 });
      if (!sef.ok) return res.status(502).json({ erro: `Espião (${l.nome}): ${sef.erro}` });
      // chaves já lançadas no Alpha pra essa unidade (janela ampla pra não acusar nota lançada noutro mês)
      const rows = await erpQuery(`SELECT DISTINCT regexp_replace(chaveacesso,'[^0-9]','','g') AS chave
        FROM notafiscal WHERE unidadenegocioid = $1 AND chaveacesso IS NOT NULL
          AND datahoraemissao >= ($2::date - interval '90 days') AND datahoraemissao < ($3::date + interval '40 days')`,
        [Number(l.erp_unidadenegocio_id), ini, fim]);
      const noAlpha = new Set(rows.map(r => r.chave));
      const canc = s => /cancel/i.test(String(s || ''));
      const vistas = new Set();
      const faltantes = (sef.notas || []).filter(n => {
        if (canc(n.situacao)) return false;
        const ch = soDigitos(n.chaveAcesso);
        if (!ch || noAlpha.has(ch) || vistas.has(ch)) return false; // não lançada no Alpha e ainda não listada
        vistas.add(ch); return true;
      });
      const hoje = Date.now();
      const diasMin = Math.max(0, Number(req.query.diasMin) || 0); // filtro de urgência (só com mais de X dias)
      let lista = faltantes.map(n => {
        const emi = n.dataEmissao ? new Date(String(n.dataEmissao).slice(0, 10)) : null;
        const dias = emi ? Math.floor((hoje - emi.getTime()) / 86400000) : null;
        return { chave: soDigitos(n.chaveAcesso), numero: n.numeroNfe, emitente: n.nomeEmitente, cnpjEmitente: n.cnpjCpfEmitente, data: n.dataEmissao, valor: n.valorTotal, situacao: n.situacao, possuiXml: n.possuiXml, dias };
      }).sort((a, b) => (b.dias || 0) - (a.dias || 0)); // mais antiga (mais urgente) primeiro
      if (diasMin) lista = lista.filter(n => (n.dias || 0) >= diasMin);
      saida.push({ loja: l.nome, loja_id: l.id, cnpj, sefaz: (sef.notas || []).length, noAlpha: noAlpha.size, faltantes: lista, urgentes: lista.filter(n => (n.dias || 0) >= 7).length });
    }
    const totalFaltantes = saida.reduce((a, s) => a + s.faltantes.length, 0);
    const totalUrgentes = saida.reduce((a, s) => a + (s.urgentes || 0), 0);
    res.json({ ok: true, competencia, totalFaltantes, totalUrgentes, lojas: saida });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// baixa o XML de uma nota (pela chave) direto do Espião — sob demanda, só quando o usuário pede
router.get('/espiao/xml/:chave', async (req, res) => {
  try {
    if (!espiao.habilitado()) return res.status(400).json({ erro: 'Integração Espião não configurada (.env).' });
    const r = await espiao.xmlPorChave(req.params.chave);
    if (!r.ok) return res.status(502).json({ erro: r.erro });
    const d = r.dados || {};
    const xml = (typeof d === 'string') ? d : (d.xml || d.mensagem || d.xmlNfe || (d.dados && d.dados.xml) || '');
    if (!xml || String(xml).indexOf('<') < 0) return res.status(404).json({ erro: 'XML não disponível para essa nota.' });
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="' + soDigitos(req.params.chave) + '.xml"');
    res.send(String(xml));
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── cache dos relatórios que leem o Alpha (migração 299) ─────────────────────────────────────────
// Mês fechado guarda pra sempre; mês atual vale 1h (recalcula sozinho) ou no botão 🔄 (?forcar=1).
const BI_CACHE_TTL_MIN = 60;
const mesCorrente = () => new Date().toISOString().slice(0, 7);
const agoraUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
function biCacheLer(empresaId, chave, competencia, forcar) {
  if (forcar) return null;
  const row = db.prepare('SELECT payload, atualizado_em FROM contabil_bi_cache WHERE empresa_id=? AND chave=?').get(empresaId, chave);
  if (!row) return null;
  // mês atual (ou futuro): só vale se foi atualizado nos últimos BI_CACHE_TTL_MIN minutos
  if (competencia >= mesCorrente()) {
    const idadeMin = (Date.now() - new Date(row.atualizado_em.replace(' ', 'T') + 'Z').getTime()) / 60000;
    if (!(idadeMin <= BI_CACHE_TTL_MIN)) return null;
  }
  try { return { payload: JSON.parse(row.payload), atualizado_em: row.atualizado_em }; } catch { return null; }
}
function biCacheGravar(empresaId, chave, competencia, payload) {
  const at = agoraUtc();
  db.prepare(`INSERT INTO contabil_bi_cache (empresa_id, chave, competencia, payload, atualizado_em) VALUES (?,?,?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET payload=excluded.payload, competencia=excluded.competencia, atualizado_em=excluded.atualizado_em`)
    .run(empresaId, chave, competencia, JSON.stringify(payload), at);
  return at;
}

// ── BI: lead time entre a EMISSÃO do XML e a ENTRADA efetiva no estoque (Alpha) ──────────────────
router.get('/espiao/lead-estoque', async (req, res) => {
  try {
    const { competencia } = req.query;
    if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) return res.status(400).json({ erro: 'Informe a competência (AAAA-MM).' });
    const loja = req.query.loja;
    const lojas = lojasEmpresa(req.usuario.empresa_id).filter(l => (!loja || l.id === loja) && l.erp_unidadenegocio_id != null);
    if (!lojas.length) return res.status(400).json({ erro: 'Escolha uma loja válida.' });
    const chave = `lead-estoque|${competencia}|${loja || 'todas'}`;
    const cache = biCacheLer(req.usuario.empresa_id, chave, competencia, req.query.forcar === '1');
    if (cache) return res.json({ ...cache.payload, cache: { atualizado_em: cache.atualizado_em, deCache: true } });
    const [ano, mes] = competencia.split('-').map(Number);
    const ini = `${competencia}-01`, fim = `${competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
    const saida = [];
    for (const l of lojas) {
      const uni = Number(l.erp_unidadenegocio_id);
      const st = await erpQuery(`WITH e AS (
        SELECT EXTRACT(EPOCH FROM (datahoraentrada - datahoraemissao))/86400.0 AS dias
        FROM notafiscal WHERE unidadenegocioid=$1 AND fornecedorid IS NOT NULL
          AND datahoraentrada >= $2::date AND datahoraentrada < ($3::date + interval '1 day')
          AND datahoraemissao IS NOT NULL AND datahoraentrada >= datahoraemissao)
        SELECT COUNT(*) n, ROUND(AVG(dias)::numeric,2) media,
          ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY dias))::numeric,2) mediana,
          COUNT(*) FILTER (WHERE dias<1) ate1, COUNT(*) FILTER (WHERE dias>=1 AND dias<3) d13,
          COUNT(*) FILTER (WHERE dias>=3 AND dias<7) d37, COUNT(*) FILTER (WHERE dias>=7 AND dias<15) d715,
          COUNT(*) FILTER (WHERE dias>=15) m15, ROUND(MAX(dias)::numeric,1) pior
        FROM e`, [uni, ini, fim]);
      const piores = await erpQuery(`SELECT nf.numero, COALESCE(p.razaosocial,p.nome) fornecedor,
          to_char(nf.datahoraemissao,'DD/MM/YYYY') emissao, to_char(nf.datahoraentrada,'DD/MM/YYYY') entrada,
          ROUND((EXTRACT(EPOCH FROM (nf.datahoraentrada - nf.datahoraemissao))/86400.0)::numeric,1) dias
        FROM notafiscal nf LEFT JOIN fornecedor f ON f.id=nf.fornecedorid LEFT JOIN pessoa p ON p.id=f.pessoaid
        WHERE nf.unidadenegocioid=$1 AND nf.fornecedorid IS NOT NULL
          AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + interval '1 day')
          AND nf.datahoraemissao IS NOT NULL AND nf.datahoraentrada >= nf.datahoraemissao
        ORDER BY (nf.datahoraentrada - nf.datahoraemissao) DESC LIMIT 10`, [uni, ini, fim]);
      const s = st[0] || {};
      saida.push({
        loja: l.nome, loja_id: l.id, n: Number(s.n) || 0, media: Number(s.media) || 0, mediana: Number(s.mediana) || 0,
        buckets: { ate1: Number(s.ate1) || 0, d13: Number(s.d13) || 0, d37: Number(s.d37) || 0, d715: Number(s.d715) || 0, m15: Number(s.m15) || 0 },
        pior: Number(s.pior) || 0, piores
      });
    }
    const payload = { ok: true, competencia, lojas: saida };
    const at = biCacheGravar(req.usuario.empresa_id, chave, competencia, payload);
    res.json({ ...payload, cache: { atualizado_em: at, deCache: false } });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// detalhe de uma FAIXA de dias do BI (clicou numa barra do gráfico) — lista as notas/empresas daquela faixa
router.get('/espiao/lead-estoque/detalhe', async (req, res) => {
  try {
    const { competencia, loja } = req.query;
    if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) return res.status(400).json({ erro: 'Informe a competência (AAAA-MM).' });
    const l = lojasEmpresa(req.usuario.empresa_id).find(x => x.id === loja && x.erp_unidadenegocio_id != null);
    if (!l) return res.status(400).json({ erro: 'Escolha uma loja válida.' });
    const min = Number(req.query.min); const max = req.query.max === '' || req.query.max == null ? null : Number(req.query.max);
    if (!Number.isFinite(min)) return res.status(400).json({ erro: 'Faixa inválida.' });
    const [ano, mes] = competencia.split('-').map(Number);
    const ini = `${competencia}-01`, fim = `${competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
    const uni = Number(l.erp_unidadenegocio_id);
    const faixa = 'EXTRACT(EPOCH FROM (nf.datahoraentrada - nf.datahoraemissao))/86400.0';
    const rows = await erpQuery(`SELECT nf.numero, COALESCE(p.razaosocial,p.nome) fornecedor,
        to_char(nf.datahoraemissao,'DD/MM/YYYY') emissao, to_char(nf.datahoraentrada,'DD/MM/YYYY') entrada,
        ROUND((${faixa})::numeric,1) dias
      FROM notafiscal nf LEFT JOIN fornecedor f ON f.id=nf.fornecedorid LEFT JOIN pessoa p ON p.id=f.pessoaid
      WHERE nf.unidadenegocioid=$1 AND nf.fornecedorid IS NOT NULL
        AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + interval '1 day')
        AND nf.datahoraemissao IS NOT NULL AND nf.datahoraentrada >= nf.datahoraemissao
        AND (${faixa}) >= $4 ${max != null ? `AND (${faixa}) < $5` : ''}
      ORDER BY (nf.datahoraentrada - nf.datahoraemissao) DESC LIMIT 500`,
      max != null ? [uni, ini, fim, min, max] : [uni, ini, fim, min]);
    res.json({ ok: true, loja: l.nome, loja_id: l.id, min, max, n: rows.length, notas: rows });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── Espião NFe: cruza o que a SEFAZ tem (XML capturado) × o que foi lançado (SPED) ──────────────
// Acha a "NF de entrada não lançada" — o maior erro de SPED. Config dos tokens no backend/.env.
router.get('/sped/espiao/status', async (req, res) => {
  if (!espiao.habilitado()) return res.json({ ok: false, configurado: false, erro: 'Tokens do Espião não configurados.' });
  const r = await espiao.testarConexao();
  res.json({ ok: r.ok, configurado: true, erro: r.erro || null, status: r.status || null });
});
// cruza um arquivo SPED já no repositório com o Espião (período + CNPJ saem do próprio arquivo)
router.post('/sped/:id/cruzar-espiao', exigePerfil(...PERFIS_ESCRITA), async (req, res) => {
  try {
    if (!espiao.habilitado()) return res.status(400).json({ erro: 'Integração Espião não configurada (.env).' });
    const row = db.prepare('SELECT * FROM contabil_sped WHERE empresa_id=? AND id=?').get(req.usuario.empresa_id, Number(req.params.id));
    if (!row || !row.dados) return res.status(404).json({ erro: 'Arquivo SPED não encontrado.' });
    const buf = Buffer.from(row.dados, 'base64');
    const head = parseSpedHeader(buf);
    const cnpj = soDigitos(head.cnpj || '') || (() => { const l = lojasEmpresa(req.usuario.empresa_id).find(x => x.id === row.loja_id); return l ? soDigitos(l.cnpj) : ''; })();
    if (soDigitos(cnpj).length !== 14) return res.status(400).json({ erro: 'Não achei o CNPJ da loja no arquivo/cadastro.' });
    const [ano, mes] = row.competencia.split('-').map(Number);
    const ini = `${row.competencia}-01`;
    const fim = `${row.competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
    const chavesSped = chavesEntradaSped(buf);
    const resp = await espiao.nfeResumoPeriodo({ cnpjCpf: cnpj, dataInicial: ini, dataFinal: fim, emitidaRecebida: 0, modelo: 55 });
    if (!resp.ok) return res.status(502).json({ erro: 'Espião: ' + resp.erro });
    const canc = s => /cancel/i.test(String(s || ''));
    const notas = (resp.notas || []).filter(n => !canc(n.situacao)); // notas válidas recebidas
    const faltantes = notas.filter(n => !chavesSped.has(soDigitos(n.chaveAcesso)));
    // grava as faltantes no banco de correção (NF não lançada), dedupe por chave/competência
    const ins = db.prepare(`INSERT INTO contabil_sped_erro (empresa_id, competencia, tipo, loja_id, categoria, registro, descricao, referencia, status, origem, sped_id, usuario_id)
      VALUES (?,?,?,?, 'NF de entrada não lançada','C100', ?, ?, 'aberto','sistema', ?, ?)`);
    const existe = db.prepare(`SELECT 1 FROM contabil_sped_erro WHERE empresa_id=? AND competencia=? AND referencia=?`);
    let inseridos = 0;
    const tx = db.transaction(() => {
      for (const n of faltantes) {
        const chave = soDigitos(n.chaveAcesso);
        if (existe.get(req.usuario.empresa_id, row.competencia, chave)) continue;
        const desc = `NF ${n.numeroNfe || '?'} de ${n.nomeEmitente || n.cnpjCpfEmitente || '?'} (R$ ${n.valorTotal || '?'}, emissão ${n.dataEmissao || '?'}) está na SEFAZ e não foi lançada`;
        ins.run(req.usuario.empresa_id, row.competencia, row.tipo, row.loja_id, desc, chave, row.id, req.usuario.id);
        inseridos++;
      }
    });
    tx();
    res.json({ ok: true, competencia: row.competencia, cnpj,
      resumo: { espiao: notas.length, noSped: chavesSped.size, faltantes: faltantes.length, inseridosBanco: inseridos },
      faltantes: faltantes.slice(0, 500).map(n => ({ chave: soDigitos(n.chaveAcesso), numero: n.numeroNfe, emitente: n.nomeEmitente, cnpjEmitente: n.cnpjCpfEmitente, data: n.dataEmissao, valor: n.valorTotal, situacao: n.situacao, manifestacao: n.manifestacao, possuiXml: n.possuiXml })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// resumo do BI de tempo de entrada (grupo todo) — p/ painel/dashboard. Só ERP, rápido.
router.get('/espiao/lead-resumo', async (req, res) => {
  try {
    const competencia = /^\d{4}-\d{2}$/.test(req.query.competencia || '') ? req.query.competencia : new Date().toISOString().slice(0, 7);
    const lojas = lojasEmpresa(req.usuario.empresa_id).filter(l => l.erp_unidadenegocio_id != null);
    if (!lojas.length) return res.json({ ok: true, competencia, total: 0, lojas: [] });
    const chave = `lead-resumo|${competencia}`;
    const cache = biCacheLer(req.usuario.empresa_id, chave, competencia, req.query.forcar === '1');
    if (cache) return res.json({ ...cache.payload, cache: { atualizado_em: cache.atualizado_em, deCache: true } });
    const [ano, mes] = competencia.split('-').map(Number);
    const ini = `${competencia}-01`, fim = `${competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
    const unis = lojas.map(l => Number(l.erp_unidadenegocio_id));
    const ph = unis.map((_, i) => '$' + (i + 3)).join(',');
    const g = await erpQuery(`WITH e AS (
      SELECT EXTRACT(EPOCH FROM (datahoraentrada - datahoraemissao))/86400.0 dias
      FROM notafiscal WHERE unidadenegocioid IN (${ph}) AND fornecedorid IS NOT NULL
        AND datahoraentrada >= $1::date AND datahoraentrada < ($2::date + interval '1 day')
        AND datahoraemissao IS NOT NULL AND datahoraentrada >= datahoraemissao)
      SELECT COUNT(*) n, ROUND(AVG(dias)::numeric,2) media, ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY dias))::numeric,2) mediana,
        COUNT(*) FILTER (WHERE dias<3) ate3, COUNT(*) FILTER (WHERE dias>=7) lentas7 FROM e`, [ini, fim, ...unis]);
    const porUni = await erpQuery(`SELECT unidadenegocioid uni, COUNT(*) n,
        ROUND(AVG(EXTRACT(EPOCH FROM (datahoraentrada - datahoraemissao))/86400.0)::numeric,2) media
      FROM notafiscal WHERE unidadenegocioid IN (${ph}) AND fornecedorid IS NOT NULL
        AND datahoraentrada >= $1::date AND datahoraentrada < ($2::date + interval '1 day')
        AND datahoraemissao IS NOT NULL AND datahoraentrada >= datahoraemissao
      GROUP BY unidadenegocioid`, [ini, fim, ...unis]);
    const map = {}; porUni.forEach(r => { map[r.uni] = { n: Number(r.n) || 0, media: Number(r.media) || 0 }; });
    const s = g[0] || {};
    const payload = {
      ok: true, competencia, total: Number(s.n) || 0, media: Number(s.media) || 0, mediana: Number(s.mediana) || 0,
      ate3: Number(s.ate3) || 0, lentas7: Number(s.lentas7) || 0,
      lojas: lojas.map(l => ({ loja: l.nome, ...(map[Number(l.erp_unidadenegocio_id)] || { n: 0, media: 0 }) })).sort((a, b) => b.media - a.media)
    };
    const at = biCacheGravar(req.usuario.empresa_id, chave, competencia, payload);
    res.json({ ...payload, cache: { atualizado_em: at, deCache: false } });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
