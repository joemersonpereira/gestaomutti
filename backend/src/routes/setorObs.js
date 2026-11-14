// setorObs.js — Observações do setor (Joe 2026-11-14): padrão compartilhado por TODA tela de Meu Setor.
// Genérico por `setor` (compras | caixas | online | suporte | …). Qualquer perfil lê; a gestão registra/remove.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

router.use(auth);

// Lista as observações do setor (mais recentes primeiro). Chave `itens` p/ casar com o componente
// compartilhado SetorObservacoes (usado também em Tesouraria/Compras/Retail).
router.get('/:setor', (req, res) => {
  const itens = db.prepare(`SELECT id, texto, autor_nome, criado_em FROM setor_observacao
    WHERE empresa_id=? AND setor=? ORDER BY criado_em DESC, id DESC LIMIT 100`).all(req.usuario.empresa_id, req.params.setor);
  res.json({ itens });
});
// Registra uma observação (qualquer um da área, igual aos outros módulos).
router.post('/:setor', (req, res) => {
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Escreva a observação.' });
  const info = db.prepare(`INSERT INTO setor_observacao (empresa_id, setor, texto, autor_id, autor_nome, criado_em)
    VALUES (?,?,?,?,?, datetime('now'))`).run(req.usuario.empresa_id, req.params.setor, texto.slice(0, 2000), String(req.usuario.id || ''), req.usuario.nome || '');
  res.json({ ok: true, id: info.lastInsertRowid });
});
// Remove uma observação.
router.delete('/:setor/:id', (req, res) => {
  db.prepare('DELETE FROM setor_observacao WHERE id=? AND empresa_id=? AND setor=?').run(Number(req.params.id), req.usuario.empresa_id, req.params.setor);
  res.json({ ok: true });
});

module.exports = router;
