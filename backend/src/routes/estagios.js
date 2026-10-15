// estagios.js — API do módulo Estágios e Faturas (armazém doc por coleção, por empresa).
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { erpQuery } = require('../db/erp');
const { unisEmpresa } = require('../lib/escopoCompras');

const PERFIS = ['RH', 'Financeiro', 'Controladoria', 'Gestor Geral', 'Diretor Geral'];
const COLS = new Set(['estagiarios', 'pagamentos', 'cartoes', 'compras', 'parcelas', 'fornecedores', 'notas', 'planos']);
const emp = req => req.usuario.empresa_id;

router.use(auth);

// Todos os documentos, agrupados por coleção (carga inicial da tela)
router.get('/', exigePerfil(...PERFIS), (req, res) => {
  const rows = db.prepare('SELECT colecao, doc_id, data_json FROM estagios_docs WHERE empresa_id=?').all(emp(req));
  const out = {}; for (const c of COLS) out[c] = [];
  for (const r of rows) {
    if (!out[r.colecao]) out[r.colecao] = [];
    let d = {}; try { d = JSON.parse(r.data_json || '{}'); } catch { d = {}; }
    out[r.colecao].push(Object.assign({ id: r.doc_id }, d));
  }
  res.json(out);
});

// OCR do comprovante da compra (foto/PDF) → lê valor/fornecedor/número e se é NF.
router.post('/ler-comprovante', exigePerfil(...PERFIS), async (req, res) => {
  const b = req.body || {};
  if (!b.dados) return res.status(400).json({ erro: 'Envie o arquivo.' });
  try {
    const lerNf = require('../lib/lerNf');
    const r = await lerNf.ocrComprovanteAny(b.dados, b.tipo_mime);
    if (!r) return res.json({ ok: false, aviso: 'Não consegui ler (sem OCR ou imagem ruim).' });
    res.json({ ok: true, ...r });
  } catch (e) { res.status(503).json({ erro: 'Erro ao ler o comprovante.', detalhe: String(e.message || e) }); }
});

// Arquivo (foto/PDF) de uma compra — anexo de verdade (base64 em tabela própria).
router.post('/compra-arquivo/:id', exigePerfil(...PERFIS), (req, res) => {
  const b = req.body || {};
  if (!b.dados) return res.status(400).json({ erro: 'Envie o arquivo.' });
  db.prepare(`INSERT INTO estagio_compra_arquivo (empresa_id,doc_id,nome,tipo_mime,dados,criado_em)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,doc_id) DO UPDATE SET nome=excluded.nome, tipo_mime=excluded.tipo_mime, dados=excluded.dados, criado_em=excluded.criado_em`)
    .run(emp(req), req.params.id, b.nome || 'documento', b.tipo_mime || null, String(b.dados).slice(0, 12000000));
  res.json({ ok: true });
});
router.get('/compra-arquivo/:id', exigePerfil(...PERFIS), (req, res) => {
  const a = db.prepare(`SELECT nome, tipo_mime AS tipo, dados FROM estagio_compra_arquivo WHERE empresa_id=? AND doc_id=?`).get(emp(req), req.params.id);
  if (!a || !a.dados) return res.status(404).json({ erro: 'Sem arquivo.' });
  res.json(a);
});

// Upsert de um documento
router.put('/:col/:id', exigePerfil(...PERFIS), (req, res) => {
  if (!COLS.has(req.params.col)) return res.status(400).json({ erro: 'Coleção inválida.' });
  const data = (req.body && req.body.data) ? req.body.data : {};
  db.prepare(`INSERT INTO estagios_docs (empresa_id, colecao, doc_id, data_json, atualizado_em)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, colecao, doc_id) DO UPDATE SET data_json=excluded.data_json, atualizado_em=excluded.atualizado_em`)
    .run(emp(req), req.params.col, req.params.id, JSON.stringify(data));
  res.json({ ok: true });
});

