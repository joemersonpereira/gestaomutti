const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');

router.use(auth);

db.exec(`CREATE TABLE IF NOT EXISTS feriado_escala (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  tipo TEXT, modo TEXT, status TEXT, turnos_json TEXT, criado_por_id TEXT, gerente_id TEXT,
  gerente_obs TEXT, supervisor_obs TEXT, criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT,
  UNIQUE(empresa_id, loja_id, data)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS feriado_escala_equipe (
  id TEXT PRIMARY KEY, escala_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  turno_nome TEXT, horario_custom TEXT, incluido_por TEXT,
  ciencia INTEGER DEFAULT 0, ciencia_em TEXT, escalonado INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(escala_id, colaborador_id)
);`);
try { db.exec(`ALTER TABLE feriado_escala_equipe ADD COLUMN escalonado INTEGER DEFAULT 0`); } catch (e) { /* já existe */ }

// Ao concluir a escala: notifica cada colaborador escalado para dar ciência.
function notificarEquipe(escala) {
  const e = db.prepare(`SELECT * FROM feriado_escala WHERE id=?`).get(escala.id);
  if (!e) return;
  const equipe = db.prepare(`SELECT * FROM feriado_escala_equipe WHERE escala_id=?`).all(e.id);
  equipe.forEach(m => {
    const ja = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='escala_ciencia' AND referencia_id=? AND responsavel_id=?`).get(e.empresa_id, e.id, m.colaborador_id);
    if (ja) return;
    gerarTarefa({
      empresa_id: e.empresa_id, loja_id: e.loja_id, tipo: 'notificacao', origem: 'escala_ciencia', referencia_id: e.id,
      titulo: `Você está escalado · ${fmt(e.data)}`,
      descricao: `Você foi escalado para trabalhar em ${fmt(e.data)} (${e.tipo})${m.horario_custom ? ' — ' + m.horario_custom : m.turno_nome ? ' — ' + m.turno_nome : ''}. Confirme a ciência.`,
      responsavel_id: m.colaborador_id, sla_horas: 48, criado_por: e.criado_por_id,
    });
  });
}

const SUP = ['Supervisor', 'Gestor Geral', 'Diretor Geral'];
const GESTAO = ['Gerente', 'Subgerente'];
const fmt = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

function gerenteDaLoja(empresaId, lojaId) {
  return db.prepare(`SELECT c.id, c.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.loja_id=? AND f.nome IN ('Gerente','Subgerente') AND c.ativo=1
    ORDER BY CASE f.nome WHEN 'Gerente' THEN 0 ELSE 1 END LIMIT 1`).get(empresaId, lojaId);
}
function supervisorParaTarefa(empresaId, criadoPorId) {
  // se quem criou é supervisão, usa ele; senão (ex.: gerente lançou) procura um supervisor
  if (criadoPorId) {
    const c = db.prepare(`SELECT f.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.id=?`).get(criadoPorId);
    if (c && SUP.includes(c.nome)) return criadoPorId;
  }
  for (const nome of SUP) {
    const r = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND f.nome=? AND c.ativo=1 LIMIT 1`).get(empresaId, nome);
    if (r) return r.id;
  }
  return null;
}
// Reaproveita um único card por escala, reapontando o responsável conforme o passo.
function cardEscala(escala, responsavelId, titulo, descricao) {
  const ex = db.prepare(`SELECT id FROM tarefas WHERE empresa_id=? AND origem='feriado_escala' AND referencia_id=?`).get(escala.empresa_id, escala.id);
  if (ex) db.prepare(`UPDATE tarefas SET responsavel_id=?, titulo=?, descricao=?, status='aberto', concluido_em=NULL, atualizado_em=datetime('now') WHERE id=?`).run(responsavelId, titulo, descricao, ex.id);
  else gerarTarefa({ empresa_id: escala.empresa_id, loja_id: escala.loja_id, tipo: 'tarefa', origem: 'feriado_escala', referencia_id: escala.id, titulo, descricao, responsavel_id: responsavelId, criado_por: escala.criado_por_id });
}
function concluirCard(escala) {
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE empresa_id=? AND origem='feriado_escala' AND referencia_id=? AND status!='concluido'`).run(escala.empresa_id, escala.id);
}
function getEscala(id, empresaId) {
  return db.prepare(`SELECT * FROM feriado_escala WHERE id=? AND empresa_id=?`).get(id, empresaId);
}
function equipeDe(escalaId) {
  return db.prepare(`SELECT e.*, c.nome as colaborador_nome, f.nome as funcao_nome
    FROM feriado_escala_equipe e JOIN colaboradores c ON c.id=e.colaborador_id JOIN funcoes f ON f.id=c.funcao_id
    WHERE e.escala_id=? ORDER BY e.turno_nome, c.nome`).all(escalaId);
}
function souGestaoDaLoja(usuario, escala) {
  return (GESTAO.includes(usuario.funcao_nome) && usuario.loja_id === escala.loja_id) || usuario.lideranca;
}
function getDeducao(empresaId) {
  const row = db.prepare(`SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='escala_ciencia_deducao'`).get(empresaId);
  const n = row ? Number(row.valor) : NaN;
  return isNaN(n) ? 5 : n;
}

// POST /escala — supervisão lança a escala (horário/turnos) para o gerente
router.post('/', (req, res) => {
  const { loja_id, data, tipo, modo, turnos, equipe } = req.body;
  const podeLancar = SUP.includes(req.usuario.funcao_nome)
    || (GESTAO.includes(req.usuario.funcao_nome) && req.usuario.loja_id === loja_id)
    || req.usuario.lideranca;
  if (!podeLancar) return res.status(403).json({ erro: 'Só a supervisão ou a gerência da loja lança a escala.' });
  if (!loja_id || !data) return res.status(400).json({ erro: 'Loja e data obrigatórios.' });
  if (!Array.isArray(turnos) || !turnos.length) return res.status(400).json({ erro: 'Informe ao menos um turno (horário).' });
  const ger = gerenteDaLoja(req.usuario.empresa_id, loja_id);
  if (!ger) return res.status(400).json({ erro: 'Loja sem gerente/subgerente ativo.' });
  const ja = db.prepare(`SELECT id FROM feriado_escala WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, loja_id, data);
  if (ja) return res.status(400).json({ erro: 'Já existe escala para essa loja nessa data.' });

  const id = uuidv4();
  const modoF = modo === 'ciencia' ? 'ciencia' : 'negociar';
  const temEquipe = Array.isArray(equipe) && equipe.length > 0;
  // Se a equipe já foi informada no lançamento, a escala vai direto pra supervisão aprovar.
  const status = (modoF === 'negociar' && temEquipe) ? 'aguardando_supervisor' : 'aguardando_gerente';
  db.prepare(`INSERT INTO feriado_escala (id,empresa_id,loja_id,data,tipo,modo,status,turnos_json,criado_por_id,gerente_id,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(id, req.usuario.empresa_id, loja_id, data, tipo || 'feriado', modoF, status, JSON.stringify(turnos), req.usuario.id, ger.id);
  if (temEquipe) {
    const ins = db.prepare(`INSERT OR IGNORE INTO feriado_escala_equipe (id,escala_id,colaborador_id,turno_nome,horario_custom,incluido_por) VALUES (?,?,?,?,?, 'gerente')`);
    equipe.forEach(m => { if (m.colaborador_id) ins.run(uuidv4(), id, m.colaborador_id, m.turno_nome || null, m.horario_custom || null); });
  }
  if ((tipo || 'feriado') === 'feriado') { try { db.prepare(`INSERT INTO dias_nao_uteis (id,empresa_id,loja_id,data,tipo) VALUES (?,?,?,?,'feriado')`).run(uuidv4(), req.usuario.empresa_id, loja_id, data); } catch (e) { /* já existe */ } }

  const escala = { id, empresa_id: req.usuario.empresa_id, loja_id, criado_por_id: req.usuario.id };
  // fecha a cobrança de escala pendente dessa loja+data, se houver
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now')
    WHERE empresa_id=? AND origem='escala_pendente' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, `${loja_id}:${data}`);
  if (status === 'aguardando_supervisor') {
    cardEscala(escala, supervisorParaTarefa(req.usuario.empresa_id, req.usuario.id), `Aprovar escala · ${fmt(data)}`, 'A gerência lançou o horário e a equipe. Aprove, rejeite ou inclua colaboradores.');
    return res.status(201).json({ id, mensagem: 'Escala enviada à supervisão para aprovação.' });
  }
  cardEscala(escala, ger.id, `Escala ${tipo || 'feriado'} · ${fmt(data)}`,
    modoF === 'ciencia' ? 'A supervisão definiu o horário de funcionamento. Dê ciência.' : 'A supervisão definiu o horário. Dê de acordo e informe a equipe, ou peça reanálise do horário.');
  res.status(201).json({ id, mensagem: 'Escala enviada ao gerente.' });
});

// GET /escala?loja_id=&mes=&ano= — lista (supervisão/gestão)
router.get('/', (req, res) => {
  const { loja_id } = req.query;
  const mes = parseInt(req.query.mes, 10), ano = parseInt(req.query.ano, 10);
  let q = `SELECT fe.*, l.nome as loja_nome FROM feriado_escala fe LEFT JOIN lojas l ON l.id=fe.loja_id WHERE fe.empresa_id=?`;
  const p = [req.usuario.empresa_id];
  if (loja_id) { q += ` AND fe.loja_id=?`; p.push(loja_id); }
  if (mes && ano) { q += ` AND CAST(strftime('%m',fe.data) AS INTEGER)=? AND CAST(strftime('%Y',fe.data) AS INTEGER)=?`; p.push(mes, ano); }
  q += ` ORDER BY fe.data`;
  res.json({ escalas: db.prepare(q).all(...p) });
});

// GET /escala/config — % de dedução por não confirmar a escala
router.get('/config', (req, res) => {
  res.json({ deducao: getDeducao(req.usuario.empresa_id) });
});
// POST /escala/config — supervisão define o %
router.post('/config', (req, res) => {
  if (!SUP.includes(req.usuario.funcao_nome)) return res.status(403).json({ erro: 'Só a supervisão.' });
  const d = Math.max(0, Math.min(100, Number(req.body.deducao) || 0));
  db.prepare(`INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,'escala_ciencia_deducao',?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(req.usuario.empresa_id, String(d));
  res.json({ mensagem: 'Configuração salva.', deducao: d });
});

