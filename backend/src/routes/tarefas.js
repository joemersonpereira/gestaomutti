const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { afastamentoAtivo } = require('../lib/afastamento');

// Todas as rotas exigem autenticação
router.use(auth);

// Verifica se o usuário é um dos apoios (vários) de uma tarefa
const ehApoio = (tarefaId, userId) => !!db.prepare('SELECT 1 FROM tarefa_apoios WHERE tarefa_id=? AND colaborador_id=?').get(tarefaId, userId);

// SLA (horas) cadastrado para uma origem; cai no padrão geral (_padrao) se a origem não tem SLA próprio.
function slaConfigHoras(empresaId, origem) {
  try {
    if (origem) {
      const r = db.prepare('SELECT horas FROM sla_config WHERE empresa_id=? AND origem=?').get(empresaId, origem);
      if (r && r.horas) return r.horas;
    }
    const p = db.prepare("SELECT horas FROM sla_config WHERE empresa_id=? AND origem='_padrao'").get(empresaId);
    return p && p.horas ? p.horas : null;
  } catch { return null; }
}

// Função para calcular se uma tarefa está atrasada
function verificarAtraso(tarefa) {
  if (!tarefa.prazo || tarefa.status === 'concluido') return tarefa.status;
  const prazo = new Date(tarefa.prazo);
  const agora = new Date();
  if (agora > prazo && tarefa.status !== 'concluido') return 'atrasado';
  return tarefa.status;
}

// Função para gerar tarefa automaticamente
function gerarTarefa(dados) {
  const id = uuidv4();
  const agora = new Date();
  // Se o responsável está afastado/em férias hoje e há substituto designado, a tarefa vai pro substituto.
  if (dados.responsavel_id && dados.empresa_id) {
    const af = afastamentoAtivo(dados.empresa_id, dados.responsavel_id, agora.toISOString().slice(0, 10));
    if (af && af.substituto_id) dados.responsavel_id = af.substituto_id;
  }
  // SLA: usa o horas passado explicitamente; se não veio, cai no SLA cadastrado p/ a origem;
  // se não houver, no padrão geral (_padrao). Assim o prazo deixa de ser "chumbado" no código.
  let slaHoras = dados.sla_horas;
  if (!slaHoras && dados.empresa_id) slaHoras = slaConfigHoras(dados.empresa_id, dados.origem);
  let prazo = null;
  if (slaHoras) {
    prazo = new Date(agora.getTime() + slaHoras * 60 * 60 * 1000).toISOString();
  }
  dados.sla_horas = slaHoras || null;
  // Quem marcou como urgente (para o fluxo de confirmação/penalização). Tarefas urgentes do sistema (sem criado_por) não exigem confirmação.
  const urgentePor = dados.urgente ? (dados.urgente_por || dados.criado_por || null) : null;
  db.prepare(`
    INSERT INTO tarefas (id,empresa_id,loja_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,apoio_id,urgente,urgente_por,status,sla_horas,prazo,criado_por,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'aberto',?,?,?,datetime('now'),datetime('now'))
  `).run(
    id, dados.empresa_id, dados.loja_id, dados.tipo || 'tarefa',
    dados.origem, dados.referencia_id || null, dados.titulo, dados.descricao || '',
    dados.responsavel_id, dados.apoio_id || null,
    dados.urgente ? 1 : 0, urgentePor, dados.sla_horas || null,
    prazo, dados.criado_por || null
  );
  return id;
}

// GET /tarefas — lista tarefas do usuário (ou todas para gestor/supervisor)
// Encerra automaticamente tarefas "do dia" (ex.: reposição) que não foram feitas e o dia já passou.
// É feito de forma preguiçosa (ao listar) enquanto não há agendador.
function encerrarVencidasDoDia(empresaId) {
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidas = db.prepare(`SELECT id FROM tarefas WHERE empresa_id=? AND origem='reposicao' AND status!='concluido' AND date(criado_em) < ?`).all(empresaId, hoje);
  for (const t of vencidas) {
    db.prepare(`UPDATE tarefas SET status='concluido', reanalise_status='encerrada_auto', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?`).run(t.id);
    db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,NULL,'Sistema',?, 'comentario')`)
      .run(uuidv4(), empresaId, t.id, 'Encerrada automaticamente — o dia terminou e a reposição não foi realizada. A falta permanece para a disciplina.');
  }
}

const { getAgenda, rodaHoje } = require('../lib/agenda');

// Gera (uma vez por dia, de forma preguiçosa ao listar) os cards dos checklists do dia,
// para que possam ser resolvidos dentro do Kanban. Respeita a agenda (não gera em dia fora dela).
// Resolve quem cobre a loja hoje, considerando folgas APROVADAS e afastamentos/férias: gerente → subgerente → substituto.
function responsavelDoDia(empresaId, lojaId, hoje) {
  const ger = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.loja_id=? AND f.nome='Gerente' AND c.ativo=1 LIMIT 1`).get(empresaId, lojaId);
  const sub = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.loja_id=? AND f.nome='Subgerente' AND c.ativo=1 LIMIT 1`).get(empresaId, lojaId);
  const folgaOff = id => id && db.prepare(`SELECT 1 FROM folgas WHERE empresa_id=? AND colaborador_id=? AND data=? AND status='aprovada'`).get(empresaId, id, hoje);
  const off = id => id && (folgaOff(id) || afastamentoAtivo(empresaId, id, hoje));
  // Substituto designado: do afastamento ativo (prioridade) ou da folga aprovada.
  const subDe = id => {
    if (!id) return null;
    const af = afastamentoAtivo(empresaId, id, hoje);
    if (af && af.substituto_id) return af.substituto_id;
    const fo = db.prepare(`SELECT substituto_id FROM folgas WHERE empresa_id=? AND colaborador_id=? AND data=? AND status='aprovada' AND substituto_id IS NOT NULL LIMIT 1`).get(empresaId, id, hoje);
    return fo?.substituto_id || null;
  };
  const gerOff = off(ger?.id), subOff = off(sub?.id);
  if (ger && !gerOff) return { respId: ger.id, apoioId: (sub && !subOff) ? sub.id : null };
  if (sub && !subOff) return { respId: sub.id, apoioId: null };
  // ambos ausentes (ou inexistentes): substituto designado
  return { respId: subDe(ger?.id) || subDe(sub?.id) || null, apoioId: null };
}

function garantirCardsChecklistDia(usuario) {
  const hoje = new Date().toISOString().slice(0, 10);
  if (!usuario.loja_id) return;
  // Calendário: loja FECHADA → ninguém faz checklist (não penaliza). FERIADO com loja aberta → roda normal,
  // o motor decide quem cobre, e nesse dia a agenda semanal é ignorada (a loja abre excepcionalmente).
  const diaCal = db.prepare(`SELECT tipo FROM dias_nao_uteis WHERE empresa_id=? AND loja_id=? AND data=?`).get(usuario.empresa_id, usuario.loja_id, hoje);
  if (diaCal && diaCal.tipo === 'fechado') return;
  const feriadoAberto = !!diaCal;

  const ensureCard = (origem, ref, titulo, descricao, agendaChave, respId, apoioId) => {
    if (!respId) return;
    if (!feriadoAberto && !rodaHoje(getAgenda(db, usuario.empresa_id, agendaChave), hoje)) return; // fora da agenda → não gera (exceto feriado aberto)
    const existe = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem=? AND referencia_id=?`).get(usuario.empresa_id, origem, ref);
    if (existe) return;
    gerarTarefa({ empresa_id: usuario.empresa_id, loja_id: usuario.loja_id, tipo: 'tarefa', origem, referencia_id: ref, titulo, descricao, responsavel_id: respId, apoio_id: apoioId || null, urgente: 0, criado_por: null });
  };

  // Checklists da loja (Diário + Operacional): quem cobre hoje conforme folgas aprovadas.
  // Gera pra quem é o responsável OU o apoio do dia (gerente, subgerente cobrindo, ou substituto designado).
  if (['Gerente', 'Subgerente'].includes(usuario.funcao_nome) || usuario.lideranca) {
    const { respId, apoioId } = responsavelDoDia(usuario.empresa_id, usuario.loja_id, hoje);
    if (usuario.id === respId || usuario.id === apoioId) {
      ensureCard('checklist_diario', `${usuario.loja_id}:${hoje}`, 'Checklist Diário de hoje',
        'Abra, confira as seções (Bom/Regular/Ruim) e feche o dia — tudo aqui no card.', 'checklist_diario_agenda', respId, apoioId);
      ensureCard('checklist_operacional', `${usuario.loja_id}:${hoje}`, 'Checklist Operacional de hoje',
        'Abra, marque os itens (diário/semanal/mensal) e feche o dia — aqui no card.', 'checklist_operacional_agenda', respId, apoioId);
    }
  }
  if (usuario.funcao_id === 'func-limpeza') {
    ensureCard('checklist_limpeza', `${usuario.id}:${hoje}`, 'Checklist de Limpeza de hoje',
      'Abra, confira os itens (Bom/Regular/Ruim) e feche o dia — aqui no card.', 'checklist_limpeza_agenda', usuario.id, null);
  }
}

