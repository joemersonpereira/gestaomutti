// capacitacao.js — Capacitação / T&D: cursos, avaliação trimestral (gerente→colaborador)
// e PDCA/PDI (plano de desenvolvimento + sugestões de melhoria).
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);
const GESTAO = ['RH', 'Gestor Geral', 'Diretor Geral', 'Controladoria', 'Financeiro'];
const LIDER = ['Gerente', 'Subgerente', 'Supervisor', ...GESTAO];
const ehGestao = u => GESTAO.includes(u.funcao_nome);
const ehLider = u => LIDER.includes(u.funcao_nome);
const now = () => "datetime('now')";

// Competências padrão (semeadas na 1ª leitura) — a gestão edita depois.
const COMP_PADRAO = ['Conhecimento técnico', 'Proatividade e iniciativa', 'Trabalho em equipe', 'Comunicação', 'Organização e disciplina', 'Foco no cliente', 'Foco em resultado', 'Comprometimento'];
function seedCompetencias(emp) {
  const n = db.prepare('SELECT COUNT(*) c FROM td_competencias WHERE empresa_id=?').get(emp).c;
  if (n) return;
  const ins = db.prepare('INSERT INTO td_competencias (id,empresa_id,nome,ordem,ativo) VALUES (?,?,?,?,1)');
  COMP_PADRAO.forEach((nome, i) => ins.run(uuid(), emp, nome, i));
}

// Colaboradores que o usuário pode avaliar/desenvolver: gestão = todos; líder = da sua loja.
function avaliaveis(u) {
  if (ehGestao(u)) return db.prepare(`SELECT c.id, c.nome, l.nome loja, f.nome funcao FROM colaboradores c
    LEFT JOIN lojas l ON l.id=c.loja_id LEFT JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 ORDER BY c.nome`).all(u.empresa_id);
  return db.prepare(`SELECT c.id, c.nome, l.nome loja, f.nome funcao FROM colaboradores c
    LEFT JOIN lojas l ON l.id=c.loja_id LEFT JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND c.loja_id=? ORDER BY c.nome`).all(u.empresa_id, u.loja_id || '');
}
const podeAvaliar = (u, colabId) => avaliaveis(u).some(c => c.id === colabId);

