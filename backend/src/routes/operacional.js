const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const op = require('../lib/operacional');

router.use(auth);

// Garante a tabela do ciclo diário do checklist operacional (abrir/fechar por loja).
db.exec(`CREATE TABLE IF NOT EXISTS operacional_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  aberto_em TEXT, fechado INTEGER DEFAULT 0, fechado_em TEXT,
  UNIQUE(empresa_id, loja_id, data)
);`);

function diaAbertoOk(empresaId, lojaId, h) {
  const dia = db.prepare(`SELECT aberto_em, fechado FROM operacional_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(empresaId, lojaId, h);
  return !!(dia?.aberto_em && !dia.fechado);
}

function hojeStr() { return new Date().toISOString().slice(0, 10); }
function periodoRef(periodicidade, h) {
  if (periodicidade === 'mensal') return h.slice(0, 7); // YYYY-MM
  if (periodicidade === 'semanal') {
    const d = new Date(h + 'T00:00:00'); const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // segunda
    return d.toISOString().slice(0, 10);
  }
  return h; // diária
}
function pegaExec(empresaId, item, lojaId, h) {
  const ref = periodoRef(item.periodicidade, h);
  let e = db.prepare('SELECT * FROM operacional_exec WHERE empresa_id=? AND item_id=? AND loja_id=? AND periodo_ref=?').get(empresaId, item.id, lojaId, ref);
  if (!e) { e = { item_id: item.id, loja_id: lojaId, periodo_ref: ref, data_prevista: h, status: 'pendente', adiamentos: 0 }; }
  return e;
}

// GET /operacional?loja_id=
router.get('/', (req, res) => {
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const h = hojeStr();
  const itens = db.prepare(`SELECT i.*, d.nome as checklist_nome, d.destino FROM operacional_itens i
    LEFT JOIN checklist_def d ON d.id=i.checklist_id
    WHERE i.empresa_id=? AND i.ativo=1 AND (i.loja_id IS NULL OR i.loja_id=?) ORDER BY d.nome, i.periodicidade, i.nome`).all(req.usuario.empresa_id, lojaId);
  const lista = itens.map(it => {
    const e = pegaExec(req.usuario.empresa_id, it, lojaId, h);
    return {
      id: it.id, nome: it.nome, periodicidade: it.periodicidade,
      checklist_id: it.checklist_id, checklist_nome: it.checklist_nome || 'Outros',
      status: e.status, data_prevista: e.data_prevista, adiamentos: e.adiamentos,
      pode_adiar: e.status !== 'feito' && op.podeAdiar(it.periodicidade, h),
      data_limite: op.limiteAdiamento(it.periodicidade, h),
      trava_ultima_semana: op.emUltimaSemana(h),
    };
  });
  const dia = db.prepare(`SELECT aberto_em, fechado, fechado_em FROM operacional_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, h);
  res.json({ itens: lista, hoje: h, aberto: !!dia?.aberto_em, aberto_em: dia?.aberto_em || null, fechado: dia?.fechado ? 1 : 0, fechado_em: dia?.fechado_em || null });
});

// POST /operacional/abrir — abre o ciclo do dia (por loja). Itens semanais/mensais pendentes do período aparecem pra conferir.
router.post('/abrir', (req, res) => {
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const h = hojeStr();
  const dia = db.prepare(`SELECT aberto_em FROM operacional_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, h);
  if (dia?.aberto_em) return res.json({ mensagem: 'Já estava aberto.', aberto_em: dia.aberto_em });
  db.prepare(`INSERT INTO operacional_dia (id,empresa_id,loja_id,data,aberto_em,fechado,fechado_em) VALUES (?,?,?,?,datetime('now'),0,NULL)
    ON CONFLICT(empresa_id,loja_id,data) DO UPDATE SET aberto_em=datetime('now'), fechado=0, fechado_em=NULL`)
    .run(uuidv4(), req.usuario.empresa_id, lojaId, h);
  db.prepare(`UPDATE tarefas SET status='andamento', atualizado_em=datetime('now') WHERE empresa_id=? AND origem='checklist_operacional' AND referencia_id=? AND status='aberto'`).run(req.usuario.empresa_id, `${lojaId}:${h}`);
  res.json({ mensagem: 'Checklist do dia aberto. Confira ao longo do dia e feche no fim.' });
});

// POST /operacional/fechar — fecha o ciclo do dia (trava as marcações do dia)
router.post('/fechar', (req, res) => {
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const h = hojeStr();
  const dia = db.prepare(`SELECT aberto_em, fechado FROM operacional_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, h);
  if (!dia?.aberto_em) return res.status(400).json({ erro: 'Abra o checklist antes de fechar.' });
  if (dia.fechado) return res.json({ ok: true, mensagem: 'Já estava fechado.' });
  db.prepare(`UPDATE operacional_dia SET fechado=1, fechado_em=datetime('now') WHERE empresa_id=? AND loja_id=? AND data=?`).run(req.usuario.empresa_id, lojaId, h);
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE empresa_id=? AND origem='checklist_operacional' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, `${lojaId}:${h}`);
  res.json({ ok: true, mensagem: 'Checklist do dia fechado.' });
});

