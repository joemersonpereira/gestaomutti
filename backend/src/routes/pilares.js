const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);

const GESTAO = ['Diretor Geral', 'Gestor Geral'];

// GET /pilares — lista pilares (com indicadores) para o cadastro
router.get('/', (req, res) => {
  const eid = req.usuario.empresa_id;
  const pilares = db.prepare(`SELECT * FROM pilares WHERE empresa_id=? ORDER BY ordem, nome`).all(eid).map(p => ({
    ...p,
    indicadores: db.prepare(`SELECT * FROM indicadores_def WHERE empresa_id=? AND pilar_id=? ORDER BY ordem, nome`).all(eid, p.id),
  }));
  const totalPeso = pilares.filter(p => p.ativo).reduce((a, p) => a + (p.peso || 0), 0);
  res.json({ pilares, total_peso: totalPeso });
});

// POST /pilares — novo pilar
router.post('/', exigePerfil(...GESTAO), (req, res) => {
  const { nome, cor, peso } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome do pilar é obrigatório.' });
  const eid = req.usuario.empresa_id;
  const ordem = (db.prepare(`SELECT MAX(ordem) m FROM pilares WHERE empresa_id=?`).get(eid)?.m ?? -1) + 1;
  const id = uuidv4();
  db.prepare(`INSERT INTO pilares (id,empresa_id,nome,cor,peso,ordem,ativo) VALUES (?,?,?,?,?,?,1)`)
    .run(id, eid, nome, cor || '#185FA5', Number(peso) || 0, ordem);
  res.status(201).json({ id, mensagem: 'Pilar criado.' });
});

// PATCH /pilares/:id — editar pilar (nome, cor, peso, ativo)
router.patch('/:id', exigePerfil(...GESTAO), (req, res) => {
  const p = db.prepare(`SELECT * FROM pilares WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Pilar não encontrado.' });
  const { nome, cor, peso, ativo } = req.body;
  db.prepare(`UPDATE pilares SET nome=?, cor=?, peso=?, ativo=? WHERE id=?`)
    .run(nome ?? p.nome, cor ?? p.cor, peso != null ? Number(peso) : p.peso, ativo != null ? (ativo ? 1 : 0) : p.ativo, p.id);
  res.json({ mensagem: 'Pilar atualizado.' });
});

// POST /pilares/indicadores — novo indicador (começa sem fonte automática)
router.post('/indicadores', exigePerfil(...GESTAO), (req, res) => {
  const { pilar_id, nome, min, acao } = req.body;
  if (!pilar_id || !nome) return res.status(400).json({ erro: 'Pilar e nome são obrigatórios.' });
  const eid = req.usuario.empresa_id;
  const pilar = db.prepare(`SELECT 1 FROM pilares WHERE id=? AND empresa_id=?`).get(pilar_id, eid);
  if (!pilar) return res.status(404).json({ erro: 'Pilar não encontrado.' });
  const ordem = (db.prepare(`SELECT MAX(ordem) m FROM indicadores_def WHERE empresa_id=? AND pilar_id=?`).get(eid, pilar_id)?.m ?? -1) + 1;
  const id = uuidv4();
  db.prepare(`INSERT INTO indicadores_def (id,empresa_id,pilar_id,nome,min,fonte,acao,ordem,ativo) VALUES (?,?,?,?,?,'manual',?,?,1)`)
    .run(id, eid, pilar_id, nome, Number(min) || 0, acao || null, ordem);
  res.status(201).json({ id, mensagem: 'Indicador criado (sem fonte automática até ser ligado).' });
});

// PATCH /pilares/indicadores/:id — editar indicador
router.patch('/indicadores/:id', exigePerfil(...GESTAO), (req, res) => {
  const i = db.prepare(`SELECT * FROM indicadores_def WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!i) return res.status(404).json({ erro: 'Indicador não encontrado.' });
  const { nome, min, pilar_id, acao, ativo, fonte } = req.body;
  const fontesOk = ['manual', 'checklist', 'ocorrencia', 'vendas', 'tesouraria', 'avaliacao'];
  db.prepare(`UPDATE indicadores_def SET nome=?, min=?, pilar_id=?, acao=?, ativo=?, fonte=? WHERE id=?`)
    .run(nome ?? i.nome, min != null ? Number(min) : i.min, pilar_id ?? i.pilar_id, acao ?? i.acao, ativo != null ? (ativo ? 1 : 0) : i.ativo, (fonte && fontesOk.includes(fonte)) ? fonte : i.fonte, i.id);
  res.json({ mensagem: 'Indicador atualizado.' });
});

// GET /pilares/notas-manuais?loja_id=&mes=&ano= — indicadores manuais + nota lançada
router.get('/notas-manuais', (req, res) => {
  const eid = req.usuario.empresa_id;
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const mes = parseInt(req.query.mes) || (new Date().getMonth() + 1);
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  const inds = db.prepare(`SELECT i.id, i.nome, i.fonte, p.nome as pilar_nome FROM indicadores_def i
    JOIN pilares p ON p.id=i.pilar_id WHERE i.empresa_id=? AND i.ativo=1 AND i.fonte='manual' ORDER BY p.ordem, i.ordem`).all(eid);
  const notas = db.prepare(`SELECT indicador_id, nota FROM indicador_nota_manual WHERE empresa_id=? AND loja_id=? AND mes=? AND ano=?`).all(eid, lojaId, mes, ano);
  const map = {}; notas.forEach(n => { map[n.indicador_id] = n.nota; });
  res.json({ mes, ano, indicadores: inds.map(i => ({ ...i, nota: map[i.id] != null ? map[i.id] : null })) });
});

// POST /pilares/notas-manuais — lança/atualiza a nota manual de um indicador (gestão)
router.post('/notas-manuais', exigePerfil(...GESTAO), (req, res) => {
  const eid = req.usuario.empresa_id;
  const { indicador_id } = req.body;
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const mes = parseInt(req.body.mes), ano = parseInt(req.body.ano);
  const nota = Math.max(0, Math.min(100, parseInt(req.body.nota)));
  if (!indicador_id || !lojaId || !mes || !ano || isNaN(nota)) return res.status(400).json({ erro: 'Dados incompletos.' });
  db.prepare(`INSERT INTO indicador_nota_manual (empresa_id,loja_id,indicador_id,mes,ano,nota,atualizado_em)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,loja_id,indicador_id,mes,ano) DO UPDATE SET nota=excluded.nota, atualizado_em=datetime('now')`)
    .run(eid, lojaId, indicador_id, mes, ano, nota);
  res.json({ mensagem: 'Nota lançada.', nota });
});

module.exports = router;