// ═══════════════ CURSOS ═══════════════
function cursoAplica(curso, funcaoId) {
  if (!curso.funcoes) return true;
  try { const arr = JSON.parse(curso.funcoes); return !arr.length || arr.includes(funcaoId); } catch { return true; }
}
router.get('/cursos', (req, res) => {
  const emp = req.usuario.empresa_id, u = req.usuario;
  const todos = db.prepare('SELECT * FROM cursos WHERE empresa_id=? AND ativo=1 ORDER BY obrigatorio DESC, titulo').all(emp);
  const gestao = ehGestao(u);
  const lista = todos.filter(c => gestao || cursoAplica(c, u.funcao_id)).map(c => {
    const concl = db.prepare('SELECT status, concluido_em FROM curso_conclusoes WHERE curso_id=? AND colaborador_id=?').get(c.id, u.id);
    const total = gestao ? db.prepare('SELECT COUNT(*) n FROM curso_conclusoes WHERE curso_id=?').get(c.id).n : null;
    return { ...c, funcoes: c.funcoes ? JSON.parse(c.funcoes) : [], concluido: !!concl, concluido_em: concl?.concluido_em || null, concluintes: total };
  });
  res.json({ cursos: lista, gestao });
});
router.post('/cursos', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {};
  if (!b.titulo || !b.titulo.trim()) return res.status(400).json({ erro: 'Informe o título do curso.' });
  const id = uuid();
  db.prepare(`INSERT INTO cursos (id,empresa_id,titulo,descricao,categoria,link,carga_horaria,obrigatorio,funcoes,pontos,trilha,trilha_ordem,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.usuario.empresa_id, b.titulo.trim(), (b.descricao || '').trim() || null,
    (b.categoria || '').trim() || null, (b.link || '').trim() || null, Number(b.carga_horaria) || null, b.obrigatorio ? 1 : 0,
    Array.isArray(b.funcoes) && b.funcoes.length ? JSON.stringify(b.funcoes) : null, Number(b.pontos) || 0,
    (b.trilha || '').trim() || null, Number(b.trilha_ordem) || null, req.usuario.id);
  res.status(201).json({ ok: true, id });
});
router.put('/cursos/:id', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM cursos WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Curso não encontrado.' });
  db.prepare(`UPDATE cursos SET titulo=?, descricao=?, categoria=?, link=?, carga_horaria=?, obrigatorio=?, funcoes=?, pontos=?, trilha=?, trilha_ordem=? WHERE id=?`)
    .run(b.titulo?.trim() || c.titulo, b.descricao != null ? (b.descricao.trim() || null) : c.descricao, b.categoria != null ? (b.categoria.trim() || null) : c.categoria,
      b.link != null ? (b.link.trim() || null) : c.link, b.carga_horaria != null ? Number(b.carga_horaria) || null : c.carga_horaria,
      b.obrigatorio != null ? (b.obrigatorio ? 1 : 0) : c.obrigatorio, b.funcoes != null ? (Array.isArray(b.funcoes) && b.funcoes.length ? JSON.stringify(b.funcoes) : null) : c.funcoes,
      b.pontos != null ? Number(b.pontos) || 0 : c.pontos, b.trilha != null ? ((b.trilha.trim()) || null) : c.trilha,
      b.trilha_ordem != null ? (Number(b.trilha_ordem) || null) : c.trilha_ordem, c.id);
  res.json({ ok: true });
});
router.delete('/cursos/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('UPDATE cursos SET ativo=0 WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
// Colaborador marca curso como concluído (+ certificado opcional + pontos)
router.post('/cursos/:id/concluir', (req, res) => {
  const emp = req.usuario.empresa_id, u = req.usuario;
  const curso = db.prepare('SELECT * FROM cursos WHERE id=? AND empresa_id=? AND ativo=1').get(req.params.id, emp);
  if (!curso) return res.status(404).json({ erro: 'Curso não encontrado.' });
  let certId = null;
  if (req.body.com_certificado) {
    certId = uuid();
    db.prepare(`INSERT INTO certificados (id,empresa_id,colaborador_id,tipo,titulo,descricao,emitido_por,pontos,fonte,validado,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,0,${now()})`).run(certId, emp, u.id, 'curso', curso.titulo, (req.body.obs || '').slice(0, 300) || null, (req.body.emitido_por || '').slice(0, 120) || null, curso.pontos || 0, 'capacitacao');
  }
  db.prepare(`INSERT INTO curso_conclusoes (id,curso_id,colaborador_id,status,certificado_id,concluido_em)
    VALUES (?,?,?, 'concluido', ?, ${now()})
    ON CONFLICT(curso_id, colaborador_id) DO UPDATE SET status='concluido', certificado_id=COALESCE(excluded.certificado_id, curso_conclusoes.certificado_id), concluido_em=${now()}`)
    .run(uuid(), curso.id, u.id, certId);
  // pontos idempotentes por curso/colaborador
  if (Number(curso.pontos) > 0) {
    const ref = `curso:${curso.id}:${u.id}`;
    if (!db.prepare('SELECT 1 FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').get(emp, ref)) {
      db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,tipo,descricao,pontos,competencia,origem,ref,criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,${now()})`).run(uuid(), emp, u.id, u.nome || null, 'curso', `Curso concluído: ${curso.titulo}`, Math.round(curso.pontos), new Date().toISOString().slice(0, 7), 'automatico', ref);
    }
  }
  res.json({ ok: true });
});
router.delete('/cursos/:id/concluir', (req, res) => {
  db.prepare('DELETE FROM curso_conclusoes WHERE curso_id=? AND colaborador_id=?').run(req.params.id, req.usuario.id);
  db.prepare('DELETE FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').run(req.usuario.empresa_id, `curso:${req.params.id}:${req.usuario.id}`);
  res.json({ ok: true });
});

