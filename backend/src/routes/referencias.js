const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);

// Listas de referência para preencher dropdowns (qualquer usuário autenticado pode ler).
// GET /referencias/lojas
router.get('/lojas', (req, res) => {
  res.json({ lojas: db.prepare('SELECT id, nome, apelido, razao_social, cnpj, endereco, cidade, ativa, socio_assina_id FROM lojas WHERE empresa_id = ? ORDER BY nome').all(req.usuario.empresa_id) });
});

// GET /referencias/funcoes
router.get('/funcoes', (req, res) => {
  res.json({ funcoes: db.prepare('SELECT id, nome FROM funcoes WHERE empresa_id = ? AND ativa = 1 ORDER BY nome').all(req.usuario.empresa_id) });
});

// GET /referencias/departamentos — setores centrais da empresa (lista fixa). As áreas ficam dentro via função.
const DEPARTAMENTOS = ['Direção', 'Supervisão', 'Operação', 'Comercial', 'Suporte', 'Administrativo', 'Gente & Gestão', 'Ouvidoria'];
router.get('/departamentos', (req, res) => {
  res.json({ departamentos: DEPARTAMENTOS });
});

// GET /referencias/terceirizadas — empresa principal + terceirizadas (para o registro do colaborador)
router.get('/terceirizadas', (req, res) => {
  const principal = db.prepare('SELECT nome FROM empresas WHERE id = ?').get(req.usuario.empresa_id);
  const lista = db.prepare('SELECT id, nome, cnpj FROM empresas_terceirizadas WHERE empresa_id = ? AND ativo = 1 ORDER BY nome').all(req.usuario.empresa_id);
  res.json({ principal: principal?.nome || '', terceirizadas: lista });
});

// POST /referencias/terceirizadas — cadastra uma terceirizada (gestão/RH)
router.post('/terceirizadas', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral', 'Suporte'), (req, res) => {
  const { nome, cnpj } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Informe o nome da empresa terceirizada.' });
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  db.prepare('INSERT INTO empresas_terceirizadas (id, empresa_id, nome, cnpj) VALUES (?,?,?,?)').run(id, req.usuario.empresa_id, nome.trim(), (cnpj || '').trim() || null);
  res.json({ id, mensagem: 'Empresa terceirizada cadastrada.' });
});

// DELETE /referencias/terceirizadas/:id — inativa (gestão/RH)
router.delete('/terceirizadas/:id', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral', 'Suporte'), (req, res) => {
  db.prepare('UPDATE empresas_terceirizadas SET ativo = 0 WHERE id = ? AND empresa_id = ?').run(req.params.id, req.usuario.empresa_id);
  res.json({ mensagem: 'Empresa terceirizada removida.' });
});

module.exports = router;