// GET /escala/:id — detalhe + permissões + equipe
router.get('/:id', (req, res) => {
  const e = getEscala(req.params.id, req.usuario.empresa_id);
  if (!e) return res.status(404).json({ erro: 'Escala não encontrada.' });
  let turnos = []; try { turnos = JSON.parse(e.turnos_json || '[]'); } catch (x) { turnos = []; }
  res.json({
    ...e, turnos, equipe: equipeDe(e.id),
    sou_supervisor: SUP.includes(req.usuario.funcao_nome),
    sou_gestao: souGestaoDaLoja(req.usuario, e),
  });
});

// POST /escala/:id/gerente — gerente: de_acordo (+equipe) | reanalise | ciencia
router.post('/:id/gerente', (req, res) => {
  const e = getEscala(req.params.id, req.usuario.empresa_id);
  if (!e) return res.status(404).json({ erro: 'Escala não encontrada.' });
  if (!souGestaoDaLoja(req.usuario, e)) return res.status(403).json({ erro: 'Sem permissão.' });
  if (!['aguardando_gerente'].includes(e.status)) return res.status(400).json({ erro: 'A escala não está com o gerente agora.' });
  const { acao, obs, equipe } = req.body;
  const escala = { id: e.id, empresa_id: e.empresa_id, loja_id: e.loja_id, criado_por_id: e.criado_por_id };

  if (e.modo === 'ciencia') {
    db.prepare(`UPDATE feriado_escala SET status='concluido', atualizado_em=datetime('now') WHERE id=?`).run(e.id);
    concluirCard(escala); notificarEquipe(escala);
    return res.json({ mensagem: 'Ciência registrada. Escala concluída.', status: 'concluido' });
  }
  if (acao === 'reanalise') {
    db.prepare(`UPDATE feriado_escala SET status='reanalise_horario', gerente_obs=?, atualizado_em=datetime('now') WHERE id=?`).run(obs || '', e.id);
    cardEscala(escala, supervisorParaTarefa(e.empresa_id, e.criado_por_id), `Reanálise de horário · ${fmt(e.data)}`, `O gerente pediu reanálise do horário.${obs ? ' Obs: ' + obs : ''}`);
    return res.json({ mensagem: 'Reanálise enviada à supervisão.', status: 'reanalise_horario' });
  }
  // de_acordo: salva a equipe informada e manda pra supervisão revisar
  if (!Array.isArray(equipe) || !equipe.length) return res.status(400).json({ erro: 'Informe a equipe que vai trabalhar.' });
  const ins = db.prepare(`INSERT OR REPLACE INTO feriado_escala_equipe (id,escala_id,colaborador_id,turno_nome,horario_custom,incluido_por)
    VALUES (COALESCE((SELECT id FROM feriado_escala_equipe WHERE escala_id=? AND colaborador_id=?),?),?,?,?,?, 'gerente')`);
  equipe.forEach(m => { if (m.colaborador_id) ins.run(e.id, m.colaborador_id, uuidv4(), e.id, m.colaborador_id, m.turno_nome || null, m.horario_custom || null); });
  db.prepare(`UPDATE feriado_escala SET status='aguardando_supervisor', gerente_obs=?, atualizado_em=datetime('now') WHERE id=?`).run(obs || '', e.id);
  cardEscala(escala, supervisorParaTarefa(e.empresa_id, e.criado_por_id), `Aprovar escala · ${fmt(e.data)}`, 'O gerente informou a equipe. Aprove, rejeite ou inclua colaboradores.');
  res.json({ mensagem: 'Equipe enviada à supervisão.', status: 'aguardando_supervisor' });
});