// Exclui um documento
router.delete('/:col/:id', exigePerfil(...PERFIS), (req, res) => {
  db.prepare('DELETE FROM estagios_docs WHERE empresa_id=? AND colecao=? AND doc_id=?').run(emp(req), req.params.col, req.params.id);
  res.status(204).end();
});

// ── Busca no Alpha 7 (ERP, SOMENTE LEITURA) para lançar nas faturas ──
// GET /estagios/erp/notas?busca=&loja= — notas fiscais de ENTRADA (compras) por número ou fornecedor
router.get('/erp/notas', exigePerfil(...PERFIS), async (req, res) => {
  try {
    const unis = unisEmpresa(emp(req), req.query.loja);
    if (!unis.length) return res.json({ notas: [] });
    const params = [unis]; let w = `nf.unidadenegocioid = ANY($1::bigint[]) AND nf.fornecedorid IS NOT NULL`;
    if (req.query.busca) { params.push('%' + req.query.busca + '%'); const i = params.length; w += ` AND (CAST(nf.numero AS text) ILIKE $${i} OR pf.nome ILIKE $${i} OR pf.razaosocial ILIKE $${i})`; }
    const notas = await erpQuery(`
      SELECT nf.id, nf.numero, nf.serie, nf.chaveacesso, nf.valortotal,
        to_char(nf.datahoraemissao,'YYYY-MM-DD') AS emissao, to_char(nf.datahoraentrada,'YYYY-MM-DD') AS entrada,
        COALESCE(pf.razaosocial, pf.nome) AS fornecedor, pf.cnpj
      FROM notafiscal nf LEFT JOIN fornecedor f ON f.id = nf.fornecedorid LEFT JOIN pessoa pf ON pf.id = f.pessoaid
      WHERE ${w}
      ORDER BY nf.datahoraemissao DESC NULLS LAST LIMIT 50`, params);
    res.json({ notas });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

// GET /estagios/erp/contas — contas de banco (contacorrente tipo B) das lojas, p/ vincular ao cartão
router.get('/erp/contas', exigePerfil(...PERFIS), async (req, res) => {
  try {
    const unis = unisEmpresa(emp(req));
    if (!unis.length) return res.json({ contas: [] });
    const contas = await erpQuery(`
      SELECT cc.id, cc.nome, cc.unidadenegocioid AS loja_erp
      FROM contacorrente cc WHERE cc.tipo='B' AND cc.status='A' AND cc.unidadenegocioid = ANY($1::bigint[])
      ORDER BY cc.nome`, [unis]);
    res.json({ contas });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

// GET /estagios/erp/planocontas — plano de contas do ERP (p/ o datalist da compra)
router.get('/erp/planocontas', exigePerfil(...PERFIS), async (req, res) => {
  try {
    const planos = await erpQuery(`SELECT id, nome FROM planocontas WHERE nome IS NOT NULL ORDER BY nome LIMIT 1000`);
    res.json({ planos });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

// GET /estagios/erp/fornecedores?busca= — fornecedores/laboratórios do cadastro do ERP
router.get('/erp/fornecedores', exigePerfil(...PERFIS), async (req, res) => {
  try {
    const params = []; let w = `f.id IS NOT NULL`;
    if (req.query.busca) { params.push('%' + req.query.busca + '%'); const i = params.length; w += ` AND (pf.nome ILIKE $${i} OR pf.razaosocial ILIKE $${i} OR pf.cnpj ILIKE $${i})`; }
    const fornecedores = await erpQuery(`
      SELECT f.id, COALESCE(pf.razaosocial, pf.nome) AS nome, pf.nome AS fantasia, pf.cnpj
      FROM fornecedor f JOIN pessoa pf ON pf.id = f.pessoaid
      WHERE ${w}
      ORDER BY COALESCE(pf.razaosocial, pf.nome) LIMIT 50`, params);
    res.json({ fornecedores });
  } catch (e) { res.status(503).json({ erro: 'ERP indisponível.', detalhe: String(e.message || e) }); }
});

module.exports = router;