// FERIADO unificado ao motor de folga: num feriado com loja aberta, o checklist Diário é gerado
// normalmente para quem cobre a loja (gerente, subgerente ou substituto designado). É a abertura do
// Diário + a informação da atuação (quem foi caixa/conferente) que disparam as avaliações do chefe de
// setor — exatamente como num dia normal. Não há mais disparo automático por função.

// 1 dia antes do feriado/fim de semana: quem foi escalado e não confirmou a ciência →
// abre tarefa pro gerente conversar + ocorrência de conduta (contestável). Idempotente (escalonado=1).
function verificarEscalaCiencia(usuario) {
  if (!usuario.loja_id) return;
  if (!['Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao_nome) && !usuario.lideranca) return;
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const escalas = db.prepare(`SELECT * FROM feriado_escala WHERE empresa_id=? AND loja_id=? AND data=? AND status='concluido'`).all(usuario.empresa_id, usuario.loja_id, amanha);
  if (!escalas.length) return;
  const ger = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.loja_id=? AND f.nome='Gerente' AND c.ativo=1 LIMIT 1`).get(usuario.empresa_id, usuario.loja_id);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const drow = db.prepare(`SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='escala_ciencia_deducao'`).get(usuario.empresa_id);
  const deducao = drow && !isNaN(Number(drow.valor)) ? Number(drow.valor) : 5;
  const fmtD = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch (x) { return d; } };
  for (const e of escalas) {
    const pend = db.prepare(`SELECT ee.*, c.nome FROM feriado_escala_equipe ee JOIN colaboradores c ON c.id=ee.colaborador_id WHERE ee.escala_id=? AND ee.ciencia=0 AND ee.escalonado=0`).all(e.id);
    for (const m of pend) {
      if (ger) gerarTarefa({ empresa_id: usuario.empresa_id, loja_id: usuario.loja_id, tipo: 'tarefa', origem: 'escala_conversa', referencia_id: `${e.id}:${m.colaborador_id}`,
        titulo: `Falar com ${m.nome} — não confirmou a escala`, descricao: `${m.nome} foi escalado para ${fmtD(e.data)} e ainda não confirmou a ciência (falta 1 dia). Converse com o colaborador. O atraso impacta o indicador de conduta.`,
        responsavel_id: ger.id, urgente: 1, criado_por: null });
      db.prepare(`INSERT INTO ocorrencias (id,empresa_id,loja_id,colaborador_id,motivo,deducao,zera,categoria,indicador_alvo,data,status)
        VALUES (?,?,?,?,?,?,0,'disciplina','conduta',?,'ativa')`).run(uuidv4(), usuario.empresa_id, usuario.loja_id, m.colaborador_id, 'Não confirmou a ciência da escala no prazo', deducao, hojeISO);
      gerarTarefa({ empresa_id: usuario.empresa_id, loja_id: usuario.loja_id, tipo: 'notificacao', origem: 'ocorrencia',
        titulo: 'Ocorrência: ciência de escala em atraso', descricao: `Você não confirmou a ciência da escala no prazo — impacto de ${deducao}% no indicador de conduta. Você pode pedir reanálise (ao RH) se discordar.`,
        responsavel_id: m.colaborador_id, sla_horas: 48, criado_por: null });
      db.prepare(`UPDATE feriado_escala_equipe SET escalonado=1 WHERE id=?`).run(m.id);
    }
  }
}

router.get('/', (req, res) => {
  const { funcao_nome: funcao, id: userId, empresa_id, loja_id } = req.usuario;
  const { status, origem, tipo } = req.query;
  encerrarVencidasDoDia(empresa_id);
  garantirCardsChecklistDia(req.usuario);
  verificarEscalaCiencia(req.usuario);
  verificarEscalaPendente(req.usuario);
  // ↑ chamadas; função definida abaixo (hoisted)
  return listarTarefas(req, res);
});

// Sábado/domingo precisam de escala lançada com 1 semana de antecedência. Faltando ≤7 dias e
// sem escala para a loja → abre tarefa cobrando (gerente + supervisor) e penaliza a conduta do gerente.
function verificarEscalaPendente(usuario) {
  if (!usuario.loja_id) return;
  if (!['Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao_nome) && !usuario.lideranca) return;
  const ger = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.loja_id=? AND f.nome='Gerente' AND c.ativo=1 LIMIT 1`).get(usuario.empresa_id, usuario.loja_id);
  const sup = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND f.nome IN ('Supervisor','Gestor Geral','Diretor Geral') AND c.ativo=1 ORDER BY CASE f.nome WHEN 'Supervisor' THEN 0 ELSE 1 END LIMIT 1`).get(usuario.empresa_id);
  const drow = db.prepare(`SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='escala_ciencia_deducao'`).get(usuario.empresa_id);
  const deducao = drow && !isNaN(Number(drow.valor)) ? Number(drow.valor) : 5;
  const hojeISO = new Date().toISOString().slice(0, 10);
  const fmtD = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch (x) { return d; } };
  for (let i = 1; i <= 7; i++) {
    const dt = new Date(Date.now() + i * 86400000);
    const dia = dt.getDay(); // 0=dom, 6=sáb
    if (dia !== 0 && dia !== 6) continue;
    const dataISO = dt.toISOString().slice(0, 10);
    const temEscala = db.prepare(`SELECT 1 FROM feriado_escala WHERE empresa_id=? AND loja_id=? AND data=?`).get(usuario.empresa_id, usuario.loja_id, dataISO);
    if (temEscala) continue;
    const ref = `${usuario.loja_id}:${dataISO}`;
    const jaCobrado = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='escala_pendente' AND referencia_id=?`).get(usuario.empresa_id, ref);
    if (jaCobrado) continue;
    const nomeDia = dia === 6 ? 'sábado' : 'domingo';
    if (ger || sup) gerarTarefa({
      empresa_id: usuario.empresa_id, loja_id: usuario.loja_id, tipo: 'tarefa', origem: 'escala_pendente', referencia_id: ref,
      titulo: `Lançar escala de ${nomeDia} · ${fmtD(dataISO)}`,
      descricao: `A escala de ${nomeDia} (${fmtD(dataISO)}) precisa ser lançada com 1 semana de antecedência e ainda não foi. Lance o horário/turnos no Calendário. A falta de lançamento impacta o indicador de conduta do gerente.`,
      responsavel_id: ger ? ger.id : sup.id, apoio_id: ger && sup ? sup.id : null, urgente: 1, criado_por: null,
    });
    if (ger) {
      db.prepare(`INSERT INTO ocorrencias (id,empresa_id,loja_id,colaborador_id,motivo,deducao,zera,categoria,indicador_alvo,data,status)
        VALUES (?,?,?,?,?,?,0,'disciplina','conduta',?,'ativa')`).run(uuidv4(), usuario.empresa_id, usuario.loja_id, ger.id, `Escala de ${nomeDia} (${fmtD(dataISO)}) não lançada no prazo de 1 semana`, deducao, hojeISO);
      gerarTarefa({
        empresa_id: usuario.empresa_id, loja_id: usuario.loja_id, tipo: 'notificacao', origem: 'ocorrencia',
        titulo: 'Ocorrência: escala de fim de semana não lançada', descricao: `A escala de ${nomeDia} (${fmtD(dataISO)}) não foi lançada com 1 semana de antecedência — impacto de ${deducao}% no indicador de conduta. Você pode pedir reanálise (ao RH) se discordar.`,
        responsavel_id: ger.id, sla_horas: 48, criado_por: null,
      });
    }
  }
}

