// mural.js — Comunidade (intranet social / feed). Todos os colaboradores logados veem
// o feed da empresa (rede + posts da loja deles). Posts livres: qualquer um. Comunicados
// e enquetes: gestão/RH. Curtir, comentar, confirmar leitura e votar em enquete.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const { concederBeneficio } = require('./beneficios');
const { lancarPontos } = require('./pontos');

router.use(auth);

const GESTAO = ['Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'RH'];
const podeComunicar = u => GESTAO.includes(u.funcao_nome);

// Transforma CERTIFICADOS validados (conquista/curso/reconhecimento) em posts de
// conquista no feed — pega todos os caminhos de emissão sem acoplar às rotas deles.
const VERBO = { conquista: 'conquistou', reconhecimento: 'foi reconhecido(a) por', desenvolvimento: 'concluiu' };
let _ultimaSyncConq = 0;
function sincronizarConquistas(empresaId, force) {
  if (!force && Date.now() - _ultimaSyncConq < 60 * 1000) return;
  _ultimaSyncConq = Date.now();
  let certs = [];
  try {
    certs = db.prepare(`SELECT ce.id, ce.tipo, ce.titulo, ce.descricao, ce.colaborador_id, c.nome, c.loja_id
      FROM certificados ce JOIN colaboradores c ON c.id = ce.colaborador_id
      WHERE ce.empresa_id=? AND ce.validado=1 AND ce.criado_em > datetime('now','-30 days')
        AND NOT EXISTS (SELECT 1 FROM mural_posts m WHERE m.empresa_id=ce.empresa_id AND m.ref='cert:'||ce.id)`).all(empresaId);
  } catch { return; }
  for (const ce of certs) {
    const verbo = VERBO[ce.tipo] || 'conquistou';
    const texto = `${ce.nome} ${verbo}: ${ce.titulo}` + (ce.descricao ? `\n${ce.descricao}` : '') + ' 🎉';
    db.prepare(`INSERT INTO mural_posts (id,empresa_id,autor_id,autor_nome,tipo,titulo,texto,loja_id,ref,criado_em)
      VALUES (?,?,?,?,'conquista',?,?,?,?,datetime('now'))`)
      .run(uuidv4(), empresaId, null, ce.nome, '🏆 Nova conquista!', texto, null, 'cert:' + ce.id);
    // Pontos #EuSouGrupoMutti: treinamento/curso concluído (desenvolvimento=facultativo 20; demais 10).
    const pts = ce.tipo === 'desenvolvimento' ? 20 : 10;
    lancarPontos(empresaId, { colaborador_id: ce.colaborador_id, colaborador_nome: ce.nome, loja_id: ce.loja_id, tipo: 'treinamento', descricao: ce.titulo, pontos: pts, ref: `pts:cert:${ce.id}` });
  }
}

// ── Criar post ──────────────────────────────────────────────────────────────────
// body: { tipo, titulo, texto, imagem, loja_id, fixado, exige_leitura, opcoes:[...] }
const podeAgendar = u => podeComunicar(u) || u.funcao_nome === 'Marketing';
router.post('/posts', (req, res) => {
  const tipo = ['post', 'comunicado', 'enquete'].includes(req.body.tipo) ? req.body.tipo : 'post';
  // Post livre = todos (é uma rede social). Comunicado/enquete = gestão/RH.
  if ((tipo === 'comunicado' || tipo === 'enquete') && !podeComunicar(req.usuario))
    return res.status(403).json({ erro: 'Comunicados e enquetes são publicados pela gestão/RH.' });
  const texto = (req.body.texto || '').toString().slice(0, 4000);
  const titulo = (req.body.titulo || '').toString().slice(0, 200);
  if (!texto.trim() && !titulo.trim() && !req.body.imagem) return res.status(400).json({ erro: 'Escreva algo para publicar.' });
  const opcoes = Array.isArray(req.body.opcoes) ? req.body.opcoes.map(o => (o || '').toString().trim()).filter(Boolean) : [];
  if (tipo === 'enquete' && opcoes.length < 2) return res.status(400).json({ erro: 'A enquete precisa de pelo menos 2 opções.' });
  const lojaId = (podeComunicar(req.usuario) && req.body.loja_id) ? req.body.loja_id : null;
  // Agendamento (marketing/gestão): publicar_em no futuro só aparece na hora.
  let publicarEm = null;
  if (req.body.publicar_em && podeAgendar(req.usuario)) {
    const dt = String(req.body.publicar_em).replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dt)) publicarEm = dt.slice(0, 16);
  }
  const id = uuidv4();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO mural_posts (id,empresa_id,autor_id,autor_nome,tipo,titulo,texto,imagem,loja_id,fixado,exige_leitura,publicar_em,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(id, req.usuario.empresa_id, req.usuario.id, req.usuario.nome, tipo, titulo || null, texto || null,
        (req.body.imagem || '').toString().slice(0, 6_000_000) || null, lojaId,
        (podeComunicar(req.usuario) && req.body.fixado) ? 1 : 0,
        (tipo === 'comunicado' && req.body.exige_leitura) ? 1 : 0, publicarEm);
    if (tipo === 'enquete') opcoes.forEach((t, i) =>
      db.prepare(`INSERT INTO mural_enquete_opcoes (id,post_id,texto,ordem) VALUES (?,?,?,?)`).run(uuidv4(), id, t, i));
  });
  tx();
  res.status(201).json({ ok: true, id, agendado: !!publicarEm });
});

