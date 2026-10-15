// pesquisas.js — Pesquisas de avaliação interna: colaboradores avaliam SETORES e a GERÊNCIA.
// Admin cadastra período + pontos que quem responde ganha. Resposta anônima (nota por alvo);
// a participação é registrada à parte (evita 2x e credita os pontos ao respondente no ledger).
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

const ADMIN = ['RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor'];
const hoje = () => new Date().toISOString().slice(0, 10);
// Perguntas padrão (o admin pode editar/adicionar/remover na criação).
const PERGUNTAS_SETOR = [
  'Atende bem e com agilidade quando você precisa?',
  'A comunicação do setor é clara e respeitosa?',
  'Resolve as solicitações/problemas no prazo?',
];
const PERGUNTAS_GERENCIA = [
  'É acessível e presente no dia a dia?',
  'Reconhece o trabalho e dá feedback?',
  'É justo(a) e trata a equipe com respeito?',
];
router.use(auth);

// Sugestões p/ montar a pesquisa: setores (departamentos) + gerentes ativos + perguntas padrão.
router.get('/sugestoes', exigePerfil(...ADMIN), (req, res) => {
  const emp = req.usuario.empresa_id;
  const setores = db.prepare(`SELECT DISTINCT departamento d FROM colaboradores WHERE empresa_id=? AND ativo=1 AND departamento IS NOT NULL AND departamento<>'' ORDER BY d`).all(emp).map(r => r.d);
  const gerentes = db.prepare(`SELECT c.id, c.nome, l.nome loja FROM colaboradores c LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE c.empresa_id=? AND c.ativo=1 AND c.funcao_id='func-gerente' ORDER BY c.nome`).all(emp)
    .map(g => ({ id: g.id, nome: g.nome, loja: g.loja || null }));
  res.json({ setores, gerentes, perguntasSetor: PERGUNTAS_SETOR, perguntasGerencia: PERGUNTAS_GERENCIA });
});

// Criar pesquisa (com alvos setores + gerência).
router.post('/', exigePerfil(...ADMIN), (req, res) => {
  const emp = req.usuario.empresa_id;
  const b = req.body || {};
  const titulo = (b.titulo || '').toString().trim().slice(0, 160) || 'Avaliação de setores e gerência';
  const inicio = (b.inicio || '').toString().slice(0, 10);
  const fim = (b.fim || '').toString().slice(0, 10);
  if (!inicio || !fim) return res.status(400).json({ erro: 'Informe o período (início e fim).' });
  if (fim < inicio) return res.status(400).json({ erro: 'A data final não pode ser antes da inicial.' });
  const pontos = Math.max(0, parseInt(b.pontosResposta) || 0);
  const setores = Array.isArray(b.setores) ? b.setores.map(s => (s || '').toString().trim()).filter(Boolean) : [];
  const gerentes = Array.isArray(b.gerentes) ? b.gerentes : [];
  if (!setores.length && !gerentes.length) return res.status(400).json({ erro: 'Escolha ao menos um setor ou gerente para avaliar.' });
  const limpar = arr => (Array.isArray(arr) ? arr : []).map(p => (p || '').toString().trim().slice(0, 200)).filter(Boolean);
  const pSetor = limpar(b.perguntasSetor).length ? limpar(b.perguntasSetor) : (setores.length ? PERGUNTAS_SETOR : []);
  const pGer = limpar(b.perguntasGerencia).length ? limpar(b.perguntasGerencia) : (gerentes.length ? PERGUNTAS_GERENCIA : []);
  if (setores.length && !pSetor.length) return res.status(400).json({ erro: 'Defina ao menos uma pergunta para os setores.' });
  if (gerentes.length && !pGer.length) return res.status(400).json({ erro: 'Defina ao menos uma pergunta para a gerência.' });
  const id = uuid();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO pesquisa_avaliacao (id,empresa_id,titulo,inicio,fim,pontos_resposta,status,criado_por,criado_em)
      VALUES (?,?,?,?,?,?, 'aberta', ?, datetime('now'))`).run(id, emp, titulo, inicio, fim, pontos, req.usuario.nome || null);
    let ordem = 0;
    for (const nome of setores) db.prepare(`INSERT INTO pesquisa_avaliacao_alvo (id,pesquisa_id,tipo,nome,ref_id,ordem) VALUES (?,?,'setor',?,NULL,?)`).run(uuid(), id, nome, ordem++);
    for (const g of gerentes) {
      const nome = (g.nome || '').toString().trim(); if (!nome) continue;
      db.prepare(`INSERT INTO pesquisa_avaliacao_alvo (id,pesquisa_id,tipo,nome,ref_id,ordem) VALUES (?,?,'gerencia',?,?,?)`).run(uuid(), id, nome, g.id || null, ordem++);
    }
    let op = 0; for (const t of pSetor) db.prepare(`INSERT INTO pesquisa_avaliacao_pergunta (id,pesquisa_id,tipo,texto,ordem) VALUES (?,?,'setor',?,?)`).run(uuid(), id, t, op++);
    let og = 0; for (const t of pGer) db.prepare(`INSERT INTO pesquisa_avaliacao_pergunta (id,pesquisa_id,tipo,texto,ordem) VALUES (?,?,'gerencia',?,?)`).run(uuid(), id, t, og++);
  });
  tx();
  res.status(201).json({ ok: true, id });
});

router.post('/:id/encerrar', exigePerfil(...ADMIN), (req, res) => {
  db.prepare(`UPDATE pesquisa_avaliacao SET status='encerrada', encerrada_em=datetime('now') WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Lista de pesquisas (admin) com contagem de respondentes e nº de ativos.
router.get('/', exigePerfil(...ADMIN), (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM pesquisa_avaliacao_participou pp WHERE pp.pesquisa_id=p.id) respondentes,
      (SELECT COUNT(*) FROM pesquisa_avaliacao_alvo a WHERE a.pesquisa_id=p.id) alvos
    FROM pesquisa_avaliacao p WHERE p.empresa_id=? ORDER BY p.criado_em DESC LIMIT 50`).all(emp);
  const ativos = db.prepare(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1`).get(emp).n || 0;
  const t = hoje();
  res.json({ pesquisas: rows.map(p => ({ ...p, vigente: p.status === 'aberta' && p.inicio <= t && t <= p.fim })), ativos });
});

