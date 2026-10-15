// etiquetas.js — gerador de etiquetas/placas de preço (Marketing). Cadernos de oferta + busca + temas.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { listarCadernos, itensCaderno, buscarProdutos } = require('../lib/etiquetas');

const GESTAO_MKT = ['Diretor Geral', 'Gestor Geral', 'Marketing', 'Supervisor'];
router.use(auth);

// erp_unidadenegocio da loja do usuário (p/ o preço "de"); ?loja sobrepõe.
function uniDe(req) {
  const lojaId = req.query.loja || req.usuario.loja_id;
  const l = lojaId && db.prepare('SELECT erp_unidadenegocio_id u FROM lojas WHERE id=?').get(lojaId);
  return l ? Number(l.u) : null;
}

router.get('/cadernos', async (req, res) => {
  try { res.json({ cadernos: await listarCadernos() }); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/caderno/:id', async (req, res) => {
  try { res.json(await itensCaderno(Number(req.params.id), uniDe(req))); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/buscar', async (req, res) => {
  try { res.json({ itens: await buscarProdutos(req.query.q, uniDe(req)) }); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Temas (layouts) ──────────────────────────────────────────────────────
router.get('/temas', (req, res) => {
  const rows = db.prepare('SELECT id, nome, config FROM etiqueta_temas WHERE empresa_id=? AND ativo=1 ORDER BY nome').all(req.usuario.empresa_id);
  res.json({ temas: rows.map(r => ({ id: r.id, nome: r.nome, config: JSON.parse(r.config) })) });
});

router.post('/temas', exigePerfil(...GESTAO_MKT), (req, res) => {
  const { nome, config } = req.body;
  if (!nome || !config) return res.status(400).json({ erro: 'Informe nome e config.' });
  const id = uuid();
  db.prepare('INSERT INTO etiqueta_temas (id,empresa_id,nome,config,ativo,criado_por,criado_em) VALUES (?,?,?,?,1,?,datetime(\'now\'))')
    .run(id, req.usuario.empresa_id, nome, JSON.stringify(config), req.usuario.id);
  res.json({ ok: true, id });
});

router.put('/temas/:id', exigePerfil(...GESTAO_MKT), (req, res) => {
  const t = db.prepare('SELECT id FROM etiqueta_temas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!t) return res.status(404).json({ erro: 'Tema não encontrado.' });
  const { nome, config, ativo } = req.body;
  db.prepare('UPDATE etiqueta_temas SET nome=COALESCE(?,nome), config=COALESCE(?,config), ativo=COALESCE(?,ativo) WHERE id=?')
    .run(nome || null, config ? JSON.stringify(config) : null, ativo == null ? null : (ativo ? 1 : 0), req.params.id);
  res.json({ ok: true });
});

module.exports = router;