// Posta automaticamente parabéns de aniversário (vale-compras + day off) e de
// aniversário de casa (brinde surpresa, anual). Deduplicado por ref (1 por ano).
let _ultimaCeleb = 0;
function sincronizarCelebracoesPosts(empresaId, force) {
  if (!force && Date.now() - _ultimaCeleb < 5 * 60 * 1000) return;
  _ultimaCeleb = Date.now();
  const hoje = new Date();
  const mmdd = `${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const ano = hoje.getFullYear();
  const existe = ref => db.prepare(`SELECT 1 FROM mural_posts WHERE empresa_id=? AND ref=?`).get(empresaId, ref);
  const postar = (nome, ref, titulo, texto) => {
    if (existe(ref)) return;
    db.prepare(`INSERT INTO mural_posts (id,empresa_id,autor_id,autor_nome,tipo,titulo,texto,loja_id,fixado,ref,criado_em)
      VALUES (?,?,?,?,'aniversario',?,?,?,0,?,datetime('now'))`).run(uuidv4(), empresaId, null, nome, titulo, texto, null, ref);
  };
  try {
    db.prepare(`SELECT id, nome, loja_id FROM colaboradores WHERE empresa_id=? AND ativo=1 AND nascimento IS NOT NULL AND nascimento<>'' AND strftime('%m-%d', nascimento)=?`).all(empresaId, mmdd)
      .forEach(c => {
        postar(c.nome, `niver:${c.id}:${ano}`, '🎂 Feliz aniversário!',
          `Hoje é dia de festa! 🎉 Parabéns, ${c.nome}! 🥳\nComo presente, você ganhou um vale-compras de R$ 100,00 e um day off! 🎁🎈\nAproveite seu dia — a Mutti te deseja tudo de bom! 💚`);
        // Aniversário: NÃO gera mais vale-compras — o colaborador ganha os 100 pontos
        // (#EuSouGrupoMutti) e um day off. Vale em pontos é concedido manualmente pela G&G.
        const criouDayoff = concederBeneficio(empresaId, { colaborador_id: c.id, colaborador_nome: c.nome, loja_id: c.loja_id, tipo: 'day_off', valor: 0, motivo: 'aniversario', competencia: String(ano), ref: `niver:${c.id}:${ano}:dayoff` });
        // Day off já entra em "Minhas Folgas" (aprovado) na data do aniversário.
        if (criouDayoff) {
          try {
            const fid = uuidv4();
            db.prepare(`INSERT INTO folgas (id,empresa_id,loja_id,colaborador_id,data,status,solicitado_por_id,aprovado_por_id,aprovado_em,motivo,criado_em)
              VALUES (?,?,?,?,?, 'aprovada', NULL, NULL, datetime('now'), ?, datetime('now'))`)
              .run(fid, empresaId, c.loja_id || null, c.id, `${ano}-${mmdd}`, 'Day off de aniversário 🎂');
            db.prepare(`UPDATE beneficios SET folga_id=? WHERE empresa_id=? AND ref=?`).run(fid, empresaId, `niver:${c.id}:${ano}:dayoff`);
          } catch (e) { console.error('[mural] folga de aniversário falhou:', e.message); }
        }
        // Pontos #EuSouGrupoMutti: aniversário pessoal = 100 pts.
        lancarPontos(empresaId, { colaborador_id: c.id, colaborador_nome: c.nome, loja_id: c.loja_id, tipo: 'niver_pessoal', descricao: 'Aniversário pessoal', pontos: 100, competencia: `${ano}-${mmdd.slice(0, 2)}`, ref: `pts:niver:${c.id}:${ano}` });
      });
    db.prepare(`SELECT id, nome, admissao, loja_id FROM colaboradores WHERE empresa_id=? AND ativo=1 AND admissao IS NOT NULL AND strftime('%m-%d', admissao)=? AND CAST(strftime('%Y',admissao) AS INT) < ?`).all(empresaId, mmdd, ano)
      .forEach(c => { const anos = ano - parseInt(String(c.admissao).slice(0, 4), 10); postar(c.nome, `casa:${c.id}:${ano}`, '🥂 Aniversário de casa!',
        `Hoje ${c.nome} completa ${anos} ${anos > 1 ? 'anos' : 'ano'} de Mutti! 🎊\nObrigado por caminhar com a gente. Você ganhou ${10 * anos} pontos no #EuSouGrupoMutti! 🏅\nParabéns pela dedicação! 👏`);
        // Tempo de casa: NÃO gera mais brinde automático — vira 10 pts por ano completo (troque na loja de pontos).
        lancarPontos(empresaId, { colaborador_id: c.id, colaborador_nome: c.nome, loja_id: c.loja_id, tipo: 'niver_empresa', descricao: `${anos} ano(s) de Mutti`, pontos: 10 * anos, competencia: `${ano}-${mmdd.slice(0, 2)}`, ref: `pts:casa:${c.id}:${ano}` }); });
    // Boas-vindas — quem começa na loja hoje (data informada pelo RH). Post com a foto.
    db.prepare(`SELECT c.id, c.nome, c.foto, (SELECT nome FROM lojas WHERE id=c.loja_id) loja FROM colaboradores c
      WHERE c.empresa_id=? AND c.ativo=1 AND c.inicio_loja IS NOT NULL AND date(c.inicio_loja)=date('now','localtime')`).all(empresaId)
      .forEach(c => {
        const ref = `boasvindas:${c.id}:${ano}`;
        if (existe(ref)) return;
        const texto = `Chegou reforço na equipe! 🎉 ${c.nome} começa hoje${c.loja ? ` na ${c.loja}` : ''}. 💚\nBora dar as boas-vindas e deixar a pessoa se sentir em casa! Comente aqui e mande aquele salve! 👋😄`;
        db.prepare(`INSERT INTO mural_posts (id,empresa_id,autor_id,autor_nome,tipo,titulo,texto,imagem,loja_id,fixado,ref,criado_em)
          VALUES (?,?,?,?,'aniversario',?,?,?,?,0,?,datetime('now'))`)
          .run(uuidv4(), empresaId, null, c.nome, '👋 Boas-vindas!', texto, c.foto || null, null, ref);
      });
    // Boas férias — quem começou férias hoje
    db.prepare(`SELECT c.id, c.nome, a.data_inicio FROM afastamentos a JOIN colaboradores c ON c.id=a.colaborador_id
      WHERE a.empresa_id=? AND a.tipo='ferias' AND date(a.data_inicio)=date('now','localtime') AND c.ativo=1`).all(empresaId)
      .forEach(c => postar(c.nome, `ferias:${c.id}:${String(c.data_inicio).slice(0, 10)}`, '🌴 Boas férias!',
        `${c.nome} começou as merecidas férias hoje! 🌴😎\nDescanse, aproveite cada momento e volte com tudo! Boas férias! 🏖️🍹`));
    // Aniversário de filho/pet — só de quem consentiu (LGPD). Post traz a foto do dependente.
    db.prepare(`SELECT d.id, d.tipo, d.especie, d.nome, d.apelido, d.foto, c.nome colab_nome
      FROM dependentes d JOIN colaboradores c ON c.id=d.colaborador_id
      WHERE d.empresa_id=? AND c.ativo=1 AND c.lgpd_consentido=1 AND d.nascimento IS NOT NULL AND strftime('%m-%d', d.nascimento)=?`).all(empresaId, mmdd)
      .forEach(d => {
        const ref = `dep:${d.id}:${ano}`;
        if (existe(ref)) return;
        const quem = d.apelido || d.nome;
        const rel = d.tipo === 'pet' ? (d.especie === 'gato' ? 'gatinho(a)' : d.especie === 'cachorro' ? 'cãozinho(a)' : 'pet') : 'filho(a)';
        const emoji = d.tipo === 'pet' ? (d.especie === 'gato' ? '🐱' : '🐶') : '🧒';
        const titulo = d.tipo === 'pet' ? `${emoji} Aniversário do pet!` : '🎂 Aniversário na família Mutti!';
        const texto = `Hoje é aniversário de ${quem} ${emoji}, ${rel} de ${d.colab_nome}! 🎉\nQue esse dia seja cheio de alegria! Parabéns! 🥳🎈`;
        db.prepare(`INSERT INTO mural_posts (id,empresa_id,autor_id,autor_nome,tipo,titulo,texto,imagem,loja_id,fixado,ref,criado_em)
          VALUES (?,?,?,?,'aniversario',?,?,?,?,0,?,datetime('now'))`)
          .run(uuidv4(), empresaId, null, d.colab_nome, titulo, texto, d.foto || null, null, ref);
      });
  } catch (e) { console.error('[mural] celebrações falhou:', e.message); }
}
// Roda de tempos em tempos mesmo sem ninguém abrir o feed.
setInterval(() => {
  try { [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))].forEach(e => sincronizarCelebracoesPosts(e, true)); } catch { /* ignora */ }
}, 30 * 60 * 1000).unref();