function listarTarefas(req, res) {
  const { funcao_nome: funcao, id: userId, empresa_id, loja_id } = req.usuario;
  const { status, origem, tipo } = req.query;

  let query = `
    SELECT t.*,
      c.nome as responsavel_nome,
      ca.nome as apoio_nome,
      cp.nome as criado_por_nome,
      cu.nome as urgente_por_nome,
      f.nome as setor,
      l.nome as loja_nome
    FROM tarefas t
    LEFT JOIN colaboradores c ON c.id = t.responsavel_id
    LEFT JOIN colaboradores ca ON ca.id = t.apoio_id
    LEFT JOIN colaboradores cp ON cp.id = t.criado_por
    LEFT JOIN colaboradores cu ON cu.id = t.urgente_por
    LEFT JOIN funcoes f ON f.id = c.funcao_id
    LEFT JOIN lojas l ON l.id = t.loja_id
    WHERE t.empresa_id = ?
  `;
  const params = [empresa_id];

  // Avaliações de atendimento (nota) são CONFIDENCIAIS: só o responsável (Diretor) enxerga, ninguém mais.
  query += ` AND (t.origem NOT IN ('avaliacao_revisao','avaliacao_ruim') OR t.responsavel_id = ?)`;
  params.push(userId);

  // Filtro por perfil
  const perfisGlobais = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'RH', 'Marketing', 'Suporte'];
  if (!perfisGlobais.includes(funcao)) {
    query += ` AND (t.responsavel_id = ? OR t.apoio_id = ? OR t.criado_por = ?
      OR EXISTS (SELECT 1 FROM tarefa_apoios ta WHERE ta.tarefa_id = t.id AND ta.colaborador_id = ?)
      OR EXISTS (SELECT 1 FROM tarefa_anexo_assinaturas s JOIN tarefa_anexos an ON an.id = s.anexo_id WHERE an.tarefa_id = t.id AND s.signatario_id = ? AND s.assinado = 0))`;
    params.push(userId, userId, userId, userId, userId);
  } else if (funcao === 'Supervisor' || funcao === 'Gerente' || funcao === 'Subgerente') {
    query += ` AND t.loja_id = ?`;
    params.push(loja_id);
  }

  if (status) { query += ` AND t.status = ?`; params.push(status); }
  if (origem) { query += ` AND t.origem = ?`; params.push(origem); }
  if (tipo) { query += ` AND t.tipo = ?`; params.push(tipo); }

  query += ` ORDER BY t.urgente DESC, t.criado_em DESC`;

  let tarefas = db.prepare(query).all(...params);

  // Anexa a lista de apoios (vários por tarefa)
  if (tarefas.length) {
    const ph = tarefas.map(() => '?').join(',');
    const aps = db.prepare(`SELECT ta.tarefa_id, ta.colaborador_id, c.nome FROM tarefa_apoios ta JOIN colaboradores c ON c.id=ta.colaborador_id WHERE ta.tarefa_id IN (${ph})`).all(...tarefas.map(t => t.id));
    const byTask = {};
    aps.forEach(a => { (byTask[a.tarefa_id] = byTask[a.tarefa_id] || []).push({ id: a.colaborador_id, nome: a.nome }); });
    tarefas.forEach(t => {
      t.apoios = byTask[t.id] || [];
      if (!t.apoios.length && t.apoio_id) t.apoios = [{ id: t.apoio_id, nome: t.apoio_nome }];
    });

    // Alerta de novos comentários: conta comentários de OUTRAS pessoas após a última leitura do usuário
    const leit = {};
    db.prepare(`SELECT tarefa_id, ultima_leitura FROM tarefa_leitura WHERE colaborador_id=? AND tarefa_id IN (${ph})`).all(userId, ...tarefas.map(t => t.id)).forEach(l => { leit[l.tarefa_id] = l.ultima_leitura; });
    const coms = db.prepare(`SELECT tarefa_id, autor_id, interno, criado_em FROM tarefa_comentarios WHERE tarefa_id IN (${ph})`).all(...tarefas.map(t => t.id));
    const comsByTask = {};
    coms.forEach(c => { (comsByTask[c.tarefa_id] = comsByTask[c.tarefa_id] || []).push(c); });
    const ehGestaoUser = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(funcao);
    tarefas.forEach(t => {
      const lr = leit[t.id] || '1970-01-01';
      const participante = ehGestaoUser || t.responsavel_id === userId || t.criado_por === userId || (t.apoios || []).some(a => a.id === userId);
      const cs = comsByTask[t.id] || [];
      t.comentarios_novos = cs.filter(c => c.criado_em > lr && c.autor_id && c.autor_id !== userId && (c.interno === 0 || participante)).length;
    });
  }

  // Atualiza status de atrasadas
  tarefas = tarefas.map(t => ({ ...t, status: verificarAtraso(t) }));

  // Métricas
  const metricas = {
    total: tarefas.length,
    aberto: tarefas.filter(t => t.status === 'aberto').length,
    andamento: tarefas.filter(t => t.status === 'andamento').length,
    concluido: tarefas.filter(t => t.status === 'concluido').length,
    atrasado: tarefas.filter(t => t.status === 'atrasado').length,
    notificacoes_pendentes: tarefas.filter(t => t.tipo === 'notificacao' && t.status !== 'concluido').length,
  };

  res.json({ tarefas, metricas });
}

// GET /tarefas/avaliacoes-pendentes — tarefas concluídas em que EU preciso avaliar o atendimento (bloqueante)
// IMPORTANTE: precisa vir ANTES de '/:id' senão o Express captura "avaliacoes-pendentes" como um id.
router.get('/avaliacoes-pendentes', (req, res) => {
  const rows = db.prepare(`
    SELECT t.id, t.titulo, t.criado_por, t.responsavel_id
    FROM tarefas t
    WHERE t.empresa_id=? AND t.tipo='tarefa' AND t.status='concluido' AND t.criado_por <> t.responsavel_id
      AND (t.criado_por=? OR t.responsavel_id=?)
      AND NOT EXISTS (SELECT 1 FROM avaliacoes_tarefa a WHERE a.tarefa_id=t.id AND a.avaliador_id=? AND a.tipo='atendimento')
    ORDER BY t.concluido_em DESC
  `).all(req.usuario.empresa_id, req.usuario.id, req.usuario.id, req.usuario.id);
  const lista = rows.map(t => {
    const outroId = t.criado_por === req.usuario.id ? t.responsavel_id : t.criado_por;
    const outro = db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(outroId);
    return { id: t.id, titulo: t.titulo, outro_nome: outro?.nome || 'colaborador' };
  });
  res.json({ pendentes: lista });
});

