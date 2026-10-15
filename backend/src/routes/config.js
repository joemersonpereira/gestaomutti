const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);
// Configurações são restritas à gestão do topo / suporte
router.use(exigePerfil('Diretor Geral', 'Gestor Geral', 'Suporte'));

// GET /config/indicadores?funcao_id=
router.get('/indicadores', (req, res) => {
  let q = `SELECT * FROM config_indicadores WHERE empresa_id=?`;
  const params = [req.usuario.empresa_id];
  if (req.query.funcao_id) { q += ' AND funcao_id=?'; params.push(req.query.funcao_id); }
  const itens = db.prepare(q + ' ORDER BY funcao_id, ordem').all(...params);
  // Agrupa por função e valida soma
  const grupos = {};
  itens.forEach(i => { (grupos[i.funcao_id] = grupos[i.funcao_id] || []).push(i); });
  const resumo = Object.entries(grupos).map(([fid, arr]) => ({ funcao_id: fid, soma: arr.reduce((a, x) => a + x.peso, 0), itens: arr }));
  res.json({ funcoes: resumo });
});

// PUT /config/indicadores — atualiza pesos (deve somar 100 por função)
// body: { funcao_id, itens: [{ id, peso, ativo }] }
router.put('/indicadores', (req, res) => {
  const { funcao_id, itens = [] } = req.body;
  if (!funcao_id || !itens.length) return res.status(400).json({ erro: 'Função e itens obrigatórios.' });
  const soma = itens.filter(i => i.ativo !== 0).reduce((a, i) => a + (i.peso || 0), 0);
  if (soma !== 100) return res.status(400).json({ erro: `Os pesos ativos devem somar 100 (atual: ${soma}).` });

  const upd = db.prepare(`UPDATE config_indicadores SET peso=?, ativo=? WHERE id=? AND empresa_id=? AND funcao_id=?`);
  const tx = db.transaction(() => {
    itens.forEach(i => upd.run(i.peso, i.ativo === 0 ? 0 : 1, i.id, req.usuario.empresa_id, funcao_id));
  });
  tx();
  res.json({ mensagem: 'Pesos atualizados.' });
});

// GET /config/lojas
router.get('/lojas', (req, res) => {
  res.json({ lojas: db.prepare('SELECT * FROM lojas WHERE empresa_id=? ORDER BY nome').all(req.usuario.empresa_id) });
});

// POST /config/lojas
router.post('/lojas', (req, res) => {
  const { nome, cidade, apelido, razao_social, cnpj, endereco } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório.' });
  const id = 'loja-' + uuidv4().slice(0, 8);
  db.prepare(`INSERT INTO lojas (id,empresa_id,nome,cidade,apelido,razao_social,cnpj,endereco,ativa) VALUES (?,?,?,?,?,?,?,?,1)`)
    .run(id, req.usuario.empresa_id, nome, cidade || null, apelido || null, razao_social || null, cnpj || null, endereco || null);
  res.status(201).json({ mensagem: 'Loja criada.', id });
});

// PATCH /config/lojas/:id  { nome, cidade, apelido, razao_social, cnpj, endereco, ativa, gerente_id, subgerente_id }
router.patch('/lojas/:id', (req, res) => {
  const campos = [], vals = [];
  ['nome', 'cidade', 'apelido', 'razao_social', 'cnpj', 'endereco', 'ativa', 'gerente_id', 'subgerente_id', 'socio_assina_id'].forEach(k => { if (req.body[k] !== undefined) { campos.push(`${k}=?`); vals.push(req.body[k] === '' ? null : req.body[k]); } });
  if (!campos.length) return res.status(400).json({ erro: 'Nada a atualizar.' });
  vals.push(req.params.id, req.usuario.empresa_id);
  db.prepare(`UPDATE lojas SET ${campos.join(',')} WHERE id=? AND empresa_id=?`).run(...vals);
  res.json({ mensagem: 'Loja atualizada.' });
});

// GET /config/funcoes
router.get('/funcoes', (req, res) => {
  res.json({ funcoes: db.prepare('SELECT * FROM funcoes WHERE empresa_id=? ORDER BY nome').all(req.usuario.empresa_id) });
});

// PATCH /config/funcoes/:id — liga/desliga checklist, avaliação, meta, escritório
router.patch('/funcoes/:id', (req, res) => {
  const campos = [], vals = [];
  ['tem_checklist', 'tem_avaliacao', 'tem_meta', 'escritorio'].forEach(k => { if (req.body[k] !== undefined) { campos.push(`${k}=?`); vals.push(req.body[k] ? 1 : 0); } });
  if (!campos.length) return res.status(400).json({ erro: 'Nada a atualizar.' });
  vals.push(req.params.id, req.usuario.empresa_id);
  db.prepare(`UPDATE funcoes SET ${campos.join(',')} WHERE id=? AND empresa_id=?`).run(...vals);
  res.json({ mensagem: 'Função atualizada.' });
});

// GET /config/empresa
router.get('/empresa', (req, res) => {
  const emp = db.prepare('SELECT * FROM empresas WHERE id=?').get(req.usuario.empresa_id);
  const stats = {
    lojas: db.prepare('SELECT COUNT(*) n FROM lojas WHERE empresa_id=?').get(req.usuario.empresa_id).n,
    colaboradores: db.prepare('SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1').get(req.usuario.empresa_id).n,
  };
  res.json({ empresa: emp, stats });
});

module.exports = router;