// POST /operacional/itens — cadastro
router.post('/itens', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { nome, periodicidade, loja_id } = req.body;
  if (!nome || !['diaria', 'semanal', 'mensal'].includes(periodicidade)) return res.status(400).json({ erro: 'Nome e periodicidade válidos obrigatórios.' });
  db.prepare(`INSERT INTO operacional_itens (id,empresa_id,loja_id,nome,periodicidade) VALUES (?,?,?,?,?)`)
    .run(uuidv4(), req.usuario.empresa_id, loja_id || null, nome, periodicidade);
  res.json({ mensagem: 'Tarefa operacional cadastrada.' });
});

function upsertExec(empresaId, item, lojaId, h, campos) {
  const ref = periodoRef(item.periodicidade, h);
  const e = db.prepare('SELECT id FROM operacional_exec WHERE empresa_id=? AND item_id=? AND loja_id=? AND periodo_ref=?').get(empresaId, item.id, lojaId, ref);
  if (e) {
    const sets = Object.keys(campos).map(k => `${k}=?`).join(',');
    db.prepare(`UPDATE operacional_exec SET ${sets} WHERE id=?`).run(...Object.values(campos), e.id);
  } else {
    db.prepare(`INSERT INTO operacional_exec (id,empresa_id,item_id,loja_id,periodo_ref,data_prevista,status,adiamentos,feito_em)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(uuidv4(), empresaId, item.id, lojaId, ref,
      campos.data_prevista || h, campos.status || 'pendente', campos.adiamentos || 0, campos.feito_em || null);
  }
}

// POST /operacional/:itemId/feito
router.post('/:itemId/feito', (req, res) => {
  const item = db.prepare('SELECT * FROM operacional_itens WHERE id=? AND empresa_id=?').get(req.params.itemId, req.usuario.empresa_id);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  if (!diaAbertoOk(req.usuario.empresa_id, lojaId, hojeStr())) return res.status(400).json({ erro: 'Abra o checklist do dia antes de marcar (e ele não pode estar fechado).' });
  upsertExec(req.usuario.empresa_id, item, lojaId, hojeStr(), { status: 'feito', feito_em: new Date().toISOString() });
  res.json({ mensagem: 'Marcado como feito.' });
});

// POST /operacional/:itemId/adiar
router.post('/:itemId/adiar', (req, res) => {
  const item = db.prepare('SELECT * FROM operacional_itens WHERE id=? AND empresa_id=?').get(req.params.itemId, req.usuario.empresa_id);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });
  const h = hojeStr();
  if (!diaAbertoOk(req.usuario.empresa_id, req.body.loja_id || req.usuario.loja_id, h)) return res.status(400).json({ ok: false, erro: 'Abra o checklist do dia antes (e ele não pode estar fechado).' });
  if (!op.podeAdiar(item.periodicidade, h)) {
    return res.json({ ok: false, erro: item.periodicidade === 'diaria' ? 'Tarefa diária não pode ser adiada.' : 'Trava da última semana — não é mais possível adiar, precisa ser feita.' });
  }
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const e = pegaExec(req.usuario.empresa_id, item, lojaId, h);
  upsertExec(req.usuario.empresa_id, item, lojaId, h, { status: 'adiado', data_prevista: op.proximoAdiamento(item.periodicidade, h), adiamentos: (e.adiamentos || 0) + 1 });
  res.json({ ok: true, mensagem: 'Tarefa adiada.', limite: op.limiteAdiamento(item.periodicidade, h) });
});

// ── Cadastro de checklists (com itens por periodicidade) ──
// GET /operacional/indicadores — indicadores do painel disponíveis para vincular
router.get('/indicadores', (req, res) => {
  const { getPilares } = require('../lib/pilares');
  const lista = [];
  getPilares(req.usuario.empresa_id).forEach(p => p.indicadores.forEach(i => lista.push({ id: i.id, nome: i.nome, pilar: p.nome })));
  res.json({ indicadores: lista });
});

// GET /operacional/checklists — lista checklists + seções + itens
router.get('/checklists', (req, res) => {
  const defs = db.prepare('SELECT * FROM checklist_def WHERE empresa_id=? AND ativo=1 ORDER BY nome').all(req.usuario.empresa_id);
  const itens = db.prepare('SELECT id, checklist_id, secao_id, nome, periodicidade FROM operacional_itens WHERE empresa_id=? AND ativo=1').all(req.usuario.empresa_id);
  const secoes = db.prepare('SELECT * FROM checklist_secao WHERE empresa_id=?').all(req.usuario.empresa_id);
  res.json({ checklists: defs.map(d => ({ ...d, secoes: secoes.filter(s => s.checklist_id === d.id), itens: itens.filter(i => i.checklist_id === d.id) })) });
});

// POST /operacional/checklists — cria checklist (nome + destino + modo + indicador)
router.post('/checklists', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { nome, destino, modo, indicador_alvo } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório.' });
  const id = uuidv4();
  db.prepare(`INSERT INTO checklist_def (id,empresa_id,nome,destino,modo,indicador_alvo) VALUES (?,?,?,?,?,?)`)
    .run(id, req.usuario.empresa_id, nome, destino || 'operacional', modo === 'secao' ? 'secao' : 'inteiro', modo === 'secao' ? null : (indicador_alvo || null));
  res.json({ mensagem: 'Checklist criado.', id });
});

// POST /operacional/checklists/:id/secoes — adiciona seção (nome + peso + indicador)
router.post('/checklists/:id/secoes', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const def = db.prepare('SELECT id FROM checklist_def WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!def) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  const { nome, peso, indicador_alvo, responsavel } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome da seção obrigatório.' });
  db.prepare(`INSERT INTO checklist_secao (id,empresa_id,checklist_id,nome,peso,indicador_alvo,responsavel) VALUES (?,?,?,?,?,?,?)`)
    .run(uuidv4(), req.usuario.empresa_id, req.params.id, nome, Number(peso) || 0, indicador_alvo || null, responsavel || 'gerente');
  res.json({ mensagem: 'Seção adicionada.' });
});

// POST /operacional/checklists/:id/itens — adiciona pergunta/item com periodicidade (e seção opcional)
router.post('/checklists/:id/itens', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const def = db.prepare('SELECT id FROM checklist_def WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!def) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  const { nome, periodicidade, loja_id, secao_id } = req.body;
  if (!nome || !['diaria', 'semanal', 'mensal'].includes(periodicidade)) return res.status(400).json({ erro: 'Pergunta e periodicidade válidos obrigatórios.' });
  db.prepare(`INSERT INTO operacional_itens (id,empresa_id,loja_id,checklist_id,secao_id,nome,periodicidade) VALUES (?,?,?,?,?,?,?)`)
    .run(uuidv4(), req.usuario.empresa_id, loja_id || null, req.params.id, secao_id || null, nome, periodicidade);
  res.json({ mensagem: 'Pergunta adicionada.' });
});

// DELETE /operacional/checklists/:id — exclui o checklist do cadastro (e seus itens, seções e execuções)
router.delete('/checklists/:id', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const def = db.prepare('SELECT id FROM checklist_def WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!def) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  const tx = db.transaction(() => {
    const itens = db.prepare('SELECT id FROM operacional_itens WHERE checklist_id=? AND empresa_id=?').all(req.params.id, req.usuario.empresa_id);
    const delExec = db.prepare('DELETE FROM operacional_exec WHERE item_id=? AND empresa_id=?');
    itens.forEach(i => delExec.run(i.id, req.usuario.empresa_id));
    db.prepare('DELETE FROM operacional_itens WHERE checklist_id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
    db.prepare('DELETE FROM checklist_secao WHERE checklist_id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
    db.prepare('DELETE FROM checklist_def WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  });
  tx();
  res.json({ mensagem: 'Checklist excluído.' });
});

module.exports = router;