// Nome da loja do autor (para mostrar ao lado da pessoa na Comunidade). Cache leve.
const _lojaAutorCache = new Map();
function lojaDoAutor(autorId) {
  if (!autorId) return null;
  if (_lojaAutorCache.has(autorId)) return _lojaAutorCache.get(autorId);
  let nome = null;
  try { nome = db.prepare(`SELECT l.nome FROM colaboradores c JOIN lojas l ON l.id=c.loja_id WHERE c.id=?`).get(autorId)?.nome || null; } catch { /* ignora */ }
  _lojaAutorCache.set(autorId, nome);
  return nome;
}
const _temFotoCache = new Map();
function temFotoAutor(autorId) {
  if (!autorId) return false;
  if (_temFotoCache.has(autorId)) return _temFotoCache.get(autorId);
  let tem = false;
  try { tem = !!db.prepare(`SELECT (foto IS NOT NULL) f FROM colaboradores WHERE id=?`).get(autorId)?.f; } catch { /* ignora */ }
  _temFotoCache.set(autorId, tem);
  return tem;
}
setInterval(() => { _lojaAutorCache.clear(); _temFotoCache.clear(); }, 10 * 60 * 1000).unref();

// Serve a foto (avatar) de um colaborador — usada na Comunidade sem inflar o feed.
router.get('/foto/:colaboradorId', (req, res) => {
  const row = db.prepare(`SELECT foto FROM colaboradores WHERE id=? AND empresa_id=?`).get(req.params.colaboradorId, req.usuario.empresa_id);
  if (!row || !row.foto) return res.status(404).end();
  const m = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(row.foto);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'private, max-age=300');
  res.send(Buffer.from(m[2], 'base64'));
});

