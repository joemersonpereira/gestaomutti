const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

// POST /auth/login
router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios.' });

  const colab = db.prepare(`
    SELECT c.*, f.nome as funcao_nome, f.escritorio as escritorio, l.nome as loja_nome, e.nome as empresa_nome
    FROM colaboradores c
    JOIN funcoes f ON f.id = c.funcao_id
    JOIN lojas l ON l.id = c.loja_id
    JOIN empresas e ON e.id = c.empresa_id
    WHERE c.email = ? AND c.ativo = 1
  `).get(email.toLowerCase().trim());

  if (!colab) return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });

  const senhaOk = bcrypt.compareSync(senha, colab.senha_hash);
  if (!senhaOk) return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });

  const token = jwt.sign(
    { id: colab.id, empresa_id: colab.empresa_id, funcao: colab.funcao_nome },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  // Log de acesso
  db.prepare(`INSERT INTO logs (id,empresa_id,colaborador_id,acao,ip,criado_em) VALUES (?,?,?,'login',?,datetime('now'))`)
    .run(uuidv4(), colab.empresa_id, colab.id, req.ip);

  res.json({
    token,
    usuario: {
      id: colab.id,
      nome: colab.nome,
      email: colab.email,
      funcao: colab.funcao_nome,
      escritorio: colab.escritorio === 1,
      loja: colab.loja_nome,
      loja_id: colab.loja_id,
      empresa: colab.empresa_nome,
      empresa_id: colab.empresa_id,
      senha_provisoria: colab.senha_provisoria === 1,
      dois_fatores_ativo: colab.dois_fatores_ativo === 1,
    }
  });
});

// POST /auth/trocar-senha
router.post('/trocar-senha', auth, (req, res) => {
  const { senha_atual, nova_senha } = req.body;
  if (!senha_atual || !nova_senha) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (nova_senha.length < 8) return res.status(400).json({ erro: 'Nova senha deve ter ao menos 8 caracteres.' });

  const colab = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(req.usuario.id);
  if (!bcrypt.compareSync(senha_atual, colab.senha_hash)) {
    return res.status(401).json({ erro: 'Senha atual incorreta.' });
  }

  const novoHash = bcrypt.hashSync(nova_senha, 10);
  db.prepare('UPDATE colaboradores SET senha_hash = ?, senha_provisoria = 0 WHERE id = ?')
    .run(novoHash, req.usuario.id);

  res.json({ mensagem: 'Senha alterada com sucesso.' });
});

// GET /auth/me
router.get('/me', auth, (req, res) => {
  const extra = db.prepare('SELECT foto, apelido, bio, presente_favorito, cores_favoritas, estilo_musical, hobbies, time_coracao FROM colaboradores WHERE id=?').get(req.usuario.id) || {};
  res.json({ usuario: {
    id: req.usuario.id,
    nome: req.usuario.nome,
    apelido: extra.apelido || null,
    foto: extra.foto || null,
    bio: extra.bio || null,
    presente_favorito: extra.presente_favorito || null,
    cores_favoritas: extra.cores_favoritas || null,
    estilo_musical: extra.estilo_musical || null,
    hobbies: extra.hobbies || null,
    time_coracao: extra.time_coracao || null,
    email: req.usuario.email,
    funcao: req.usuario.funcao_nome,
    escritorio: req.usuario.escritorio === 1,
    loja: req.usuario.loja_nome,
    loja_id: req.usuario.loja_id,
    empresa_id: req.usuario.empresa_id,
    senha_provisoria: req.usuario.senha_provisoria === 1,
  }});
});

// POST /auth/logout
router.post('/logout', auth, (req, res) => {
  db.prepare(`INSERT INTO logs (id,empresa_id,colaborador_id,acao,ip,criado_em) VALUES (?,?,?,'logout',?,datetime('now'))`)
    .run(uuidv4(), req.usuario.empresa_id, req.usuario.id, req.ip);
  res.json({ mensagem: 'Logout registrado.' });
});

module.exports = router;