// GET /tarefas/:id
router.get('/:id', (req, res) => {
  const tarefa = db.prepare(`
    SELECT t.*, c.nome as responsavel_nome, l.nome as loja_nome
    FROM tarefas t
    LEFT JOIN colaboradores c ON c.id = t.responsavel_id
    LEFT JOIN lojas l ON l.id = t.loja_id
    WHERE t.id = ? AND t.empresa_id = ?
  `).get(req.params.id, req.usuario.empresa_id);

  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  res.json({ tarefa: { ...tarefa, status: verificarAtraso(tarefa) } });
});

// POST /tarefas — criar tarefa manualmente
router.post('/', (req, res) => {
  const { tipo, origem, titulo, descricao, responsavel_id, apoio_id, urgente, sla_horas, loja_id } = req.body;
  if (!titulo || !origem) return res.status(400).json({ erro: 'Título e origem obrigatórios.' });
  const podeApoio = !!req.usuario.escritorio;

  const id = gerarTarefa({
    empresa_id: req.usuario.empresa_id,
    loja_id: loja_id || req.usuario.loja_id,
    tipo: tipo || 'tarefa',
    origem, titulo, descricao,
    responsavel_id, apoio_id: podeApoio ? (apoio_id || null) : null,
    urgente, sla_horas,
    criado_por: req.usuario.id,
  });

  res.status(201).json({ mensagem: 'Tarefa criada.', id });
});

// PATCH /tarefas/:id/status — mover no kanban
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validos = ['aberto', 'andamento', 'concluido', 'atrasado'];
  if (!validos.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });

  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id = ? AND empresa_id = ?')
    .get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });

  // Apenas responsável, gerente ou superiores podem atualizar
  const podeAtualizar =
    tarefa.responsavel_id === req.usuario.id ||
    ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Gerente', 'RH', 'Suporte'].includes(req.usuario.funcao_nome);

  if (!podeAtualizar) return res.status(403).json({ erro: 'Sem permissão.' });

  const concluido_em = status === 'concluido' ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE tarefas SET status = ?, concluido_em = ?, atualizado_em = datetime('now') WHERE id = ?
  `).run(status, concluido_em, req.params.id);

  // Se concluída, verificar se precisa de avaliação
  if (status === 'concluido') {
    res.json({ mensagem: 'Tarefa atualizada.', requer_avaliacao: tarefa.tipo === 'tarefa' });
  } else {
    res.json({ mensagem: 'Tarefa atualizada.' });
  }
});

// POST /tarefas/:id/avaliacao — avaliar tarefa concluída
router.post('/:id/avaliacao', (req, res) => {
  const { tipo, nota } = req.body;
  if (!['resolucao', 'descricao'].includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (!nota || nota < 1 || nota > 5) return res.status(400).json({ erro: 'Nota deve ser entre 1 e 5.' });

  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id = ? AND empresa_id = ?')
    .get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  if (tarefa.status !== 'concluido') return res.status(400).json({ erro: 'Tarefa não está concluída.' });

  // Verificar se já avaliou
  const jaAvaliou = db.prepare('SELECT * FROM avaliacoes_tarefa WHERE tarefa_id = ? AND avaliador_id = ? AND tipo = ?')
    .get(req.params.id, req.usuario.id, tipo);
  if (jaAvaliou) return res.status(400).json({ erro: 'Você já avaliou esta tarefa.' });

  db.prepare('INSERT INTO avaliacoes_tarefa (id,tarefa_id,avaliador_id,tipo,nota,criado_em) VALUES (?,?,?,?,?,datetime(\'now\'))')
    .run(uuidv4(), req.params.id, req.usuario.id, tipo, nota);

  // Avaliação ruim (≤2) gera tarefa para o Diretor
  if (nota <= 2) {
    const diretor = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND funcao_id = 'func-diretor' AND ativo = 1 LIMIT 1`)
      .get(req.usuario.empresa_id);
    if (diretor) {
      gerarTarefa({
        empresa_id: req.usuario.empresa_id,
        loja_id: tarefa.loja_id,
        tipo: 'tarefa',
        origem: 'avaliacao_ruim',
        titulo: `Avaliação ruim — ${tarefa.titulo}`,
        descricao: `Tarefa avaliada com nota ${nota}/5 por ${req.usuario.nome}. Verificar qualidade da resolução.`,
        responsavel_id: diretor.id,
        urgente: 0,
        sla_horas: 24,
        criado_por: null,
      });
    }
  }

  res.json({ mensagem: 'Avaliação registrada.', gerou_alerta: nota <= 2 });
});

// POST /tarefas/:id/confirmar-urgencia — o responsável confirma se a tarefa é realmente urgente
// Se NÃO for, abre ocorrência (via RH) em quem marcou como urgente.
router.post('/:id/confirmar-urgencia', (req, res) => {
  const t = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!t) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  if (t.responsavel_id !== req.usuario.id) return res.status(403).json({ erro: 'Só o responsável confirma a urgência.' });
  if (!t.urgente) return res.status(400).json({ erro: 'Esta tarefa não está marcada como urgente.' });
  const confirma = req.body.confirma === true || req.body.confirma === 'sim';
  if (confirma) {
    db.prepare(`UPDATE tarefas SET urgente_confirmado='sim', atualizado_em=datetime('now') WHERE id=?`).run(t.id);
    return res.json({ mensagem: 'Urgência confirmada.' });
  }
  // Não é urgente: remove urgência e abre ocorrência (aguardando RH) em quem marcou
  db.prepare(`UPDATE tarefas SET urgente=0, urgente_confirmado='nao', atualizado_em=datetime('now') WHERE id=?`).run(t.id);
  if (t.urgente_por && t.urgente_por !== req.usuario.id) {
    const marcador = db.prepare('SELECT id, nome, loja_id FROM colaboradores WHERE id=? AND empresa_id=?').get(t.urgente_por, req.usuario.empresa_id);
    if (marcador) {
      const oid = uuidv4();
      db.prepare(`INSERT INTO ocorrencias (id,empresa_id,loja_id,colaborador_id,motivo_id,motivo,deducao,zera,categoria,indicador_alvo,obs,data,criado_por,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'aguardando_rh')`)
        .run(oid, req.usuario.empresa_id, marcador.loja_id, marcador.id, null,
          'Tarefa marcada como urgente sem necessidade', 0, 0, 'conduta', 'conduta',
          `Tarefa "${t.titulo}" foi marcada como urgente por ${marcador.nome}, mas o responsável (${req.usuario.nome}) indicou que não era urgente.`,
          new Date().toISOString().slice(0, 10), req.usuario.id);
      const rhs = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-rh' AND ativo=1`).all(req.usuario.empresa_id);
      rhs.forEach(r => gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: marcador.loja_id, tipo: 'tarefa', origem: 'ocorrencia_validar', referencia_id: oid,
        titulo: `Validar ocorrência: urgência indevida`,
        descricao: `${req.usuario.nome} indicou que a tarefa "${t.titulo}" não era urgente. Avalie a ocorrência sobre ${marcador.nome}.`,
        responsavel_id: r.id, urgente: 0, sla_horas: 48, criado_por: req.usuario.id }));
    }
  }
  res.json({ mensagem: 'Marcado como não urgente. Foi aberta uma ocorrência (via RH) sobre quem marcou.' });
});

