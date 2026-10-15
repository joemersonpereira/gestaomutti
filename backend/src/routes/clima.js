// clima.js — Pesquisa de clima (eNPS interno). RH abre campanhas; colaboradores
// respondem ANONIMAMENTE (a resposta não guarda quem foi; só registra que participou).
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

const RH = ['RH', 'Gestor Geral', 'Diretor Geral'];
const DIMS = ['s_geral', 's_lideranca', 's_ambiente', 's_remuneracao', 's_crescimento', 's_reconhecimento', 's_carga', 's_ferramentas'];

router.use(auth);

// Campanha aberta + se EU já respondi (para todos).
router.get('/ativa', (req, res) => {
  const camp = db.prepare(`SELECT id, titulo, criado_em FROM clima_campanhas WHERE empresa_id=? AND status='aberta' ORDER BY criado_em DESC LIMIT 1`).get(req.usuario.empresa_id);
  if (!camp) return res.json({ campanha: null });
  const respondi = !!db.prepare(`SELECT 1 FROM clima_participou WHERE campanha_id=? AND colaborador_id=?`).get(camp.id, req.usuario.id);
  res.json({ campanha: camp, respondi });
});

// Responder (anônimo). Registra participação à parte para evitar 2x.
router.post('/ativa/responder', (req, res) => {
  const camp = db.prepare(`SELECT id FROM clima_campanhas WHERE empresa_id=? AND status='aberta' ORDER BY criado_em DESC LIMIT 1`).get(req.usuario.empresa_id);
  if (!camp) return res.status(404).json({ erro: 'Nenhuma pesquisa aberta.' });
  if (db.prepare(`SELECT 1 FROM clima_participou WHERE campanha_id=? AND colaborador_id=?`).get(camp.id, req.usuario.id)) return res.status(409).json({ erro: 'Você já respondeu. Obrigado!' });
  const b = req.body || {};
  const nota = v => { const n = parseInt(v); return n >= 1 && n <= 5 ? n : null; };
  const enps = (() => { const n = parseInt(b.enps); return n >= 0 && n <= 10 ? n : null; })();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO clima_respostas (id,campanha_id,empresa_id,loja_id,s_geral,s_lideranca,s_ambiente,s_remuneracao,s_crescimento,s_reconhecimento,s_carga,s_ferramentas,enps,comentario,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(uuidv4(), camp.id, req.usuario.empresa_id, req.usuario.loja_id || null,
        nota(b.s_geral), nota(b.s_lideranca), nota(b.s_ambiente), nota(b.s_remuneracao), nota(b.s_crescimento), nota(b.s_reconhecimento), nota(b.s_carga), nota(b.s_ferramentas),
        enps, (b.comentario || '').toString().slice(0, 2000) || null);
    db.prepare(`INSERT INTO clima_participou (campanha_id,colaborador_id,criado_em) VALUES (?,?,datetime('now'))`).run(camp.id, req.usuario.id);
  });
  tx();
  res.status(201).json({ ok: true, mensagem: 'Obrigado! Sua resposta é anônima e ajuda a melhorar o Grupo Mutti. 💚' });
});

// ── RH ──────────────────────────────────────────────────────────────────────────────
router.post('/campanhas', exigePerfil(...RH), (req, res) => {
  const aberta = db.prepare(`SELECT id FROM clima_campanhas WHERE empresa_id=? AND status='aberta'`).get(req.usuario.empresa_id);
  if (aberta) return res.status(409).json({ erro: 'Já existe uma pesquisa aberta. Encerre-a antes de abrir outra.' });
  const id = uuidv4();
  db.prepare(`INSERT INTO clima_campanhas (id,empresa_id,titulo,status,criado_por,criado_em) VALUES (?,?,?, 'aberta', ?, datetime('now'))`)
    .run(id, req.usuario.empresa_id, (req.body.titulo || 'Pesquisa de clima').toString().slice(0, 160), req.usuario.nome);
  res.status(201).json({ ok: true, id });
});

router.post('/campanhas/:id/encerrar', exigePerfil(...RH), (req, res) => {
  db.prepare(`UPDATE clima_campanhas SET status='encerrada', encerrada_em=datetime('now') WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

router.get('/campanhas', exigePerfil(...RH), (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM clima_respostas r WHERE r.campanha_id=c.id) respostas,
      (SELECT COUNT(*) FROM clima_participou p WHERE p.campanha_id=c.id) participou
    FROM clima_campanhas c WHERE c.empresa_id=? ORDER BY c.criado_em DESC LIMIT 50`).all(emp);
  const ativos = db.prepare(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1`).get(emp).n || 0;
  res.json({ campanhas: rows, ativos });
});

// Indicadores da campanha (agregado, anônimo).
router.get('/campanhas/:id/analytics', exigePerfil(...RH), (req, res) => {
  const emp = req.usuario.empresa_id;
  const resp = db.prepare(`SELECT * FROM clima_respostas WHERE campanha_id=? AND empresa_id=?`).all(req.params.id, emp);
  const media = campo => { const v = resp.map(r => r[campo]).filter(n => n != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
  const enpsVals = resp.map(r => r.enps).filter(n => n != null);
  let enps = null;
  if (enpsVals.length) { const pro = enpsVals.filter(n => n >= 9).length, det = enpsVals.filter(n => n <= 6).length; enps = Math.round((pro - det) / enpsVals.length * 100); }
  // por loja (só com N>=3 p/ preservar anonimato)
  const porLoja = {};
  resp.forEach(r => { const k = r.loja_id || 'sem'; (porLoja[k] = porLoja[k] || []).push(r); });
  const lojas = Object.entries(porLoja).filter(([, arr]) => arr.length >= 3).map(([lid, arr]) => {
    const nome = db.prepare(`SELECT nome FROM lojas WHERE id=?`).get(lid)?.nome || '—';
    const m = campo => { const v = arr.map(r => r[campo]).filter(n => n != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
    return { loja: nome, n: arr.length, s_geral: m('s_geral') };
  }).sort((a, b) => (b.s_geral || 0) - (a.s_geral || 0));
  const comentarios = resp.map(r => r.comentario).filter(Boolean).slice(0, 60);
  res.json({ respostas: resp.length, enps, medias: Object.fromEntries(DIMS.map(d => [d, media(d)])), por_loja: lojas, comentarios });
});

module.exports = router;