// POST /escala/:id/supervisor — supervisão: aprovar | incluir | rejeitar | (reenviar horário em reanálise)
router.post('/:id/supervisor', (req, res) => {
  if (!SUP.includes(req.usuario.funcao_nome)) return res.status(403).json({ erro: 'Só a supervisão.' });
  const e = getEscala(req.params.id, req.usuario.empresa_id);
  if (!e) return res.status(404).json({ erro: 'Escala não encontrada.' });
  const { acao, incluir, obs, turnos } = req.body;
  const escala = { id: e.id, empresa_id: e.empresa_id, loja_id: e.loja_id, criado_por_id: e.criado_por_id };
  const ger = e.gerente_id || gerenteDaLoja(e.empresa_id, e.loja_id)?.id;

  if (e.status === 'reanalise_horario') {
    if (Array.isArray(turnos) && turnos.length) db.prepare(`UPDATE feriado_escala SET turnos_json=? WHERE id=?`).run(JSON.stringify(turnos), e.id);
    db.prepare(`UPDATE feriado_escala SET status='aguardando_gerente', supervisor_obs=?, atualizado_em=datetime('now') WHERE id=?`).run(obs || '', e.id);
    cardEscala(escala, ger, `Escala ${e.tipo} · ${fmt(e.data)}`, 'A supervisão reenviou o horário. Dê de acordo e informe a equipe, ou peça nova reanálise.');
    return res.json({ mensagem: 'Horário reenviado ao gerente.', status: 'aguardando_gerente' });
  }
  if (e.status !== 'aguardando_supervisor') return res.status(400).json({ erro: 'A escala não está com a supervisão agora.' });

  if (acao === 'incluir' && Array.isArray(incluir) && incluir.length) {
    const ins = db.prepare(`INSERT OR IGNORE INTO feriado_escala_equipe (id,escala_id,colaborador_id,turno_nome,horario_custom,incluido_por) VALUES (?,?,?,?,?, 'supervisor')`);
    incluir.forEach(m => { if (m.colaborador_id) ins.run(uuidv4(), e.id, m.colaborador_id, m.turno_nome || null, m.horario_custom || null); });
    db.prepare(`UPDATE feriado_escala SET status='reanalise_inclusao', supervisor_obs=?, atualizado_em=datetime('now') WHERE id=?`).run(obs || '', e.id);
    cardEscala(escala, ger, `Ciência de inclusão · ${fmt(e.data)}`, 'A supervisão incluiu colaborador(es) na escala. Dê ciência.');
    return res.json({ mensagem: 'Colaboradores incluídos. Aguardando ciência do gerente.', status: 'reanalise_inclusao' });
  }
  if (acao === 'rejeitar') {
    db.prepare(`UPDATE feriado_escala SET status='aguardando_gerente', supervisor_obs=?, atualizado_em=datetime('now') WHERE id=?`).run(obs || '', e.id);
    cardEscala(escala, ger, `Escala ${e.tipo} · ${fmt(e.data)}`, `A supervisão pediu ajuste na equipe.${obs ? ' Obs: ' + obs : ''}`);
    return res.json({ mensagem: 'Devolvido ao gerente.', status: 'aguardando_gerente' });
  }
  // aprovar (sem inclusão) → conclui
  db.prepare(`UPDATE feriado_escala SET status='concluido', atualizado_em=datetime('now') WHERE id=?`).run(e.id);
  concluirCard(escala); notificarEquipe(escala);
  res.json({ mensagem: 'Escala aprovada e concluída.', status: 'concluido', concluida: true });
});