// POST /tarefas/:id/ciencia — confirmar ciência de notificação
router.post('/:id/ciencia', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id = ? AND empresa_id = ? AND tipo = ?')
    .get(req.params.id, req.usuario.empresa_id, 'notificacao');
  if (!tarefa) return res.status(404).json({ erro: 'Notificação não encontrada.' });

  db.prepare(`UPDATE tarefas SET status = 'concluido', concluido_em = datetime('now'), atualizado_em = datetime('now') WHERE id = ?`)
    .run(req.params.id);

  res.json({ mensagem: 'Ciência confirmada.' });
});

// GET /tarefas/status/bloqueio — verifica se usuário está bloqueado
router.get('/status/bloqueio', (req, res) => {
  const notifVencida = db.prepare(`
    SELECT t.* FROM tarefas t
    WHERE t.empresa_id = ? AND t.responsavel_id = ?
    AND t.tipo = 'notificacao' AND t.status != 'concluido'
    AND t.prazo < datetime('now')
    LIMIT 1
  `).get(req.usuario.empresa_id, req.usuario.id);

  res.json({
    bloqueado: !!notifVencida,
    notificacao: notifVencida || null,
  });
});

// GET /tarefas/relatorio/sla — relatório de SLA por origem
router.get('/relatorio/sla', (req, res) => {
  const origens = db.prepare(`
    SELECT origem,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'concluido' AND (prazo IS NULL OR concluido_em <= prazo) THEN 1 ELSE 0 END) as no_prazo,
      SUM(CASE WHEN status = 'atrasado' OR (status != 'concluido' AND prazo < datetime('now')) THEN 1 ELSE 0 END) as atrasado,
      AVG(CASE WHEN concluido_em IS NOT NULL THEN
        (julianday(concluido_em) - julianday(criado_em)) * 24 ELSE NULL END) as tempo_medio_horas
    FROM tarefas
    WHERE empresa_id = ?
    GROUP BY origem
  `).all(req.usuario.empresa_id);

  res.json({ relatorio: origens });
});

// ── Comentários / justificativa / reanálise ──

// GET /tarefas/:id/comentarios — comentários internos (canal do apoio) ficam ocultos para quem abriu a tarefa
router.get('/:id/comentarios', (req, res) => {
  const tarefa = db.prepare('SELECT responsavel_id, apoio_id, criado_por FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  const podeVer = !!tarefa && (ehGestao || tarefa.responsavel_id === req.usuario.id || tarefa.apoio_id === req.usuario.id || ehApoio(req.params.id, req.usuario.id));
  const podeInterno = !!tarefa && (ehGestao || (!!tarefa.apoio_id && (tarefa.responsavel_id === req.usuario.id || tarefa.apoio_id === req.usuario.id || ehApoio(req.params.id, req.usuario.id))));
  let lista = db.prepare(`SELECT autor_nome, texto, tipo, interno, criado_em FROM tarefa_comentarios WHERE empresa_id=? AND tarefa_id=? ORDER BY criado_em`).all(req.usuario.empresa_id, req.params.id);
  if (!podeVer) lista = lista.filter(c => !c.interno);
  // marca como lido para este usuário (zera o alerta de novos comentários)
  try {
    db.prepare(`INSERT INTO tarefa_leitura (tarefa_id, colaborador_id, ultima_leitura) VALUES (?,?,datetime('now'))
      ON CONFLICT(tarefa_id, colaborador_id) DO UPDATE SET ultima_leitura=datetime('now')`).run(req.params.id, req.usuario.id);
  } catch (e) { /* tabela pode não existir em bases antigas sem a migração */ }
  res.json({ comentarios: lista, pode_interno: podeInterno });
});

// ── Anexos da tarefa (arquivo/imagem/áudio), guardados em base64 ──
const MAX_DADOS = 9000000; // ~6,7 MB por arquivo (base64)

// GET /tarefas/:id/anexos — lista (metadados + status de assinatura por signatário)
router.get('/:id/anexos', (req, res) => {
  const anexos = db.prepare(`SELECT id, autor_nome, tipo, nome, mime, tamanho, exige_assinatura, criado_em
    FROM tarefa_anexos WHERE empresa_id=? AND tarefa_id=? ORDER BY criado_em`).all(req.usuario.empresa_id, req.params.id);
  const lista = anexos.map(a => {
    const sigs = db.prepare(`SELECT signatario_id, signatario_nome, assinado, ip, assinado_em FROM tarefa_anexo_assinaturas WHERE anexo_id=? ORDER BY signatario_nome`).all(a.id);
    const assinado = sigs.length > 0 && sigs.every(s => s.assinado);
    return { ...a, signatarios: sigs, assinado: assinado ? 1 : 0 };
  });
  res.json({ anexos: lista });
});

// GET /tarefas/:id/anexos/:anexoId — dados do anexo (base64) para ver/baixar
router.get('/:id/anexos/:anexoId', (req, res) => {
  const a = db.prepare(`SELECT nome, mime, dados FROM tarefa_anexos WHERE id=? AND tarefa_id=? AND empresa_id=?`).get(req.params.anexoId, req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Anexo não encontrado.' });
  res.json({ nome: a.nome, mime: a.mime, dados: a.dados });
});

// POST /tarefas/:id/anexos — envia um anexo; signatarios = lista de ids que precisam assinar
router.post('/:id/anexos', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  if (!participante(req, tarefa)) return res.status(403).json({ erro: 'Sem permissão para anexar nesta tarefa.' });
  const { nome, mime, dados } = req.body;
  const signatarios = (req.usuario.escritorio && Array.isArray(req.body.signatarios)) ? req.body.signatarios.filter(Boolean) : [];
  if (!dados || !nome) return res.status(400).json({ erro: 'Arquivo inválido.' });
  if (dados.length > MAX_DADOS) return res.status(400).json({ erro: 'Arquivo muito grande (máx. ~6,7 MB).' });
  const tipo = (mime || '').startsWith('image/') ? 'imagem' : (mime || '').startsWith('audio/') ? 'audio' : 'arquivo';
  const exige = signatarios.length > 0 ? 1 : 0;
  const id = uuidv4();
  db.prepare(`INSERT INTO tarefa_anexos (id,empresa_id,tarefa_id,autor_id,autor_nome,tipo,nome,mime,tamanho,dados,exige_assinatura)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.usuario.empresa_id, tarefa.id, req.usuario.id, req.usuario.nome, tipo, nome, mime || '', Math.round(dados.length * 0.75), dados, exige);
  const nomes = [];
  signatarios.forEach(sid => {
    const p = db.prepare('SELECT nome FROM colaboradores WHERE id=? AND empresa_id=?').get(sid, req.usuario.empresa_id);
    if (p) { db.prepare(`INSERT INTO tarefa_anexo_assinaturas (id,empresa_id,anexo_id,signatario_id,signatario_nome) VALUES (?,?,?,?,?)`).run(uuidv4(), req.usuario.empresa_id, id, sid, p.nome); nomes.push(p.nome); }
  });
  db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,NULL,'Sistema',?, 'comentario')`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, `📎 Anexo: ${nome}${exige ? ` (assinatura: ${nomes.join(', ')})` : ''} — por ${req.usuario.nome}.`);
  res.status(201).json({ id, mensagem: 'Anexo enviado.' });
});

// POST /tarefas/:id/anexos/:anexoId/assinar — o signatário logado assina (selfie + ciente + IP + hora)
router.post('/:id/anexos/:anexoId/assinar', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const a = db.prepare('SELECT * FROM tarefa_anexos WHERE id=? AND tarefa_id=? AND empresa_id=?').get(req.params.anexoId, req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Anexo não encontrado.' });
  const sig = db.prepare(`SELECT * FROM tarefa_anexo_assinaturas WHERE anexo_id=? AND signatario_id=?`).get(a.id, req.usuario.id);
  if (!sig) return res.status(403).json({ erro: 'Você não está na lista de quem precisa assinar este documento.' });
  if (sig.assinado) return res.status(400).json({ erro: 'Você já assinou este documento.' });
  const selfie = req.body.selfie;
  if (!selfie) return res.status(400).json({ erro: 'A selfie é obrigatória para assinar.' });
  if (selfie.length > MAX_DADOS) return res.status(400).json({ erro: 'Selfie muito grande.' });
  if (!req.body.ciente) return res.status(400).json({ erro: 'Marque que está ciente do conteúdo antes de assinar.' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || '';
  db.prepare(`UPDATE tarefa_anexo_assinaturas SET assinado=1, selfie=?, ip=?, assinado_em=datetime('now'), ciente=1 WHERE id=?`).run(selfie, ip, sig.id);
  const faltam = db.prepare(`SELECT COUNT(*) c FROM tarefa_anexo_assinaturas WHERE anexo_id=? AND assinado=0`).get(a.id).c;
  if (faltam === 0) db.prepare(`UPDATE tarefa_anexos SET assinado=1 WHERE id=?`).run(a.id);
  db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,NULL,'Sistema',?, 'comentario')`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, `✍️ "${a.nome}" assinado e ciente por ${req.usuario.nome} (IP ${ip})${faltam === 0 ? ' — documento totalmente assinado.' : `, faltam ${faltam}.`}`);
  res.json({ mensagem: 'Documento assinado.', completo: faltam === 0 });
});

function participante(req, tarefa) {
  return tarefa.responsavel_id === req.usuario.id || tarefa.apoio_id === req.usuario.id || ehApoio(req.params.id, req.usuario.id) || tarefa.criado_por === req.usuario.id
    || ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
}

// POST /tarefas/:id/comentar — qualquer participante comenta
router.post('/:id/comentar', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  if (!participante(req, tarefa)) return res.status(403).json({ erro: 'Sem permissão para comentar.' });
  const texto = (req.body.texto || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Escreva um comentário.' });
  const podeInterno = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome) || (!!tarefa.apoio_id && (tarefa.responsavel_id === req.usuario.id || tarefa.apoio_id === req.usuario.id || ehApoio(req.params.id, req.usuario.id)));
  const interno = (req.body.interno && podeInterno) ? 1 : 0;
  db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo,interno) VALUES (?,?,?,?,?,?,'comentario',?)`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, req.usuario.id, req.usuario.nome, texto, interno);
  // O responsável interagir já significa que iniciou a tarefa
  if (tarefa.responsavel_id === req.usuario.id && tarefa.status === 'aberto') {
    db.prepare(`UPDATE tarefas SET status='andamento', atualizado_em=datetime('now') WHERE id=?`).run(tarefa.id);
  }
  res.json({ mensagem: 'Comentário adicionado.' });
});

// PATCH /tarefas/:id/transferir — passa a tarefa para outra pessoa (quem abriu ou gestão)
router.patch('/:id/transferir', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  if (tarefa.responsavel_id !== req.usuario.id && !ehGestao) return res.status(403).json({ erro: 'Só o responsável pela tarefa ou a gestão pode transferir.' });
  const novo = req.body.responsavel_id;
  if (!novo) return res.status(400).json({ erro: 'Escolha para quem transferir.' });
  if (novo === tarefa.responsavel_id) return res.status(400).json({ erro: 'A tarefa já é dessa pessoa.' });
  const pessoa = db.prepare('SELECT nome FROM colaboradores WHERE id=? AND empresa_id=?').get(novo, req.usuario.empresa_id);
  if (!pessoa) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  db.prepare(`UPDATE tarefas SET responsavel_id=?, status=CASE WHEN status='concluido' THEN status ELSE 'aberto' END, atualizado_em=datetime('now') WHERE id=?`).run(novo, tarefa.id);
  db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,NULL,'Sistema',?, 'comentario')`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, `Transferida para ${pessoa.nome} por ${req.usuario.nome}.`);
  res.json({ mensagem: `Tarefa transferida para ${pessoa.nome}.` });
});

// PATCH /tarefas/:id/apoio — define/troca/remove o apoio (só gestão)
router.patch('/:id/apoio', (req, res) => {
  if (!req.usuario.escritorio) return res.status(403).json({ erro: 'Só o pessoal do escritório pode definir apoio.' });
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const novo = req.body.apoio_id || null;
  if (novo && novo === tarefa.responsavel_id) return res.status(400).json({ erro: 'O apoio não pode ser o próprio responsável.' });
  let nome = null;
  if (novo) {
    const pessoa = db.prepare('SELECT nome FROM colaboradores WHERE id=? AND empresa_id=?').get(novo, req.usuario.empresa_id);
    if (!pessoa) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
    nome = pessoa.nome;
  }
  db.prepare(`UPDATE tarefas SET apoio_id=?, atualizado_em=datetime('now') WHERE id=?`).run(novo, tarefa.id);
  db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,NULL,'Sistema',?, 'comentario')`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, novo ? `Apoio definido: ${nome} (por ${req.usuario.nome}).` : `Apoio removido por ${req.usuario.nome}.`);
  res.json({ mensagem: novo ? `Apoio: ${nome}.` : 'Apoio removido.' });
});