// ═══════════════ COMPETÊNCIAS (config) ═══════════════
router.get('/competencias', (req, res) => {
  seedCompetencias(req.usuario.empresa_id);
  res.json({ competencias: db.prepare('SELECT * FROM td_competencias WHERE empresa_id=? AND ativo=1 ORDER BY ordem, nome').all(req.usuario.empresa_id), gestao: ehGestao(req.usuario) });
});
router.post('/competencias', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {};
  if (!b.nome || !b.nome.trim()) return res.status(400).json({ erro: 'Informe o nome da competência.' });
  if (b.id) db.prepare('UPDATE td_competencias SET nome=?, descricao=? WHERE id=? AND empresa_id=?').run(b.nome.trim(), (b.descricao || '').trim() || null, b.id, req.usuario.empresa_id);
  else { const ord = (db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM td_competencias WHERE empresa_id=?').get(req.usuario.empresa_id).m) + 1; db.prepare('INSERT INTO td_competencias (id,empresa_id,nome,descricao,ordem,ativo) VALUES (?,?,?,?,?,1)').run(uuid(), req.usuario.empresa_id, b.nome.trim(), (b.descricao || '').trim() || null, ord); }
  res.json({ ok: true });
});
router.delete('/competencias/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('UPDATE td_competencias SET ativo=0 WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ═══════════════ AVALIAÇÃO TRIMESTRAL (gerente/RH → colaborador) ═══════════════
router.get('/avaliacoes/colaboradores', (req, res) => {
  if (!ehLider(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  res.json({ colaboradores: avaliaveis(req.usuario) });
});
// Template + respostas de uma avaliação (colaborador/trimestre/ano)
router.get('/avaliacao', (req, res) => {
  const u = req.usuario, emp = u.empresa_id;
  const colabId = req.query.colaborador_id;
  const tri = parseInt(req.query.trimestre) || Math.floor(new Date().getMonth() / 3) + 1;
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  if (!ehLider(u) || !podeAvaliar(u, colabId)) return res.status(403).json({ erro: 'Sem permissão para avaliar este colaborador.' });
  seedCompetencias(emp);
  const comps = db.prepare('SELECT * FROM td_competencias WHERE empresa_id=? AND ativo=1 ORDER BY ordem, nome').all(emp);
  // Cada avaliador (gerente, subgerente…) tem a SUA avaliação do mesmo colaborador.
  const av = db.prepare('SELECT * FROM td_avaliacao WHERE empresa_id=? AND colaborador_id=? AND trimestre=? AND ano=? AND avaliador_id=?').get(emp, colabId, tri, ano, u.id);
  const itens = av ? db.prepare('SELECT competencia_id, nota FROM td_avaliacao_item WHERE avaliacao_id=?').all(av.id) : [];
  const notaDe = {}; itens.forEach(i => { notaDe[i.competencia_id] = i.nota; });
  // Outras avaliações concluídas do mesmo trimestre (p/ comparar visões)
  const outras = db.prepare(`SELECT avaliador_nome, status FROM td_avaliacao WHERE empresa_id=? AND colaborador_id=? AND trimestre=? AND ano=? AND avaliador_id<>? AND status='concluida'`).all(emp, colabId, tri, ano, u.id);
  res.json({ trimestre: tri, ano, avaliacao: av || null, competencias: comps.map(c => ({ ...c, nota: notaDe[c.id] ?? null })), outras_visoes: outras });
});
// Salvar/concluir avaliação
router.post('/avaliacao', (req, res) => {
  const u = req.usuario, emp = u.empresa_id, b = req.body || {};
  const colabId = b.colaborador_id;
  const tri = parseInt(b.trimestre) || Math.floor(new Date().getMonth() / 3) + 1;
  const ano = parseInt(b.ano) || new Date().getFullYear();
  if (!ehLider(u) || !podeAvaliar(u, colabId)) return res.status(403).json({ erro: 'Sem permissão para avaliar este colaborador.' });
  let av = db.prepare('SELECT * FROM td_avaliacao WHERE empresa_id=? AND colaborador_id=? AND trimestre=? AND ano=? AND avaliador_id=?').get(emp, colabId, tri, ano, u.id);
  const status = b.status === 'concluida' ? 'concluida' : 'rascunho';
  if (!av) {
    const id = uuid();
    db.prepare(`INSERT INTO td_avaliacao (id,empresa_id,colaborador_id,trimestre,ano,avaliador_id,avaliador_nome,status,pontos_fortes,a_desenvolver,comentario,atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,${now()})`).run(id, emp, colabId, tri, ano, u.id, u.nome || null, status, (b.pontos_fortes || '').trim() || null, (b.a_desenvolver || '').trim() || null, (b.comentario || '').trim() || null);
    av = { id };
  } else {
    db.prepare(`UPDATE td_avaliacao SET avaliador_id=?, avaliador_nome=?, status=?, pontos_fortes=?, a_desenvolver=?, comentario=?, atualizado_em=${now()} WHERE id=?`)
      .run(u.id, u.nome || null, status, (b.pontos_fortes || '').trim() || null, (b.a_desenvolver || '').trim() || null, (b.comentario || '').trim() || null, av.id);
  }
  const up = db.prepare(`INSERT INTO td_avaliacao_item (id,avaliacao_id,competencia_id,nota) VALUES (?,?,?,?)
    ON CONFLICT(avaliacao_id, competencia_id) DO UPDATE SET nota=excluded.nota`);
  (b.notas || []).forEach(n => { if (n.competencia_id) up.run(uuid(), av.id, n.competencia_id, n.nota != null ? Number(n.nota) : null); });
  // avaliação vira premiação: ao concluir, credita pontos por faixa de nota (consolidado, idempotente)
  let premio = null;
  if (status === 'concluida') { try { premio = avConfig.premiarAvaliacao(emp, colabId, tri, ano); } catch { /* ignora */ } }
  res.json({ ok: true, id: av.id, premio });
});
// Histórico + "norte" (competências mais baixas) de um colaborador
router.get('/avaliacao/:colaboradorId/historico', (req, res) => {
  const u = req.usuario, emp = u.empresa_id, colabId = req.params.colaboradorId;
  const proprio = colabId === u.id;
  if (!proprio && (!ehLider(u) || !podeAvaliar(u, colabId))) return res.status(403).json({ erro: 'Sem permissão.' });
  const avs = db.prepare("SELECT * FROM td_avaliacao WHERE empresa_id=? AND colaborador_id=? AND status='concluida' ORDER BY ano DESC, trimestre DESC").all(emp, colabId);
  const ultima = avs[0] || null;
  let norte = [];
  if (ultima) {
    norte = db.prepare(`SELECT c.nome, i.nota FROM td_avaliacao_item i JOIN td_competencias c ON c.id=i.competencia_id
      WHERE i.avaliacao_id=? AND i.nota IS NOT NULL ORDER BY i.nota ASC LIMIT 3`).all(ultima.id);
  }
  res.json({ historico: avs.map(a => ({ id: a.id, trimestre: a.trimestre, ano: a.ano, avaliador_nome: a.avaliador_nome, pontos_fortes: a.pontos_fortes, a_desenvolver: a.a_desenvolver })), norte });
});

// ═══════════════ PDCA / PDI ═══════════════
router.get('/pdi', (req, res) => {
  const u = req.usuario, emp = u.empresa_id, colabId = req.query.colaborador_id;
  const proprio = colabId === u.id;
  if (!colabId || (!proprio && (!ehLider(u) || !podeAvaliar(u, colabId)))) return res.status(403).json({ erro: 'Sem permissão.' });
  const rows = db.prepare("SELECT p.*, cu.titulo AS curso_titulo FROM td_pdi p LEFT JOIN cursos cu ON cu.id=p.curso_id WHERE p.empresa_id=? AND p.colaborador_id=? ORDER BY (p.status='concluido' OR p.status='cancelado'), p.criado_em DESC").all(emp, colabId);
  res.json({ pdi: rows, podeEditar: ehLider(u) });
});
router.get('/pdi/meus', (req, res) => {
  const u = req.usuario;
  res.json({ pdi: db.prepare("SELECT p.*, cu.titulo AS curso_titulo FROM td_pdi p LEFT JOIN cursos cu ON cu.id=p.curso_id WHERE p.empresa_id=? AND p.colaborador_id=? ORDER BY (p.status='concluido' OR p.status='cancelado'), p.criado_em DESC").all(u.empresa_id, u.id) });
});
router.post('/pdi', (req, res) => {
  const u = req.usuario, emp = u.empresa_id, b = req.body || {};
  const colabId = b.colaborador_id;
  const origem = ['avaliacao', 'sugestao', 'manual'].includes(b.origem) ? b.origem : 'manual';
  // sugestão: o próprio colaborador OU o líder pode registrar; plano formal só líder/gestão
  const proprio = colabId === u.id;
  if (origem === 'sugestao') { if (!proprio && !ehLider(u)) return res.status(403).json({ erro: 'Sem permissão.' }); }
  else if (!ehLider(u) || !podeAvaliar(u, colabId)) return res.status(403).json({ erro: 'Sem permissão.' });
  if (!colabId || !b.tema || !b.tema.trim()) return res.status(400).json({ erro: 'Colaborador e tema são obrigatórios.' });
  const id = uuid();
  db.prepare(`INSERT INTO td_pdi (id,empresa_id,colaborador_id,tema,objetivo,acao,status,responsavel_id,prazo,origem,sugerido_por,avaliacao_id,curso_id,criado_por,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,${now()})`).run(id, emp, colabId, b.tema.trim(), (b.objetivo || '').trim() || null, (b.acao || '').trim() || null,
    origem === 'sugestao' ? 'planejado' : (b.status || 'planejado'), b.responsavel_id || null, (b.prazo || '').slice(0, 10) || null, origem,
    origem === 'sugestao' ? (u.nome || u.id) : null, b.avaliacao_id || null, b.curso_id || null, u.id);
  res.status(201).json({ ok: true, id });
});
router.put('/pdi/:id', (req, res) => {
  const u = req.usuario, b = req.body || {};
  if (!ehLider(u)) return res.status(403).json({ erro: 'Só a liderança/RH edita o plano.' });
  const p = db.prepare('SELECT * FROM td_pdi WHERE id=? AND empresa_id=?').get(req.params.id, u.empresa_id);
  if (!p) return res.status(404).json({ erro: 'PDI não encontrado.' });
  db.prepare(`UPDATE td_pdi SET tema=?, objetivo=?, acao=?, status=?, resultado=?, ajuste=?, responsavel_id=?, prazo=?, curso_id=?, atualizado_em=${now()} WHERE id=?`)
    .run(b.tema?.trim() || p.tema, b.objetivo != null ? (b.objetivo.trim() || null) : p.objetivo, b.acao != null ? (b.acao.trim() || null) : p.acao,
      b.status || p.status, b.resultado != null ? (b.resultado.trim() || null) : p.resultado, b.ajuste != null ? (b.ajuste.trim() || null) : p.ajuste,
      b.responsavel_id !== undefined ? (b.responsavel_id || null) : p.responsavel_id, b.prazo != null ? ((b.prazo || '').slice(0, 10) || null) : p.prazo,
      b.curso_id !== undefined ? (b.curso_id || null) : p.curso_id, p.id);
  res.json({ ok: true });
});
router.delete('/pdi/:id', (req, res) => {
  if (!ehLider(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare('DELETE FROM td_pdi WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ═══════════════ CONFIG do período de avaliação + abertura automática ═══════════════
const avConfig = require('../lib/avaliacaoTrimestral');
router.get('/avaliacao-config', (req, res) => {
  res.json({ ...avConfig.getConfig(req.usuario.empresa_id), premio: avConfig.getPremio(req.usuario.empresa_id), gestao: ehGestao(req.usuario) });
});
router.put('/avaliacao-config', exigePerfil(...GESTAO), (req, res) => {
  const out = avConfig.setConfig(req.usuario.empresa_id, req.body);
  if (Array.isArray(req.body.premio)) out.premio = avConfig.setPremio(req.usuario.empresa_id, req.body.premio);
  res.json(out);
});
// Abrir as tarefas do trimestre agora (manual, além do automático)
router.post('/avaliacao-config/abrir-agora', exigePerfil(...GESTAO), (req, res) => {
  res.json(avConfig.abrirTrimestre(req.usuario.empresa_id, true));
});

// ═══════════════ RELATÓRIO DE GAPS (norte do RH) ═══════════════
router.get('/relatorio', (req, res) => {
  const u = req.usuario, emp = u.empresa_id;
  if (!ehLider(u)) return res.status(403).json({ erro: 'Sem permissão.' });
  seedCompetencias(emp);
  const lojaId = req.query.loja_id || null;
  // último trimestre com avaliação concluída (ou o informado)
  let tri = parseInt(req.query.trimestre), ano = parseInt(req.query.ano);
  if (!tri || !ano) {
    const ult = db.prepare("SELECT trimestre, ano FROM td_avaliacao WHERE empresa_id=? AND status='concluida' ORDER BY ano DESC, trimestre DESC LIMIT 1").get(emp);
    tri = ult?.trimestre || Math.floor(new Date().getMonth() / 3) + 1; ano = ult?.ano || new Date().getFullYear();
  }
  // avaliações concluídas do trimestre (filtradas por loja do colaborador)
  const avs = db.prepare(`SELECT a.id, a.colaborador_id, c.nome colab_nome, c.loja_id, l.nome loja FROM td_avaliacao a
    JOIN colaboradores c ON c.id=a.colaborador_id LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE a.empresa_id=? AND a.trimestre=? AND a.ano=? AND a.status='concluida' ${lojaId ? 'AND c.loja_id=?' : ''}`).all(...(lojaId ? [emp, tri, ano, lojaId] : [emp, tri, ano]));
  const comps = db.prepare('SELECT id, nome FROM td_competencias WHERE empresa_id=? AND ativo=1 ORDER BY ordem, nome').all(emp);
  const porComp = {}; comps.forEach(c => { porComp[c.id] = { nome: c.nome, soma: 0, n: 0, baixas: 0 }; });
  const porColab = {};
  for (const av of avs) {
    const itens = db.prepare('SELECT competencia_id, nota FROM td_avaliacao_item WHERE avaliacao_id=? AND nota IS NOT NULL').all(av.id);
    let s = 0, k = 0;
    for (const it of itens) {
      if (porComp[it.competencia_id]) { porComp[it.competencia_id].soma += it.nota; porComp[it.competencia_id].n++; if (it.nota <= 2) porComp[it.competencia_id].baixas++; }
      s += it.nota; k++;
    }
    if (k) { const key = av.colaborador_id; porColab[key] = porColab[key] || { nome: av.colab_nome, loja: av.loja, soma: 0, n: 0 }; porColab[key].soma += s / k; porColab[key].n++; }
  }
  const competencias = comps.map(c => { const o = porComp[c.id]; return { nome: c.nome, media: o.n ? Math.round((o.soma / o.n) * 10) / 10 : null, avaliados: o.n, baixas: o.baixas }; })
    .filter(c => c.media != null).sort((a, b) => a.media - b.media);
  const colaboradores = Object.values(porColab).map(c => ({ nome: c.nome, loja: c.loja, media: Math.round((c.soma / c.n) * 10) / 10 })).sort((a, b) => a.media - b.media);
  // cursos obrigatórios: % de conclusão
  const obrig = db.prepare('SELECT id, titulo, funcoes FROM cursos WHERE empresa_id=? AND ativo=1 AND obrigatorio=1').all(emp);
  const totColab = db.prepare(`SELECT id, funcao_id FROM colaboradores WHERE empresa_id=? AND ativo=1 ${lojaId ? 'AND loja_id=?' : ''}`).all(...(lojaId ? [emp, lojaId] : [emp]));
  const cursosObrig = obrig.map(cu => {
    let alvo, feito = 0;
    try { const arr = cu.funcoes ? JSON.parse(cu.funcoes) : []; alvo = totColab.filter(c => !arr.length || arr.includes(c.funcao_id)); } catch { alvo = totColab; }
    const feitos = new Set(db.prepare('SELECT colaborador_id FROM curso_conclusoes WHERE curso_id=?').all(cu.id).map(x => x.colaborador_id));
    alvo.forEach(c => { if (feitos.has(c.id)) feito++; });
    return { titulo: cu.titulo, feito, total: alvo.length, pct: alvo.length ? Math.round(100 * feito / alvo.length) : 0 };
  }).sort((a, b) => a.pct - b.pct);
  res.json({ trimestre: tri, ano, total_avaliados: avs.length, competencias, colaboradores: colaboradores.slice(0, 15), cursos_obrigatorios: cursosObrig });
});

// ═══════════════ RESUMO p/ a FICHA 360 do colaborador ═══════════════
router.get('/colaborador/:id', (req, res) => {
  const u = req.usuario, emp = u.empresa_id, colabId = req.params.id;
  const proprio = colabId === u.id;
  if (!proprio && (!ehLider(u) || !podeAvaliar(u, colabId))) return res.status(403).json({ erro: 'Sem permissão.' });
  seedCompetencias(emp);
  // Cursos
  const concluidos = db.prepare(`SELECT c.titulo, c.categoria, c.pontos, cc.concluido_em FROM curso_conclusoes cc
    JOIN cursos c ON c.id=cc.curso_id WHERE cc.colaborador_id=? ORDER BY cc.concluido_em DESC`).all(colabId);
  const colab = db.prepare('SELECT funcao_id FROM colaboradores WHERE id=?').get(colabId) || {};
  const obrig = db.prepare('SELECT id, titulo, funcoes FROM cursos WHERE empresa_id=? AND ativo=1 AND obrigatorio=1').all(emp)
    .filter(c => { if (!c.funcoes) return true; try { const a = JSON.parse(c.funcoes); return !a.length || a.includes(colab.funcao_id); } catch { return true; } });
  const feitos = new Set(db.prepare('SELECT curso_id FROM curso_conclusoes WHERE colaborador_id=?').all(colabId).map(x => x.curso_id));
  const obrig_pend = obrig.filter(c => !feitos.has(c.id)).map(c => c.titulo);
  // Avaliações do ÚLTIMO trimestre — de TODOS os avaliadores (gerente, subgerente…) p/ comparar visões.
  const ult = db.prepare("SELECT trimestre, ano FROM td_avaliacao WHERE empresa_id=? AND colaborador_id=? AND status='concluida' ORDER BY ano DESC, trimestre DESC LIMIT 1").get(emp, colabId);
  let avaliacoes = [];
  if (ult) {
    const rows = db.prepare("SELECT * FROM td_avaliacao WHERE empresa_id=? AND colaborador_id=? AND trimestre=? AND ano=? AND status='concluida' ORDER BY atualizado_em DESC").all(emp, colabId, ult.trimestre, ult.ano);
    avaliacoes = rows.map(a => {
      const itens = db.prepare('SELECT c.nome, i.nota FROM td_avaliacao_item i JOIN td_competencias c ON c.id=i.competencia_id WHERE i.avaliacao_id=? AND i.nota IS NOT NULL').all(a.id);
      const media = itens.length ? Math.round((itens.reduce((x, y) => x + y.nota, 0) / itens.length) * 10) / 10 : null;
      return { trimestre: a.trimestre, ano: a.ano, avaliador_nome: a.avaliador_nome, nota_media: media, pontos_fortes: a.pontos_fortes, a_desenvolver: a.a_desenvolver, norte: [...itens].sort((x, y) => x.nota - y.nota).slice(0, 3) };
    });
  }
  // Consolidado (média das visões) quando há +1 avaliador no mesmo trimestre
  let consolidada = null;
  if (avaliacoes.length > 1 && ult) {
    const rows = db.prepare("SELECT id FROM td_avaliacao WHERE empresa_id=? AND colaborador_id=? AND trimestre=? AND ano=? AND status='concluida'").all(emp, colabId, ult.trimestre, ult.ano);
    const acc = {};
    for (const r of rows) {
      db.prepare('SELECT c.nome, i.nota FROM td_avaliacao_item i JOIN td_competencias c ON c.id=i.competencia_id WHERE i.avaliacao_id=? AND i.nota IS NOT NULL').all(r.id)
        .forEach(it => { (acc[it.nome] = acc[it.nome] || []).push(it.nota); });
    }
    const comps = Object.entries(acc).map(([nome, arr]) => ({ nome, media: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 }));
    const geral = comps.length ? Math.round((comps.reduce((a, c) => a + c.media, 0) / comps.length) * 10) / 10 : null;
    consolidada = { trimestre: ult.trimestre, ano: ult.ano, avaliadores: rows.length, nota_media: geral, norte: [...comps].sort((a, b) => a.media - b.media).slice(0, 3) };
  }
  // PDI ativo
  const pdi = db.prepare("SELECT tema, status, origem, prazo FROM td_pdi WHERE empresa_id=? AND colaborador_id=? ORDER BY (status='concluido' OR status='cancelado'), criado_em DESC").all(emp, colabId);
  res.json({
    cursos: { concluidos, total: concluidos.length, obrigatorios_pendentes: obrig_pend, obrigatorios_total: obrig.length },
    avaliacoes, consolidada,
    avaliacao: avaliacoes[0] || null, // compat
    pdi,
  });
});

module.exports = router;