// Quem está online agora (last_seen nos últimos 5 min) — mostrado na Comunidade.
router.get('/online', (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.nome, c.apelido, (c.foto IS NOT NULL) tem_foto, l.nome loja
    FROM colaboradores c LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE c.empresa_id=? AND c.ativo=1 AND c.last_seen IS NOT NULL
      AND c.last_seen >= datetime('now','-5 minutes')
    ORDER BY (c.id=?) DESC, c.last_seen DESC LIMIT 40`).all(req.usuario.empresa_id, req.usuario.id);
  res.json({ online: rows, total: rows.length });
});

// ── Feed ─────────────────────────────────────────────────────────────────────────
router.get('/feed', (req, res) => {
  try { sincronizarConquistas(req.usuario.empresa_id); } catch { /* ignora */ }
  try { sincronizarCelebracoesPosts(req.usuario.empresa_id); } catch { /* ignora */ }
  const eu = req.usuario.id, minhaLoja = req.usuario.loja_id;
  const limite = Math.min(parseInt(req.query.limite) || 30, 60);
  const antes = req.query.antes || null; // paginação por data
  const posts = db.prepare(`SELECT * FROM mural_posts
    WHERE empresa_id=? AND (loja_id IS NULL OR loja_id=?)
      AND (publicar_em IS NULL OR publicar_em <= strftime('%Y-%m-%d %H:%M','now','localtime'))
      ${antes ? 'AND criado_em < ?' : ''}
    ORDER BY fixado DESC, criado_em DESC LIMIT ?`).all(...(antes ? [req.usuario.empresa_id, minhaLoja, antes, limite] : [req.usuario.empresa_id, minhaLoja, limite]));

  const enrich = posts.map(p => {
    const reacoes = db.prepare(`SELECT emoji, COUNT(*) n FROM mural_curtidas WHERE post_id=? GROUP BY emoji ORDER BY n DESC`).all(p.id);
    const curtidas = reacoes.reduce((a, r) => a + r.n, 0);
    const minhaR = db.prepare(`SELECT emoji FROM mural_curtidas WHERE post_id=? AND colaborador_id=?`).get(p.id, eu);
    const nComent = db.prepare(`SELECT COUNT(*) c FROM mural_comentarios WHERE post_id=?`).get(p.id).c;
    const comentarios = db.prepare(`SELECT cm.id, cm.autor_id, cm.autor_nome, cm.texto, (cm.imagem IS NOT NULL) tem_imagem, cm.criado_em,
        (SELECT l.nome FROM colaboradores c JOIN lojas l ON l.id=c.loja_id WHERE c.id=cm.autor_id) autor_loja,
        (SELECT (foto IS NOT NULL) FROM colaboradores WHERE id=cm.autor_id) autor_tem_foto
      FROM mural_comentarios cm WHERE cm.post_id=? ORDER BY cm.criado_em DESC LIMIT 3`).all(p.id).reverse();
    const base = {
      id: p.id, tipo: p.tipo, autor_id: p.autor_id, autor_nome: p.autor_nome, autor_loja: lojaDoAutor(p.autor_id), autor_tem_foto: temFotoAutor(p.autor_id),
      titulo: p.titulo, texto: p.texto,
      tem_imagem: !!p.imagem, loja_id: p.loja_id, fixado: !!p.fixado, exige_leitura: !!p.exige_leitura,
      criado_em: p.criado_em, curtidas, reacoes, minha_reacao: minhaR ? minhaR.emoji : null,
      n_comentarios: nComent, comentarios, eh_meu: p.autor_id === eu,
    };
    if (p.exige_leitura) {
      base.li = !!db.prepare(`SELECT 1 FROM mural_leituras WHERE post_id=? AND colaborador_id=?`).get(p.id, eu);
      base.total_leram = db.prepare(`SELECT COUNT(*) c FROM mural_leituras WHERE post_id=?`).get(p.id).c;
    }
    if (p.tipo === 'enquete') {
      const opcoes = db.prepare(`SELECT id, texto FROM mural_enquete_opcoes WHERE post_id=? ORDER BY ordem`).all(p.id);
      const meuVoto = db.prepare(`SELECT opcao_id FROM mural_enquete_votos WHERE post_id=? AND colaborador_id=?`).get(p.id, eu);
      const totalVotos = db.prepare(`SELECT COUNT(*) c FROM mural_enquete_votos WHERE post_id=?`).get(p.id).c;
      base.enquete = {
        meu_voto: meuVoto ? meuVoto.opcao_id : null, total_votos: totalVotos,
        opcoes: opcoes.map(o => ({ id: o.id, texto: o.texto, votos: db.prepare(`SELECT COUNT(*) c FROM mural_enquete_votos WHERE opcao_id=?`).get(o.id).c })),
      };
    }
    return base;
  });
  res.json({ posts: enrich });
});

// Imagem do post (bin) — só logados da empresa.
router.get('/posts/:id/imagem', (req, res) => {
  const p = db.prepare(`SELECT imagem FROM mural_posts WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p || !p.imagem) return res.status(404).end();
  const b64 = p.imagem.replace(/^data:.*;base64,/, '');
  res.setHeader('Content-Type', 'image/jpeg');
  res.send(Buffer.from(b64, 'base64'));
});

// Comentários completos de um post.
router.get('/posts/:id/comentarios', (req, res) => {
  const rows = db.prepare(`SELECT id, autor_nome, texto, (imagem IS NOT NULL) tem_imagem, criado_em FROM mural_comentarios WHERE post_id=? ORDER BY criado_em ASC`).all(req.params.id);
  res.json({ comentarios: rows });
});

// Imagem de um comentário.
router.get('/comentarios/:id/imagem', (req, res) => {
  const c = db.prepare(`SELECT imagem FROM mural_comentarios WHERE id=?`).get(req.params.id);
  if (!c || !c.imagem) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.send(Buffer.from(c.imagem.replace(/^data:.*;base64,/, ''), 'base64'));
});