// POST /tarefas/:id/apoios — adiciona um apoio (vários permitidos; só escritório)
router.post('/:id/apoios', (req, res) => {
  if (!req.usuario.escritorio) return res.status(403).json({ erro: 'Só o pessoal do escritório pode definir apoio.' });
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const cid = req.body.colaborador_id;
  if (!cid) return res.status(400).json({ erro: 'Informe o colaborador.' });
  if (cid === tarefa.responsavel_id) return res.status(400).json({ erro: 'O apoio não pode ser o próprio responsável.' });
  const pessoa = db.prepare('SELECT nome FROM colaboradores WHERE id=? AND empresa_id=?').get(cid, req.usuario.empresa_id);
  if (!pessoa) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
  const ja = db.prepare('SELECT 1 FROM tarefa_apoios WHERE tarefa_id=? AND colaborador_id=?').get(tarefa.id, cid);
  if (ja) return res.status(400).json({ erro: 'Essa pessoa já é apoio nesta tarefa.' });
  db.prepare('INSERT INTO tarefa_apoios (id,empresa_id,tarefa_id,colaborador_id) VALUES (?,?,?,?)').run(uuidv4(), req.usuario.empresa_id, tarefa.id, cid);
  // mantém apoio_id como o primário (primeiro apoio) para compatibilidade
  if (!tarefa.apoio_id) db.prepare(`UPDATE tarefas SET apoio_id=?, atualizado_em=datetime('now') WHERE id=?`).run(cid, tarefa.id);
  db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,NULL,'Sistema',?, 'comentario')`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, `Apoio adicionado: ${pessoa.nome} (por ${req.usuario.nome}).`);
  res.json({ mensagem: `Apoio adicionado: ${pessoa.nome}.` });
});

// DELETE /tarefas/:id/apoios/:colabId — remove um apoio (só escritório)
router.delete('/:id/apoios/:colabId', (req, res) => {
  if (!req.usuario.escritorio) return res.status(403).json({ erro: 'Só o pessoal do escritório pode remover apoio.' });
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  db.prepare('DELETE FROM tarefa_apoios WHERE tarefa_id=? AND colaborador_id=?').run(tarefa.id, req.params.colabId);
  // se removeu o primário, elege outro (ou limpa)
  if (tarefa.apoio_id === req.params.colabId) {
    const prox = db.prepare('SELECT colaborador_id FROM tarefa_apoios WHERE tarefa_id=? ORDER BY criado_em LIMIT 1').get(tarefa.id);
    db.prepare(`UPDATE tarefas SET apoio_id=?, atualizado_em=datetime('now') WHERE id=?`).run(prox ? prox.colaborador_id : null, tarefa.id);
  }
  db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,NULL,'Sistema',?, 'comentario')`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, `Apoio removido (por ${req.usuario.nome}).`);
  res.json({ mensagem: 'Apoio removido.' });
});