// Resultados agregados por alvo (média, nº de notas) + comentários.
router.get('/:id/resultados', exigePerfil(...ADMIN), (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare(`SELECT * FROM pesquisa_avaliacao WHERE id=? AND empresa_id=?`).get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Pesquisa não encontrada.' });
  const alvos = db.prepare(`SELECT * FROM pesquisa_avaliacao_alvo WHERE pesquisa_id=? ORDER BY ordem`).all(p.id);
  const perguntas = db.prepare(`SELECT * FROM pesquisa_avaliacao_pergunta WHERE pesquisa_id=? ORDER BY ordem`).all(p.id);
  const resultados = alvos.map(a => {
    const notas = db.prepare(`SELECT nota FROM pesquisa_avaliacao_resposta WHERE pesquisa_id=? AND alvo_id=? AND nota IS NOT NULL`).all(p.id, a.id).map(r => r.nota);
    const media = notas.length ? Math.round(notas.reduce((x, y) => x + y, 0) / notas.length * 10) / 10 : null;
    const coments = db.prepare(`SELECT comentario FROM pesquisa_avaliacao_resposta WHERE pesquisa_id=? AND alvo_id=? AND comentario IS NOT NULL AND comentario<>'' ORDER BY criado_em DESC LIMIT 40`).all(p.id, a.id).map(r => r.comentario);
    // média por pergunta (do tipo do alvo)
    const porPergunta = perguntas.filter(q => q.tipo === a.tipo).map(q => {
      const ns = db.prepare(`SELECT nota FROM pesquisa_avaliacao_resposta WHERE pesquisa_id=? AND alvo_id=? AND pergunta_id=? AND nota IS NOT NULL`).all(p.id, a.id, q.id).map(r => r.nota);
      return { pergunta: q.texto, media: ns.length ? Math.round(ns.reduce((x, y) => x + y, 0) / ns.length * 10) / 10 : null, respostas: ns.length };
    });
    return { id: a.id, tipo: a.tipo, nome: a.nome, media, respostas: notas.length, comentarios: coments, porPergunta };
  });
  const respondentes = db.prepare(`SELECT COUNT(*) n FROM pesquisa_avaliacao_participou WHERE pesquisa_id=?`).get(p.id).n;
  const setores = resultados.filter(r => r.tipo === 'setor');
  const gerencia = resultados.filter(r => r.tipo === 'gerencia');
  res.json({ pesquisa: p, respondentes, setores, gerencia });
});