const EMOJIS = ['❤️', '👏', '😂', '🎉', '😮', '😢', '🙏', '👍'];
// Reagir com emoji (1 reação por pessoa). Mesmo emoji → remove; outro → troca.
router.post('/posts/:id/curtir', (req, res) => {
  const p = db.prepare(`SELECT id FROM mural_posts WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Post não encontrado.' });
  const emoji = EMOJIS.includes(req.body.emoji) ? req.body.emoji : '❤️';
  const atual = db.prepare(`SELECT emoji FROM mural_curtidas WHERE post_id=? AND colaborador_id=?`).get(p.id, req.usuario.id);
  if (atual && atual.emoji === emoji) {
    db.prepare(`DELETE FROM mural_curtidas WHERE post_id=? AND colaborador_id=?`).run(p.id, req.usuario.id);
  } else if (atual) {
    db.prepare(`UPDATE mural_curtidas SET emoji=?, criado_em=datetime('now') WHERE post_id=? AND colaborador_id=?`).run(emoji, p.id, req.usuario.id);
  } else {
    db.prepare(`INSERT INTO mural_curtidas (post_id,colaborador_id,emoji,criado_em) VALUES (?,?,?,datetime('now'))`).run(p.id, req.usuario.id, emoji);
  }
  const reacoes = db.prepare(`SELECT emoji, COUNT(*) n FROM mural_curtidas WHERE post_id=? GROUP BY emoji ORDER BY n DESC`).all(p.id);
  const minha = db.prepare(`SELECT emoji FROM mural_curtidas WHERE post_id=? AND colaborador_id=?`).get(p.id, req.usuario.id);
  res.json({ minha_reacao: minha ? minha.emoji : null, curtidas: reacoes.reduce((a, r) => a + r.n, 0), reacoes });
});

// Comentar (com foto opcional).
router.post('/posts/:id/comentar', (req, res) => {
  const p = db.prepare(`SELECT id FROM mural_posts WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Post não encontrado.' });
  const texto = (req.body.texto || '').toString().trim().slice(0, 1000);
  const imagem = (req.body.imagem || '').toString().slice(0, 6_000_000) || null;
  if (!texto && !imagem) return res.status(400).json({ erro: 'Escreva um comentário ou anexe uma foto.' });
  db.prepare(`INSERT INTO mural_comentarios (id,post_id,autor_id,autor_nome,texto,imagem,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`)
    .run(uuidv4(), p.id, req.usuario.id, req.usuario.nome, texto, imagem);
  res.status(201).json({ ok: true });
});

// Confirmar leitura de comunicado.
router.post('/posts/:id/li', (req, res) => {
  const p = db.prepare(`SELECT id, exige_leitura FROM mural_posts WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Post não encontrado.' });
  db.prepare(`INSERT OR IGNORE INTO mural_leituras (post_id,colaborador_id,criado_em) VALUES (?,?,datetime('now'))`).run(p.id, req.usuario.id);
  res.json({ ok: true });
});

// Votar em enquete (1 voto por pessoa).
router.post('/posts/:id/votar', (req, res) => {
  const p = db.prepare(`SELECT id, tipo FROM mural_posts WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p || p.tipo !== 'enquete') return res.status(404).json({ erro: 'Enquete não encontrada.' });
  const op = db.prepare(`SELECT id FROM mural_enquete_opcoes WHERE id=? AND post_id=?`).get(req.body.opcao_id, p.id);
  if (!op) return res.status(400).json({ erro: 'Opção inválida.' });
  const ja = db.prepare(`SELECT 1 FROM mural_enquete_votos WHERE post_id=? AND colaborador_id=?`).get(p.id, req.usuario.id);
  if (ja) return res.status(409).json({ erro: 'Você já votou.' });
  db.prepare(`INSERT INTO mural_enquete_votos (post_id,opcao_id,colaborador_id,criado_em) VALUES (?,?,?,datetime('now'))`).run(p.id, op.id, req.usuario.id);
  res.json({ ok: true });
});

// Excluir post (autor ou gestão).
router.delete('/posts/:id', (req, res) => {
  const p = db.prepare(`SELECT autor_id FROM mural_posts WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Post não encontrado.' });
  if (p.autor_id !== req.usuario.id && !podeComunicar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare(`DELETE FROM mural_comentarios WHERE post_id=?`).run(req.params.id);
  db.prepare(`DELETE FROM mural_curtidas WHERE post_id=?`).run(req.params.id);
  db.prepare(`DELETE FROM mural_leituras WHERE post_id=?`).run(req.params.id);
  db.prepare(`DELETE FROM mural_enquete_votos WHERE post_id=?`).run(req.params.id);
  db.prepare(`DELETE FROM mural_enquete_opcoes WHERE post_id=?`).run(req.params.id);
  db.prepare(`DELETE FROM mural_posts WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ── GESTÃO: engajamento na comunidade × disciplina de tarefas ────────────────────
// Cruza a atividade no mural (posts, comentários, curtidas, leituras, votos, conquistas)
// com quem ATRASA tarefa — dá visibilidade a quem participa e a quem deixa tarefa vencer.
const PESO = { posts: 5, comentarios: 2, curtidas: 1, leituras: 1, votos: 1, conquistas: 10 };
router.get('/engajamento', (req, res) => {
  if (!podeComunicar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const mm = String(mes).padStart(2, '0'), yy = String(ano);
  const ehRede = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  const querTodas = ehRede && (!req.query.loja_id || req.query.loja_id === 'todas');
  const colabs = querTodas
    ? db.prepare(`SELECT id, nome, loja_id FROM colaboradores WHERE empresa_id=? AND ativo=1`).all(req.usuario.empresa_id)
    : db.prepare(`SELECT id, nome, loja_id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND ativo=1`).all(req.usuario.empresa_id, req.query.loja_id || req.usuario.loja_id);

  const cnt = (sql, ...p) => { try { return db.prepare(sql).get(...p).c; } catch { return 0; } };
  const mesFiltro = col => `strftime('%m',${col})=? AND strftime('%Y',${col})=?`;

  const linhas = colabs.map(c => {
    const posts = cnt(`SELECT COUNT(*) c FROM mural_posts WHERE autor_id=? AND ${mesFiltro('criado_em')}`, c.id, mm, yy);
    const comentarios = cnt(`SELECT COUNT(*) c FROM mural_comentarios WHERE autor_id=? AND ${mesFiltro('criado_em')}`, c.id, mm, yy);
    const curtidas = cnt(`SELECT COUNT(*) c FROM mural_curtidas WHERE colaborador_id=? AND ${mesFiltro('criado_em')}`, c.id, mm, yy);
    const leituras = cnt(`SELECT COUNT(*) c FROM mural_leituras WHERE colaborador_id=? AND ${mesFiltro('criado_em')}`, c.id, mm, yy);
    const votos = cnt(`SELECT COUNT(*) c FROM mural_enquete_votos WHERE colaborador_id=? AND ${mesFiltro('criado_em')}`, c.id, mm, yy);
    const conquistas = cnt(`SELECT COUNT(*) c FROM certificados WHERE colaborador_id=? AND validado=1 AND ${mesFiltro('criado_em')}`, c.id, mm, yy);
    const pontos = posts * PESO.posts + comentarios * PESO.comentarios + curtidas * PESO.curtidas + leituras * PESO.leituras + votos * PESO.votos + conquistas * PESO.conquistas;
    // ── sinais de ATENÇÃO (disciplina) ──
    const atrasadas = cnt(`SELECT COUNT(*) c FROM tarefas WHERE responsavel_id=? AND status!='concluido' AND (status='atrasado' OR (prazo IS NOT NULL AND prazo < datetime('now')))`, c.id);
    const concl = cnt(`SELECT COUNT(*) c FROM tarefas WHERE responsavel_id=? AND status='concluido' AND ${mesFiltro('concluido_em')}`, c.id, mm, yy);
    const conclNoPrazo = cnt(`SELECT COUNT(*) c FROM tarefas WHERE responsavel_id=? AND status='concluido' AND ${mesFiltro('concluido_em')} AND (prazo IS NULL OR concluido_em <= prazo)`, c.id, mm, yy);
    // ocorrências geradas no mês
    const ocorrencias = cnt(`SELECT COUNT(*) c FROM ocorrencias WHERE colaborador_id=? AND ${mesFiltro('criado_em')}`, c.id, mm, yy);
    // não deu ciência: tarefa aberta há +24h que a pessoa ainda não abriu (sem tarefa_leitura)
    const cienciaPendente = cnt(`SELECT COUNT(*) c FROM tarefas t WHERE t.responsavel_id=? AND t.status!='concluido'
      AND t.criado_em < datetime('now','-24 hours')
      AND NOT EXISTS (SELECT 1 FROM tarefa_leitura l WHERE l.tarefa_id=t.id AND l.colaborador_id=t.responsavel_id)`, c.id);
    // encomendas pendentes (tarefa origem=encomenda em aberto)
    const encomendas = cnt(`SELECT COUNT(*) c FROM tarefas WHERE responsavel_id=? AND origem='encomenda' AND status!='concluido'`, c.id);
    const atencao = ocorrencias * 10 + atrasadas * 5 + cienciaPendente * 3 + encomendas * 2;
    return { id: c.id, nome: c.nome, loja_id: c.loja_id, posts, comentarios, curtidas, leituras, votos, conquistas, pontos,
      tarefas_atrasadas: atrasadas, concluidas: concl, pontualidade: concl ? Math.round((conclNoPrazo / concl) * 100) : null,
      ocorrencias, ciencia_pendente: cienciaPendente, encomendas, atencao };
  });

  const engajamento = linhas.filter(l => l.pontos > 0).sort((a, b) => b.pontos - a.pontos);
  const atrasos = linhas.filter(l => l.atencao > 0).sort((a, b) => b.atencao - a.atencao);
  res.json({ mes, ano, escopo: querTodas ? 'rede' : 'loja', pesos: PESO, engajamento, atrasos });
});

// Quem confirmou leitura (gestão) — para o comunicado.
router.get('/posts/:id/leram', (req, res) => {
  if (!podeComunicar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const leram = db.prepare(`SELECT c.nome, l.criado_em FROM mural_leituras l JOIN colaboradores c ON c.id=l.colaborador_id WHERE l.post_id=? ORDER BY l.criado_em`).all(req.params.id);
  res.json({ leram });
});

// ── Celebrações: aniversariantes, tempo de casa e novos colaboradores ────────────
router.get('/celebracoes', (req, res) => {
  const emp = req.usuario.empresa_id;
  const lojaNome = `(SELECT nome FROM lojas WHERE id=c.loja_id)`;
  const base = `FROM colaboradores c WHERE c.empresa_id=? AND c.ativo=1`;
  const hoje = db.prepare(`SELECT c.nome, ${lojaNome} loja ${base}
    AND c.nascimento IS NOT NULL AND c.nascimento<>'' AND strftime('%m-%d', c.nascimento)=strftime('%m-%d','now','localtime')
    ORDER BY c.nome`).all(emp);
  const mes = db.prepare(`SELECT c.nome, ${lojaNome} loja, strftime('%d', c.nascimento) dia ${base}
    AND c.nascimento IS NOT NULL AND c.nascimento<>'' AND strftime('%m', c.nascimento)=strftime('%m','now','localtime')
    ORDER BY strftime('%d', c.nascimento)`).all(emp);
  const tempoCasa = db.prepare(`SELECT c.nome, ${lojaNome} loja, strftime('%d', c.admissao) dia,
      (CAST(strftime('%Y','now') AS INT) - CAST(strftime('%Y', c.admissao) AS INT)) anos ${base}
    AND c.admissao IS NOT NULL AND strftime('%m', c.admissao)=strftime('%m','now','localtime')
    AND CAST(strftime('%Y', c.admissao) AS INT) < CAST(strftime('%Y','now') AS INT)
    ORDER BY strftime('%d', c.admissao)`).all(emp);
  const novos = db.prepare(`SELECT c.nome, ${lojaNome} loja, c.admissao, (SELECT nome FROM funcoes WHERE id=c.funcao_id) funcao ${base}
    AND c.admissao IS NOT NULL AND c.admissao >= date('now','-30 days','localtime')
    ORDER BY c.admissao DESC`).all(emp);
  // De férias agora (afastamento tipo=ferias com o período incluindo hoje)
  let ferias = [];
  try {
    ferias = db.prepare(`SELECT c.nome, ${lojaNome} loja, a.data_fim
      FROM afastamentos a JOIN colaboradores c ON c.id=a.colaborador_id
      WHERE a.empresa_id=? AND c.ativo=1 AND a.tipo='ferias'
        AND date(a.data_inicio)<=date('now','localtime') AND (a.data_fim IS NULL OR date(a.data_fim)>=date('now','localtime'))
      ORDER BY c.nome`).all(emp);
  } catch { ferias = []; }
  // De folga HOJE (folga aprovada com data = hoje)
  let folgas = [];
  try {
    folgas = db.prepare(`SELECT c.nome, ${lojaNome} loja, f.turno
      FROM folgas f JOIN colaboradores c ON c.id=f.colaborador_id
      WHERE f.empresa_id=? AND c.ativo=1 AND f.status='aprovada' AND date(f.data)=date('now','localtime')
      ORDER BY c.nome`).all(emp);
  } catch { folgas = []; }
  // Tempo de casa do próprio usuário (para o card de perfil)
  let eu = null;
  const me = db.prepare('SELECT admissao FROM colaboradores WHERE id=?').get(req.usuario.id);
  if (me && me.admissao) {
    const ini = new Date(String(me.admissao).slice(0, 10) + 'T00:00:00'), now = new Date();
    let meses = (now.getFullYear() - ini.getFullYear()) * 12 + (now.getMonth() - ini.getMonth());
    if (now.getDate() < ini.getDate()) meses--;
    if (meses < 0) meses = 0;
    eu = { admissao: me.admissao, anos: Math.floor(meses / 12), meses: meses % 12 };
  }
  res.json({ aniversariantes_hoje: hoje, aniversariantes_mes: mes, tempo_casa: tempoCasa, novos, ferias, folgas, eu });
});

// ── Agenda de eventos (gestão/RH cadastra; todos veem) ───────────────────────────
router.get('/eventos', (req, res) => {
  // Evento "só escritório" (escritorio=1) só aparece p/ quem é do escritório.
  const ehEscritorio = req.usuario.escritorio ? 1 : 0;
  const eventos = db.prepare(`SELECT id, titulo, descricao, data, hora, local, loja_id, escritorio, autor_nome, autor_id
    FROM mural_eventos WHERE empresa_id=? AND (loja_id IS NULL OR loja_id=?)
      AND (escritorio=0 OR escritorio IS NULL OR ?=1)
      AND data >= date('now','localtime') ORDER BY data ASC, COALESCE(hora,'99:99') ASC LIMIT 30`)
    .all(req.usuario.empresa_id, req.usuario.loja_id, ehEscritorio);
  res.json({ eventos, pode_criar: podeComunicar(req.usuario) });
});
router.post('/eventos', (req, res) => {
  if (!podeComunicar(req.usuario)) return res.status(403).json({ erro: 'Só a gestão/RH cadastra eventos.' });
  const titulo = (req.body.titulo || '').toString().trim().slice(0, 200);
  const data = (req.body.data || '').toString().slice(0, 10);
  if (!titulo || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ erro: 'Informe o título e a data do evento.' });
  const lojaId = req.body.loja_id || null;
  db.prepare(`INSERT INTO mural_eventos (id,empresa_id,titulo,descricao,data,hora,local,loja_id,escritorio,autor_id,autor_nome,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(uuidv4(), req.usuario.empresa_id, titulo, (req.body.descricao || '').toString().slice(0, 2000),
      data, (req.body.hora || '').toString().slice(0, 5) || null, (req.body.local || '').toString().slice(0, 200) || null,
      lojaId, req.body.escritorio ? 1 : 0, req.usuario.id, req.usuario.nome);
  res.status(201).json({ ok: true });
});
router.delete('/eventos/:id', (req, res) => {
  const e = db.prepare(`SELECT autor_id FROM mural_eventos WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!e) return res.status(404).json({ erro: 'Evento não encontrado.' });
  if (e.autor_id !== req.usuario.id && !podeComunicar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare(`DELETE FROM mural_eventos WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ── Documentos institucionais (Regimento Interno / Código de Conduta) ────────────
router.get('/institucional', (req, res) => {
  const docs = db.prepare(`SELECT chave, titulo, conteudo, atualizado_em FROM mural_institucional WHERE empresa_id=?`).all(req.usuario.empresa_id);
  res.json({ documentos: docs, pode_editar: podeComunicar(req.usuario) });
});
router.put('/institucional/:chave', (req, res) => {
  if (!podeComunicar(req.usuario)) return res.status(403).json({ erro: 'Só a gestão/RH edita.' });
  if (!['regimento', 'conduta'].includes(req.params.chave)) return res.status(400).json({ erro: 'Documento inválido.' });
  const titulo = (req.body.titulo || '').toString().slice(0, 200);
  const conteudo = (req.body.conteudo || '').toString().slice(0, 200000);
  db.prepare(`INSERT INTO mural_institucional (empresa_id,chave,titulo,conteudo,atualizado_por,atualizado_em)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,chave) DO UPDATE SET titulo=excluded.titulo, conteudo=excluded.conteudo, atualizado_por=excluded.atualizado_por, atualizado_em=datetime('now')`)
    .run(req.usuario.empresa_id, req.params.chave, titulo || (req.params.chave === 'regimento' ? 'Regimento Interno' : 'Código de Conduta'), conteudo, req.usuario.id);
  res.json({ ok: true });
});

// ── Ranking público de engajamento (todos veem, p/ motivar) ──────────────────────
const REGRAS_PONTOS = [
  { acao: 'Publicar um post', pts: 5 }, { acao: 'Comentar', pts: 2 },
  { acao: 'Reagir com emoji', pts: 1 }, { acao: 'Confirmar leitura de comunicado', pts: 1 },
  { acao: 'Votar em enquete', pts: 1 }, { acao: 'Concluir um curso/conquista', pts: 10 },
];
let _rankCache = {};
function rankingPublico(empresaId) {
  if (_rankCache[empresaId] && Date.now() - _rankCache[empresaId].t < 60000) return _rankCache[empresaId].data;
  const d = new Date(), mm = String(d.getMonth() + 1).padStart(2, '0'), yy = String(d.getFullYear());
  const mesF = col => `strftime('%m',${col})='${mm}' AND strftime('%Y',${col})='${yy}'`;
  const pts = {}; const add = (id, n) => { if (id) pts[id] = (pts[id] || 0) + n; };
  const agg = (sql, peso) => { try { db.prepare(sql).all(empresaId).forEach(r => add(r.id, r.n * peso)); } catch { /* tabela pode faltar */ } };
  agg(`SELECT autor_id id, COUNT(*) n FROM mural_posts WHERE empresa_id=? AND ${mesF('criado_em')} GROUP BY autor_id`, PESO.posts);
  agg(`SELECT autor_id id, COUNT(*) n FROM mural_comentarios WHERE ${mesF('criado_em')} AND post_id IN (SELECT id FROM mural_posts WHERE empresa_id=?) GROUP BY autor_id`, PESO.comentarios);
  agg(`SELECT colaborador_id id, COUNT(*) n FROM mural_curtidas WHERE ${mesF('criado_em')} AND post_id IN (SELECT id FROM mural_posts WHERE empresa_id=?) GROUP BY colaborador_id`, PESO.curtidas);
  agg(`SELECT colaborador_id id, COUNT(*) n FROM mural_leituras WHERE ${mesF('criado_em')} AND post_id IN (SELECT id FROM mural_posts WHERE empresa_id=?) GROUP BY colaborador_id`, PESO.leituras);
  agg(`SELECT colaborador_id id, COUNT(*) n FROM mural_enquete_votos WHERE ${mesF('criado_em')} AND post_id IN (SELECT id FROM mural_posts WHERE empresa_id=?) GROUP BY colaborador_id`, PESO.votos);
  agg(`SELECT colaborador_id id, COUNT(*) n FROM certificados WHERE empresa_id=? AND validado=1 AND ${mesF('criado_em')} GROUP BY colaborador_id`, PESO.conquistas);
  const ids = Object.keys(pts).filter(Boolean);
  let lista = [];
  if (ids.length) {
    const nomes = {}; db.prepare(`SELECT id, nome FROM colaboradores WHERE ativo=1 AND id IN (${ids.map(() => '?').join(',')})`).all(...ids).forEach(c => nomes[c.id] = c.nome);
    lista = ids.filter(id => nomes[id]).map(id => ({ id, nome: nomes[id], pontos: pts[id] })).sort((a, b) => b.pontos - a.pontos).slice(0, 15);
  }
  _rankCache[empresaId] = { t: Date.now(), data: lista };
  return lista;
}
router.get('/ranking', (req, res) => {
  const lista = rankingPublico(req.usuario.empresa_id);
  const posicao = lista.findIndex(x => x.id === req.usuario.id);
  res.json({ ranking: lista, regras: REGRAS_PONTOS, meus_pontos: posicao >= 0 ? lista[posicao].pontos : 0, minha_posicao: posicao >= 0 ? posicao + 1 : null });
});

// Posts programados (gestão/marketing) — agendados para o futuro.
router.get('/programados', (req, res) => {
  if (!podeAgendar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const rows = db.prepare(`SELECT id, tipo, titulo, texto, publicar_em, autor_nome FROM mural_posts
    WHERE empresa_id=? AND publicar_em IS NOT NULL AND publicar_em > strftime('%Y-%m-%d %H:%M','now','localtime')
    ORDER BY publicar_em ASC`).all(req.usuario.empresa_id);
  res.json({ programados: rows });
});

// ── Patrocinado (marcas pagam para aparecer; gestão gerencia) ─────────────────────
router.get('/patrocinios', (req, res) => {
  const itens = db.prepare(`SELECT id, titulo, link, (imagem IS NOT NULL) tem_imagem FROM mural_patrocinio WHERE empresa_id=? AND ativo=1 ORDER BY ordem, criado_em DESC`).all(req.usuario.empresa_id);
  res.json({ patrocinios: itens, pode_gerenciar: podeComunicar(req.usuario) });
});
router.get('/patrocinios/:id/imagem', (req, res) => {
  const p = db.prepare(`SELECT imagem FROM mural_patrocinio WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p || !p.imagem) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.send(Buffer.from(p.imagem.replace(/^data:.*;base64,/, ''), 'base64'));
});
router.post('/patrocinios', (req, res) => {
  if (!podeComunicar(req.usuario)) return res.status(403).json({ erro: 'Só a gestão gerencia patrocínios.' });
  const titulo = (req.body.titulo || '').toString().slice(0, 120);
  if (!titulo && !req.body.imagem) return res.status(400).json({ erro: 'Informe o nome da marca ou uma imagem.' });
  db.prepare(`INSERT INTO mural_patrocinio (id,empresa_id,titulo,imagem,link,ativo,ordem,criado_em) VALUES (?,?,?,?,?,1,?,datetime('now'))`)
    .run(uuidv4(), req.usuario.empresa_id, titulo || null, (req.body.imagem || '').toString().slice(0, 3_000_000) || null, (req.body.link || '').toString().slice(0, 500) || null, parseInt(req.body.ordem) || 0);
  res.status(201).json({ ok: true });
});
router.delete('/patrocinios/:id', (req, res) => {
  if (!podeComunicar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare(`DELETE FROM mural_patrocinio WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── Canal de escuta: denúncia / sugestão / reclamação / elogio ───────────────────
const podeOuvidoria = u => ['RH', 'Gestor Geral', 'Diretor Geral', 'Ouvidoria', 'Supervisor'].includes(u.funcao_nome);
router.post('/ouvidoria', (req, res) => {
  const tipo = ['denuncia', 'sugestao', 'reclamacao', 'elogio'].includes(req.body.tipo) ? req.body.tipo : 'sugestao';
  const texto = (req.body.texto || '').toString().trim().slice(0, 4000);
  if (!texto) return res.status(400).json({ erro: 'Escreva sua mensagem.' });
  const anonimo = req.body.anonimo ? 1 : 0;
  const id = uuidv4();
  db.prepare(`INSERT INTO ouvidoria (id,empresa_id,tipo,texto,anonimo,colaborador_id,colaborador_nome,loja_id,status,criado_em)
    VALUES (?,?,?,?,?,?,?,?, 'aberto', datetime('now'))`)
    .run(id, req.usuario.empresa_id, tipo, texto, anonimo,
      anonimo ? null : req.usuario.id, anonimo ? null : req.usuario.nome, req.usuario.loja_id || null);
  // Abre tarefa SÓ para o Diretor.
  const TIPO_L = { denuncia: 'Denúncia', sugestao: 'Sugestão', reclamacao: 'Reclamação', elogio: 'Elogio' };
  const diretor = db.prepare(`SELECT id, loja_id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-diretor' AND ativo=1 LIMIT 1`).get(req.usuario.empresa_id);
  if (diretor) gerarTarefa({
    empresa_id: req.usuario.empresa_id, loja_id: diretor.loja_id || null, tipo: 'tarefa', origem: 'ouvidoria', referencia_id: id,
    titulo: `Canal de escuta — ${TIPO_L[tipo] || 'Mensagem'}`,
    descricao: `${texto}\n\n— ${anonimo ? 'Enviado de forma anônima' : (req.usuario.nome || 'colaborador')}. Responda no menu “Canal de escuta”.`,
    responsavel_id: diretor.id, urgente: tipo === 'denuncia' ? 1 : 0, sla_horas: 72, criado_por: null,
  });
  res.status(201).json({ ok: true, mensagem: 'Recebido! Obrigado por falar com a gente. 💚' });
});
router.get('/ouvidoria', (req, res) => {
  if (!podeOuvidoria(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const rows = db.prepare(`SELECT id, tipo, texto, anonimo, colaborador_nome, status, resposta, criado_em FROM ouvidoria
    WHERE empresa_id=? ORDER BY (status='aberto') DESC, criado_em DESC LIMIT 100`).all(req.usuario.empresa_id);
  res.json({ mensagens: rows });
});
router.patch('/ouvidoria/:id', (req, res) => {
  if (!podeOuvidoria(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const status = ['aberto', 'em_analise', 'resolvido'].includes(req.body.status) ? req.body.status : null;
  const resposta = req.body.resposta != null ? (req.body.resposta || '').toString().slice(0, 4000) : null;
  db.prepare(`UPDATE ouvidoria SET status=COALESCE(?,status), resposta=COALESCE(?,resposta), respondido_por=?, atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`)
    .run(status, resposta, req.usuario.id, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

module.exports = router;
