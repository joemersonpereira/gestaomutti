// controladoria.js — Checklist de fechamento com ciência (quem validou + quando) e geração de
// tarefa de análise no painel de Tarefas. Só direção/controladoria.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

router.use(auth);
const GATE = ['Diretor Geral', 'Gestor Geral', 'Controladoria'];
const podeGestao = u => GATE.includes(u.funcao_nome);

const ref = (comp, item) => `${comp}:${item}`;

// Estado de cada item numa competência: tarefa gerada? status? validado (ciência)?
router.get('/fechamento', (req, res) => {
  const u = req.usuario;
  if (!podeGestao(u)) return res.status(403).json({ erro: 'Área da controladoria.' });
  const comp = req.query.competencia;
  if (!comp) return res.status(400).json({ erro: 'competencia obrigatória.' });
  const rows = db.prepare('SELECT item_key, tarefa_id, validado_por, validado_em FROM fechamento_check WHERE empresa_id=? AND competencia=?').all(u.empresa_id, comp);
  const byItem = {};
  rows.forEach(r => {
    let status = null;
    if (r.tarefa_id) { const t = db.prepare('SELECT status FROM tarefas WHERE id=?').get(r.tarefa_id); status = t?.status || null; }
    byItem[r.item_key] = { tarefa_id: r.tarefa_id, tarefa_status: status, validado_por: r.validado_por, validado_em: r.validado_em };
  });
  res.json({ competencia: comp, itens: byItem });
});

// Gerar tarefa de análise para um item (idempotente por referência).
router.post('/fechamento/tarefa', (req, res) => {
  const u = req.usuario;
  if (!podeGestao(u)) return res.status(403).json({ erro: 'Área da controladoria.' });
  const { competencia, item_key, titulo } = req.body;
  if (!competencia || !item_key) return res.status(400).json({ erro: 'competencia e item_key obrigatórios.' });
  const r = ref(competencia, item_key);
  let tarefa = db.prepare("SELECT id FROM tarefas WHERE empresa_id=? AND origem='fechamento' AND referencia_id=?").get(u.empresa_id, r);
  let tarefaId = tarefa?.id;
  if (!tarefaId) {
    tarefaId = uuid();
    db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,apoio_id,status,criado_em,atualizado_em)
      VALUES (?,?,'analise','fechamento',?,?,?,?,NULL,'aberto',datetime('now'),datetime('now'))`)
      .run(tarefaId, u.empresa_id, r, (titulo || `Fechamento ${competencia} — análise`).slice(0, 140), `Análise de fechamento (${competencia}). Ao concluir, valide no módulo Controladoria.`, u.id);
  }
  db.prepare(`INSERT INTO fechamento_check (empresa_id, competencia, item_key, tarefa_id) VALUES (?,?,?,?)
    ON CONFLICT(empresa_id, competencia, item_key) DO UPDATE SET tarefa_id=excluded.tarefa_id`)
    .run(u.empresa_id, competencia, item_key, tarefaId);
  res.json({ ok: true, tarefa_id: tarefaId });
});

// Dar ciência / validar um item (registra quem + quando; conclui a tarefa de análise se houver).
router.post('/fechamento/validar', (req, res) => {
  const u = req.usuario;
  if (!podeGestao(u)) return res.status(403).json({ erro: 'Área da controladoria.' });
  const { competencia, item_key, validar } = req.body;
  if (!competencia || !item_key) return res.status(400).json({ erro: 'competencia e item_key obrigatórios.' });
  const atual = db.prepare('SELECT tarefa_id FROM fechamento_check WHERE empresa_id=? AND competencia=? AND item_key=?').get(u.empresa_id, competencia, item_key);
  const tarefaId = atual?.tarefa_id || null;
  if (validar === false) {
    db.prepare(`INSERT INTO fechamento_check (empresa_id, competencia, item_key, validado_por, validado_em) VALUES (?,?,?,NULL,NULL)
      ON CONFLICT(empresa_id, competencia, item_key) DO UPDATE SET validado_por=NULL, validado_em=NULL`).run(u.empresa_id, competencia, item_key);
    if (tarefaId) db.prepare("UPDATE tarefas SET status='aberto', atualizado_em=datetime('now') WHERE id=?").run(tarefaId);
    return res.json({ ok: true, validado: false });
  }
  db.prepare(`INSERT INTO fechamento_check (empresa_id, competencia, item_key, validado_por, validado_em) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, competencia, item_key) DO UPDATE SET validado_por=excluded.validado_por, validado_em=datetime('now')`)
    .run(u.empresa_id, competencia, item_key, u.nome);
  if (tarefaId) db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE id=?").run(tarefaId);
  res.json({ ok: true, validado: true });
});

module.exports = router;
