// formulas.js — controle de entrega de fórmulas manipuladas.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { listarFormulas } = require('../lib/formulasErp');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    res.json(await listarFormulas(req.usuario.empresa_id, {
      lojaId: req.query.loja || undefined, dias: Number(req.query.dias) || 30, status: req.query.status || undefined,
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Atualiza o status de entrega de uma fórmula (aguardando→chegou→avisado→entregue).
// Ao marcar "chegou", gera uma tarefa p/ o vendedor ligar/entregar.
router.put('/:crid', (req, res) => {
  const emp = req.usuario.empresa_id;
  const { status, responsavel_id, responsavel_nome, obs, loja_id, cliente, telefone, formula } = req.body;
  const existe = db.prepare('SELECT crediario_id, tarefa_id FROM formulas_controle WHERE empresa_id=? AND crediario_id=?').get(emp, req.params.crid);
  db.prepare(`INSERT INTO formulas_controle (empresa_id,crediario_id,loja_id,status,responsavel_id,responsavel_nome,obs,atualizado_por,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,crediario_id) DO UPDATE SET status=COALESCE(excluded.status,status),
      responsavel_id=COALESCE(excluded.responsavel_id,responsavel_id), responsavel_nome=COALESCE(excluded.responsavel_nome,responsavel_nome),
      obs=COALESCE(excluded.obs,obs), atualizado_por=excluded.atualizado_por, atualizado_em=excluded.atualizado_em`)
    .run(emp, req.params.crid, loja_id || null, status || 'aguardando', responsavel_id || null, responsavel_nome || null, obs || null, req.usuario.id);

  let tarefaId = existe && existe.tarefa_id;
  if (status === 'chegou' && !tarefaId) {
    tarefaId = uuid();
    const desc = `A fórmula de ${cliente || 'cliente'}${telefone ? ' (' + telefone + ')' : ''}${formula ? ' — ' + formula : ''} chegou na farmácia. `
      + `Ligue para o cliente e combine a entrega (ou acione o entregador).`;
    db.prepare(`INSERT INTO tarefas (id,empresa_id,loja_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
      VALUES (?,?,?, 'tarefa','formula',?,?,?,?,'aberto',datetime('now'),datetime('now'))`)
      .run(tarefaId, emp, loja_id || null, 'formula:' + req.params.crid, `💊 Fórmula chegou — ${cliente || 'cliente'}`.slice(0, 140), desc, responsavel_id || req.usuario.id);
    db.prepare('UPDATE formulas_controle SET tarefa_id=? WHERE empresa_id=? AND crediario_id=?').run(tarefaId, emp, req.params.crid);
  }
  res.json({ ok: true, tarefaId });
});

module.exports = router;