// POST /tarefas/:id/justificar — responsável justifica e pede reanálise
router.post('/:id/justificar', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  if (tarefa.responsavel_id !== req.usuario.id) return res.status(403).json({ erro: 'Só o responsável pode justificar.' });
  const texto = (req.body.texto || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Escreva a justificativa.' });
  db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,?,?,?,'justificativa')`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, req.usuario.id, req.usuario.nome, texto);
  db.prepare(`UPDATE tarefas SET reanalise_status='pendente', status=CASE WHEN status='aberto' THEN 'andamento' ELSE status END, atualizado_em=datetime('now') WHERE id=?`).run(tarefa.id);
  // Liga ao painel da Tesouraria quando a tarefa é de diferença de caixa
  if (tarefa.origem === 'caixa_justificativa' && tarefa.referencia_id) {
    db.prepare(`UPDATE lancamentos_caixa SET justificativa=?, justif_status='enviada' WHERE id=? AND empresa_id=?`).run(texto, tarefa.referencia_id, req.usuario.empresa_id);
  }
  res.json({ mensagem: 'Justificativa enviada para reanálise.' });
});

// POST /tarefas/:id/reanalisar — quem abriu (ou gestão) aceita/rejeita
router.post('/:id/reanalisar', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const podeAvaliar = tarefa.criado_por === req.usuario.id || ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  if (!podeAvaliar) return res.status(403).json({ erro: 'Sem permissão para reanalisar.' });
  const aceita = req.body.decisao === 'aceita';
  // Aceita ou rejeita, a decisão encerra a tarefa (vai para Concluído)
  db.prepare(`UPDATE tarefas SET reanalise_status=?, status='concluido', concluido_em=?, atualizado_em=datetime('now') WHERE id=?`)
    .run(aceita ? 'aceita' : 'rejeitada', new Date().toISOString(), tarefa.id);
  if (req.body.texto) db.prepare(`INSERT INTO tarefa_comentarios (id,empresa_id,tarefa_id,autor_id,autor_nome,texto,tipo) VALUES (?,?,?,?,?,?,'comentario')`)
    .run(uuidv4(), req.usuario.empresa_id, tarefa.id, req.usuario.id, req.usuario.nome, (aceita ? '[Aceitou] ' : '[Rejeitou] ') + req.body.texto);
  // Se for reposição aceita, perdoa a falta (não conta na disciplina)
  if (aceita && tarefa.origem === 'reposicao' && tarefa.responsavel_id) {
    const dia = (tarefa.criado_em || '').slice(0, 10);
    db.prepare(`UPDATE reposicao_dia SET fez=1 WHERE empresa_id=? AND colaborador_id=? AND data=?`).run(req.usuario.empresa_id, tarefa.responsavel_id, dia);
  }
  // Diferença de caixa: reflete a decisão no painel da Tesouraria
  if (tarefa.origem === 'caixa_justificativa' && tarefa.referencia_id) {
    db.prepare(`UPDATE lancamentos_caixa SET justif_status=? WHERE id=? AND empresa_id=?`).run(aceita ? 'aceita' : 'rejeitada', tarefa.referencia_id, req.usuario.empresa_id);
  }
  // Não gera mais aviso novo em "aberto": a tarefa original conclui e o colaborador vê o
  // resultado (✓/✗) e avalia no próprio card concluído.
  res.json({ mensagem: aceita ? 'Justificativa aceita — tarefa concluída.' : 'Justificativa rejeitada — tarefa encerrada.', avaliar: true });
});

// ── Avaliação mútua de atendimento (na conclusão da tarefa) ──
function outraParte(tarefa, usuarioId) {
  if (tarefa.criado_por === usuarioId) return tarefa.responsavel_id;
  if (tarefa.responsavel_id === usuarioId) return tarefa.criado_por;
  return null;
}

// GET /tarefas/:id/atendimento — situação da avaliação para o usuário atual
router.get('/:id/atendimento', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const outroId = outraParte(tarefa, req.usuario.id);
  if (!outroId || tarefa.tipo !== 'tarefa' || tarefa.status !== 'concluido' || tarefa.criado_por === tarefa.responsavel_id) {
    return res.json({ sou_parte: false });
  }
  const ja = db.prepare(`SELECT 1 FROM avaliacoes_tarefa WHERE tarefa_id=? AND avaliador_id=? AND tipo='atendimento'`).get(tarefa.id, req.usuario.id);
  const outro = db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(outroId);
  res.json({ sou_parte: true, ja_avaliei: !!ja, outro_nome: outro?.nome || 'colaborador' });
});

// POST /tarefas/:id/avaliar-atendimento — usuário avalia a OUTRA parte (1 a 5)
router.post('/:id/avaliar-atendimento', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  if (tarefa.status !== 'concluido') return res.status(400).json({ erro: 'Tarefa não está concluída.' });
  const outroId = outraParte(tarefa, req.usuario.id);
  if (!outroId) return res.status(403).json({ erro: 'Só as partes da tarefa avaliam o atendimento.' });
  const nota = Number(req.body.nota);
  if (!(nota >= 1 && nota <= 5)) return res.status(400).json({ erro: 'Nota de 1 a 5.' });
  const ja = db.prepare(`SELECT 1 FROM avaliacoes_tarefa WHERE tarefa_id=? AND avaliador_id=? AND tipo='atendimento'`).get(tarefa.id, req.usuario.id);
  if (ja) return res.status(400).json({ erro: 'Você já avaliou o atendimento desta tarefa.' });
  const avalId = uuidv4();
  const baixa = nota <= 3;
  db.prepare(`INSERT INTO avaliacoes_tarefa (id,tarefa_id,avaliador_id,avaliado_id,tipo,nota,status) VALUES (?,?,?,?,'atendimento',?,?)`)
    .run(avalId, tarefa.id, req.usuario.id, outroId, nota, baixa ? 'revisao' : 'ativa');

  // Avaliação baixa (≤3) → fica EM REVISÃO e não conta até o Diretor decidir (protege quem recebeu)
  let alerta = false;
  if (baixa) {
    const diretor = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-diretor' AND ativo=1 LIMIT 1`).get(req.usuario.empresa_id);
    const avaliado = db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(outroId);
    if (diretor) {
      gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: tarefa.loja_id, tipo: 'tarefa', origem: 'avaliacao_revisao',
        referencia_id: avalId,
        titulo: `Revisar avaliação de atendimento — ${avaliado?.nome || ''}`,
        descricao: `${req.usuario.nome} avaliou o atendimento de ${avaliado?.nome || 'colaborador'} com nota ${nota}/5 na tarefa "${tarefa.titulo}". Enquanto não for decidida, esta avaliação NÃO conta. Aceite se for justa, ou rejeite para não prejudicar a pessoa.`,
        responsavel_id: diretor.id, urgente: 0, sla_horas: 24, criado_por: null });
      alerta = true;
    }
  }
  res.json({ mensagem: 'Avaliação de atendimento registrada.', em_revisao: baixa, gerou_alerta: alerta });
});