// POST /escala/:id/gerente-ciencia — gerente dá ciência dos incluídos → conclui
router.post('/:id/gerente-ciencia', (req, res) => {
  const e = getEscala(req.params.id, req.usuario.empresa_id);
  if (!e) return res.status(404).json({ erro: 'Escala não encontrada.' });
  if (!souGestaoDaLoja(req.usuario, e)) return res.status(403).json({ erro: 'Sem permissão.' });
  if (e.status !== 'reanalise_inclusao') return res.status(400).json({ erro: 'Nada para dar ciência.' });
  db.prepare(`UPDATE feriado_escala SET status='concluido', atualizado_em=datetime('now') WHERE id=?`).run(e.id);
  concluirCard({ id: e.id, empresa_id: e.empresa_id }); notificarEquipe({ id: e.id, empresa_id: e.empresa_id, loja_id: e.loja_id, criado_por_id: e.criado_por_id });
  res.json({ mensagem: 'Ciência registrada. Escala concluída.', status: 'concluido', concluida: true });
});

// POST /escala/:id/ciencia — colaborador escalado confirma ciência
router.post('/:id/ciencia', (req, res) => {
  const m = db.prepare(`SELECT * FROM feriado_escala_equipe WHERE escala_id=? AND colaborador_id=?`).get(req.params.id, req.usuario.id);
  if (!m) return res.status(404).json({ erro: 'Você não está nesta escala.' });
  db.prepare(`UPDATE feriado_escala_equipe SET ciencia=1, ciencia_em=datetime('now') WHERE id=?`).run(m.id);
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now')
    WHERE empresa_id=? AND origem='escala_ciencia' AND referencia_id=? AND responsavel_id=? AND status!='concluido'`)
    .run(req.usuario.empresa_id, req.params.id, req.usuario.id);
  res.json({ mensagem: 'Ciência confirmada.' });
});

module.exports = router;