// ── Colaborador ─────────────────────────────────────────────────────────────
// Pesquisa vigente (aberta e dentro do período) + alvos + se EU já respondi.
router.get('/ativa', (req, res) => {
  const t = hoje();
  const p = db.prepare(`SELECT * FROM pesquisa_avaliacao WHERE empresa_id=? AND status='aberta' AND inicio<=? AND ?<=fim ORDER BY criado_em DESC LIMIT 1`).get(req.usuario.empresa_id, t, t);
  if (!p) return res.json({ pesquisa: null });
  const respondi = !!db.prepare(`SELECT 1 FROM pesquisa_avaliacao_participou WHERE pesquisa_id=? AND colaborador_id=?`).get(p.id, req.usuario.id);
  const alvos = db.prepare(`SELECT id, tipo, nome FROM pesquisa_avaliacao_alvo WHERE pesquisa_id=? ORDER BY ordem`).all(p.id);
  const perguntas = db.prepare(`SELECT id, tipo, texto FROM pesquisa_avaliacao_pergunta WHERE pesquisa_id=? ORDER BY ordem`).all(p.id);
  res.json({ pesquisa: { id: p.id, titulo: p.titulo, inicio: p.inicio, fim: p.fim, pontos: p.pontos_resposta }, alvos, perguntas, respondi });
});

// Responder (uma vez). Salva as notas (anônimo) + credita os pontos ao respondente.
router.post('/ativa/responder', (req, res) => {
  const t = hoje();
  const p = db.prepare(`SELECT * FROM pesquisa_avaliacao WHERE empresa_id=? AND status='aberta' AND inicio<=? AND ?<=fim ORDER BY criado_em DESC LIMIT 1`).get(req.usuario.empresa_id, t, t);
  if (!p) return res.status(404).json({ erro: 'Nenhuma pesquisa aberta no momento.' });
  if (db.prepare(`SELECT 1 FROM pesquisa_avaliacao_participou WHERE pesquisa_id=? AND colaborador_id=?`).get(p.id, req.usuario.id))
    return res.status(409).json({ erro: 'Você já respondeu. Obrigado!' });
  const alvos = db.prepare(`SELECT id FROM pesquisa_avaliacao_alvo WHERE pesquisa_id=?`).all(p.id);
  const validos = new Set(alvos.map(a => a.id));
  const perguntasValidas = new Set(db.prepare(`SELECT id FROM pesquisa_avaliacao_pergunta WHERE pesquisa_id=?`).all(p.id).map(q => q.id));
  const respostas = Array.isArray(req.body?.respostas) ? req.body.respostas : [];
  const nota = v => { const n = parseInt(v); return n >= 1 && n <= 5 ? n : null; };
  const tx = db.transaction(() => {
    for (const r of respostas) {
      if (!validos.has(r.alvoId)) continue;
      const n = nota(r.nota);
      const c = (r.comentario || '').toString().slice(0, 1000) || null;
      const pid = r.perguntaId && perguntasValidas.has(r.perguntaId) ? r.perguntaId : null;
      if (n == null && !c) continue;
      db.prepare(`INSERT INTO pesquisa_avaliacao_resposta (id,pesquisa_id,alvo_id,pergunta_id,nota,comentario,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`).run(uuid(), p.id, r.alvoId, pid, n, c);
    }
    db.prepare(`INSERT INTO pesquisa_avaliacao_participou (pesquisa_id,colaborador_id,criado_em) VALUES (?,?,datetime('now'))`).run(p.id, req.usuario.id);
    // Crédito de pontos ao respondente (idempotente por pesquisa+colaborador).
    const pts = Number(p.pontos_resposta) || 0;
    if (pts > 0) {
      const ref = `pesquisa-avaliacao:${p.id}:${req.usuario.id}`;
      const ja = db.prepare('SELECT 1 FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').get(req.usuario.empresa_id, ref);
      if (!ja) db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
        VALUES (?,?,?,?,?, 'premio', ?, ?, ?, 'pesquisa', ?, ?, datetime('now'))`)
        .run(uuid(), req.usuario.empresa_id, req.usuario.id, req.usuario.nome || '', req.usuario.loja_id || null,
          `Respondeu a pesquisa "${p.titulo}" — +${pts} pontos`, pts, String(t).slice(0, 7), ref, req.usuario.id);
    }
  });
  tx();
  const pts = Number(p.pontos_resposta) || 0;
  res.status(201).json({ ok: true, pontos: pts, mensagem: pts > 0 ? `Obrigado! Você ganhou +${pts} pontos. 💚` : 'Obrigado por responder! 💚' });
});

module.exports = router;