// Diretor decide sobre uma avaliação de atendimento baixa: aceita (conta) ou rejeita (anula)
router.post('/:id/revisar-avaliacao', exigePerfil('Diretor Geral', 'Gestor Geral'), (req, res) => {
  const tarefa = db.prepare(`SELECT * FROM tarefas WHERE id=? AND empresa_id=? AND origem='avaliacao_revisao'`).get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa de revisão não encontrada.' });
  if (tarefa.responsavel_id !== req.usuario.id) return res.status(403).json({ erro: 'Só o responsável pela revisão decide.' });
  const decisao = req.body.decisao;
  if (!['aceita', 'rejeitada'].includes(decisao)) return res.status(400).json({ erro: 'Decisão inválida.' });
  const aval = db.prepare(`SELECT * FROM avaliacoes_tarefa WHERE id=?`).get(tarefa.referencia_id);
  if (aval) {
    db.prepare(`UPDATE avaliacoes_tarefa SET status=? WHERE id=?`).run(decisao === 'aceita' ? 'ativa' : 'anulada', aval.id);
  }
  db.prepare(`UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE id=?`).run(tarefa.id);
  res.json({ mensagem: decisao === 'aceita' ? 'Avaliação aceita — passa a contar.' : 'Avaliação rejeitada — não conta.' });
});

// ── Responder o e-mail de origem direto da tarefa (origem='email') ──────────
const emailInbox = require('../lib/emailInbox');
function podeResponderTarefa(req, tarefa) {
  if (!tarefa) return false;
  const gestao = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Supervisor'].includes(req.usuario.funcao_nome);
  return gestao || tarefa.responsavel_id === req.usuario.id || ehApoio(tarefa.id, req.usuario.id);
}
router.get('/:id/email', (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const meta = emailInbox.metaTarefa(req.usuario.empresa_id, tarefa.id);
  const historico = emailInbox.historicoTarefa(req.usuario.empresa_id, tarefa.id);
  // Abriu a tarefa → marca a resposta como lida.
  try { db.prepare('UPDATE email_tarefa_meta SET nova_resposta=0 WHERE tarefa_id=?').run(tarefa.id); } catch { /* ignore */ }
  const contaResp = emailInbox.contaResponder(req.usuario.id); // por qual conta ESTE usuário enviaria
  // Pode responder se tem permissão E (existe conta própria OU a conta padrão está habilitada).
  const podeResp = podeResponderTarefa(req, tarefa) && (contaResp.propria || emailInbox.habilitado());
  res.json({ meta, historico, podeResponder: podeResp, contaResponder: contaResp });
});
// IDs das tarefas de e-mail com resposta NÃO lida (p/ o Kanban mostrar o alerta sem abrir).
router.get('/email/nova-resposta', (req, res) => {
  const rows = db.prepare('SELECT tarefa_id FROM email_tarefa_meta WHERE empresa_id=? AND nova_resposta=1').all(req.usuario.empresa_id);
  res.json({ ids: rows.map(r => r.tarefa_id) });
});
router.post('/:id/email-responder', async (req, res) => {
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  if (!podeResponderTarefa(req, tarefa)) return res.status(403).json({ erro: 'Sem permissão para responder esta tarefa.' });
  // Passa o usuário inteiro: se ele tem conta própria, o envio sai do servidor DELE.
  const r = await emailInbox.responder(req.usuario.empresa_id, tarefa.id, req.body.texto, { id: req.usuario.id, nome: req.usuario.nome });
  if (!r.ok) return res.status(502).json(r);
  res.json(r);
});

// ── Conta de e-mail PRÓPRIA do colaborador (para responder pelo servidor dele) ──
// Cada um mexe só na PRÓPRIA conta (não é gated a gestão). Nunca devolve a senha.
router.get('/email/minha-conta', (req, res) => {
  const c = db.prepare('SELECT email, smtp_host, smtp_port, imap_host, imap_port, ativo FROM email_contas WHERE usuario_id=?').get(req.usuario.id);
  res.json({ conta: c ? { ...c, temSenha: true } : null });
});
router.put('/email/minha-conta', (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim();
  if (!email || !email.includes('@')) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  const smtpHost = String(b.smtp_host || '').trim();
  if (!smtpHost) return res.status(400).json({ erro: 'Informe o servidor de saída (SMTP).' });
  const atual = db.prepare('SELECT senha FROM email_contas WHERE usuario_id=?').get(req.usuario.id);
  // Se não mandou senha nova, mantém a atual (permite editar sem redigitar).
  const senha = (b.senha != null && String(b.senha).length) ? String(b.senha) : (atual ? atual.senha : '');
  if (!senha) return res.status(400).json({ erro: 'Informe a senha da conta de e-mail.' });
  db.prepare(`INSERT INTO email_contas (usuario_id, empresa_id, email, smtp_host, smtp_port, senha, imap_host, imap_port, ativo, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(usuario_id) DO UPDATE SET empresa_id=excluded.empresa_id, email=excluded.email, smtp_host=excluded.smtp_host,
      smtp_port=excluded.smtp_port, senha=excluded.senha, imap_host=excluded.imap_host, imap_port=excluded.imap_port,
      ativo=excluded.ativo, atualizado_em=datetime('now')`)
    .run(req.usuario.id, req.usuario.empresa_id, email, smtpHost, Number(b.smtp_port) || 465, senha,
      String(b.imap_host || '').trim() || null, Number(b.imap_port) || 993, b.ativo === false ? 0 : 1);
  res.json({ ok: true });
});
router.delete('/email/minha-conta', (req, res) => {
  db.prepare('DELETE FROM email_contas WHERE usuario_id=?').run(req.usuario.id);
  res.json({ ok: true });
});

// ── Cadastro de SLA (prazo em horas) por tipo de tarefa ─────────────────────
const GESTAO_SLA = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Supervisor'];
// Lista o SLA cadastrado + as origens que já apareceram nas tarefas (p/ configurar cada uma).
router.get('/sla/config', (req, res) => {
  const emp = req.usuario.empresa_id;
  const config = db.prepare('SELECT origem, horas, rotulo FROM sla_config WHERE empresa_id=?').all(emp);
  const cfgMap = {}; config.forEach(c => { cfgMap[c.origem] = c; });
  const origensUsadas = db.prepare("SELECT DISTINCT origem FROM tarefas WHERE empresa_id=? AND origem IS NOT NULL AND origem NOT LIKE 'email:%'").all(emp).map(r => r.origem);
  const padrao = cfgMap['_padrao'] ? cfgMap['_padrao'].horas : 48;
  res.json({ padrao, config: cfgMap, origens: origensUsadas.sort() });
});
// Salva/atualiza o SLA de uma origem (ou '_padrao' para o padrão geral). horas=0/vazio → herda o padrão.
router.put('/sla/config', exigePerfil(...GESTAO_SLA), (req, res) => {
  const { origem, horas, rotulo } = req.body;
  if (!origem) return res.status(400).json({ erro: 'Informe a origem.' });
  const h = Number(horas);
  if (!h || h <= 0) { // sem SLA próprio → remove (herda o padrão), exceto o próprio padrão
    if (origem !== '_padrao') db.prepare('DELETE FROM sla_config WHERE empresa_id=? AND origem=?').run(req.usuario.empresa_id, origem);
    return res.json({ ok: true, herda: true });
  }
  db.prepare(`INSERT INTO sla_config (empresa_id, origem, horas, rotulo, atualizado_em) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, origem) DO UPDATE SET horas=excluded.horas, rotulo=COALESCE(excluded.rotulo,sla_config.rotulo), atualizado_em=datetime('now')`)
    .run(req.usuario.empresa_id, origem, Math.round(h), rotulo || null);
  res.json({ ok: true });
});

module.exports = router;
module.exports.gerarTarefa = gerarTarefa;
