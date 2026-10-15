// kudos.js — Reconhecimento entre colegas. Vira post na Comunidade e dá pontos ao
// colega reconhecido. Limite diário por remetente (anti-farm) e não pode reconhecer a si.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

const CATEGORIAS = ['🤝 Espírito de equipe', '🚀 Foi além', '🙋 Sempre disponível', '⭐ Atendimento nota 10', '🧠 Resolveu / mão na roda', '💡 Boa ideia', '😄 Bom astral'];
const LIMITE_DIA = 5;

router.use(auth);

router.get('/categorias', (req, res) => res.json({ categorias: CATEGORIAS }));

// Envia um kudos a um colega.
router.post('/', (req, res) => {
  const emp = req.usuario.empresa_id;
  const para = db.prepare(`SELECT id, nome, loja_id, foto FROM colaboradores WHERE id=? AND empresa_id=? AND ativo=1`).get(req.body.para_id, emp);
  if (!para) return res.status(404).json({ erro: 'Colega não encontrado.' });
  if (para.id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode dar um kudos para si mesmo. 😉' });
  const categoria = CATEGORIAS.includes(req.body.categoria) ? req.body.categoria : CATEGORIAS[0];
  const hojeEnviados = db.prepare(`SELECT COUNT(*) c FROM kudos WHERE empresa_id=? AND de_id=? AND date(criado_em)=date('now','localtime')`).get(emp, req.usuario.id).c;
  if (hojeEnviados >= LIMITE_DIA) return res.status(429).json({ erro: `Você já deu ${LIMITE_DIA} kudos hoje. Guarde os próximos para amanhã! 🙌` });

  const id = uuidv4();
  const msg = (req.body.mensagem || '').toString().slice(0, 300);
  const texto = `${para.nome} recebeu um reconhecimento de ${req.usuario.nome}! 🙌\n${categoria}${msg ? `\n“${msg}”` : ''}\nBora reconhecer quem faz a diferença! 💚`;
  const tx = db.transaction(() => {
    const postId = uuidv4();
    // Post na Comunidade celebra o colega (avatar/loja do reconhecido).
    db.prepare(`INSERT INTO mural_posts (id,empresa_id,autor_id,autor_nome,tipo,titulo,texto,imagem,loja_id,fixado,ref,criado_em)
      VALUES (?,?,?,?,'kudos',?,?,?,?,0,?,datetime('now'))`)
      .run(postId, emp, para.id, para.nome, '🙌 Kudos!', texto, para.foto || null, null, `kudos:${id}`);
    db.prepare(`INSERT INTO kudos (id,empresa_id,de_id,de_nome,para_id,para_nome,categoria,mensagem,post_id,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(id, emp, req.usuario.id, req.usuario.nome, para.id, para.nome, categoria, msg || null, postId);
  });
  tx();
  // Pontos ao colega reconhecido (config, idempotente por ref).
  try { const { lancarPontos, getConfig } = require('./pontos'); const pts = getConfig(emp).kudos_pontos; if (pts > 0) lancarPontos(emp, { colaborador_id: para.id, colaborador_nome: para.nome, loja_id: para.loja_id, tipo: 'manual', descricao: `Kudos de ${req.usuario.nome}`, pontos: pts, origem: 'automatico', ref: `pts:kudos:${id}` }); } catch (e) { console.error('[kudos] pontos:', e.message); }
  res.status(201).json({ ok: true, restantes: LIMITE_DIA - hojeEnviados - 1 });
});

// Ranking dos mais reconhecidos (mês atual).
router.get('/ranking', (req, res) => {
  const rows = db.prepare(`SELECT para_id, para_nome, COUNT(*) n FROM kudos
    WHERE empresa_id=? AND strftime('%Y-%m', criado_em)=strftime('%Y-%m','now','localtime')
    GROUP BY para_id, para_nome ORDER BY n DESC LIMIT 10`).all(req.usuario.empresa_id);
  res.json({ ranking: rows });
});

// Meus kudos recebidos.
router.get('/meus', (req, res) => {
  const rows = db.prepare(`SELECT de_nome, categoria, mensagem, criado_em FROM kudos WHERE empresa_id=? AND para_id=? ORDER BY criado_em DESC LIMIT 30`).all(req.usuario.empresa_id, req.usuario.id);
  res.json({ recebidos: rows });
});

module.exports = router;
