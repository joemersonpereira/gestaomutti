const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');

router.use(auth);

// Garante a tabela mesmo em bancos já existentes.
db.exec(`CREATE TABLE IF NOT EXISTS folgas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT, colaborador_id TEXT NOT NULL,
  data TEXT NOT NULL, status TEXT DEFAULT 'pendente',
  solicitado_por_id TEXT, aprovado_por_id TEXT, aprovado_em TEXT,
  substituto_id TEXT, motivo TEXT, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, colaborador_id, data)
);`);

const GESTAO_LOJA = ['Gerente', 'Subgerente'];
const SUPER = ['Supervisor', 'Diretor Geral', 'Gestor Geral', 'RH']; // aprovam gerente/subgerente
const ESCRITORIO_APROVA = ['RH', 'Diretor Geral', 'Gestor Geral'];    // aprovam administrativo

function infoColab(id, empresaId) {
  return db.prepare(`SELECT c.id, c.nome, c.loja_id, c.funcao_id, c.ativo, f.nome as funcao_nome, f.escritorio
    FROM colaboradores c JOIN funcoes f ON f.id = c.funcao_id WHERE c.id = ? AND c.empresa_id = ?`).get(id, empresaId);
}

// Avisa o substituto: tarefa de ciência com loja + turno do dia que ele cobrirá.
function notificarSubstituto(empresaId, { substitutoId, alvo, data, turno, lojaId, criadoPor, referenciaId }) {
  if (!substitutoId) return;
  const loja = db.prepare(`SELECT nome FROM lojas WHERE id=?`).get(lojaId);
  gerarTarefa({
    empresa_id: empresaId, loja_id: lojaId, tipo: 'notificacao', origem: 'folga_substituto', referencia_id: referenciaId,
    titulo: `Você vai substituir ${alvo?.nome || ''} · ${fmtBR(data)}`,
    descricao: `Você cobrirá ${alvo?.nome || 'um colega'} em ${fmtBR(data)} na loja ${loja?.nome || '—'}${turno ? `, turno ${turno}` : ''}. Confirme a ciência.`,
    responsavel_id: substitutoId, sla_horas: 72, criado_por: criadoPor,
  });
}

// Categoria do colaborador-alvo da folga
function categoria(colab) {
  if (GESTAO_LOJA.includes(colab.funcao_nome)) return 'gestao_loja';
  if (colab.escritorio) return 'escritorio';
  return 'loja';
}

// Quem (usuario) pode APROVAR a folga de 'alvo'?
function podeAprovar(usuario, alvo) {
  const cat = categoria(alvo);
  if (cat === 'gestao_loja') return SUPER.includes(usuario.funcao_nome);
  if (cat === 'escritorio') return ESCRITORIO_APROVA.includes(usuario.funcao_nome);
  // funcionário de loja: gerente/subgerente da mesma loja, ou supervisão
  if (SUPER.includes(usuario.funcao_nome)) return true;
  if (GESTAO_LOJA.includes(usuario.funcao_nome) && usuario.loja_id === alvo.loja_id) return true;
  return false;
}

// Precisa de substituto designado? (alvo é gerente/subgerente e o contraparte também fica ausente nesse dia)
function precisaSubstituto(empresaId, alvo, data) {
  if (!GESTAO_LOJA.includes(alvo.funcao_nome)) return false;
  const contra = alvo.funcao_nome === 'Gerente' ? 'Subgerente' : 'Gerente';
  const contraparte = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id = c.funcao_id
    WHERE c.empresa_id = ? AND c.loja_id = ? AND f.nome = ? AND c.ativo = 1 LIMIT 1`).get(empresaId, alvo.loja_id, contra);
  if (!contraparte) return true; // não há contraparte → loja ficaria sem gestão
  const contraOff = db.prepare(`SELECT 1 FROM folgas WHERE empresa_id = ? AND colaborador_id = ? AND data = ? AND status != 'rejeitada'`)
    .get(empresaId, contraparte.id, data);
  return !!contraOff;
}

function lideres(empresaId, lojaId) {
  return db.prepare(`SELECT id, nome FROM colaboradores WHERE empresa_id = ? AND loja_id = ? AND lideranca = 1 AND ativo = 1 ORDER BY nome`).all(empresaId, lojaId);
}

// Primeiro colaborador ativo com uma das funções (em ordem de prioridade); opcionalmente da loja.
function primeiroComFuncao(empresaId, nomes, lojaId, excluirId) {
  for (const nome of nomes) {
    const args = lojaId ? [empresaId, nome, lojaId] : [empresaId, nome];
    if (excluirId) args.push(excluirId);
    const row = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id = c.funcao_id
      WHERE c.empresa_id = ? AND f.nome = ? AND c.ativo = 1 ${lojaId ? 'AND c.loja_id = ?' : ''}${excluirId ? ' AND c.id <> ?' : ''} ORDER BY c.nome LIMIT 1`).get(...args);
    if (row) return row.id;
  }
  return null;
}

const fmtBR = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

// Cria o card de aprovação de folga no Kanban, direcionado a quem aprova.
function criarTarefaFolga(folga, alvo) {
  const cat = categoria(alvo);
  let responsavel = null, apoio = null;
  if (cat === 'loja') {
    responsavel = primeiroComFuncao(folga.empresa_id, ['Gerente', 'Subgerente'], alvo.loja_id, folga.solicitado_por_id);
    apoio = primeiroComFuncao(folga.empresa_id, ['Subgerente'], alvo.loja_id, folga.solicitado_por_id);
    if (apoio === responsavel) apoio = null;
  } else if (cat === 'gestao_loja') {
    responsavel = primeiroComFuncao(folga.empresa_id, ['Supervisor', 'Gestor Geral', 'Diretor Geral', 'RH'], null, folga.solicitado_por_id);
  } else {
    responsavel = primeiroComFuncao(folga.empresa_id, ['RH', 'Diretor Geral', 'Gestor Geral'], null, folga.solicitado_por_id);
  }
  if (!responsavel) return; // sem aprovador cadastrado → fica só na lista de pendentes
  gerarTarefa({
    empresa_id: folga.empresa_id, loja_id: alvo.loja_id, tipo: 'tarefa', origem: 'folga', referencia_id: folga.id,
    titulo: `Folga: ${alvo.nome} · ${fmtBR(folga.data)}`,
    descricao: `Pedido de folga de ${alvo.nome} (${alvo.funcao_nome}) para ${fmtBR(folga.data)}.` + (folga.motivo ? ` Motivo: ${folga.motivo}.` : ''),
    responsavel_id: responsavel, apoio_id: apoio, urgente: 0, criado_por: folga.solicitado_por_id,
  });
}

function concluirTarefaFolga(empresaId, folgaId) {
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE empresa_id=? AND origem='folga' AND referencia_id=? AND status!='concluido'`).run(empresaId, folgaId);
}

// POST /folgas — solicita (pra si) ou lança (pra outro). Define aprovada/pendente, fila e substituto.
// Cria uma folga (solicitação ou lançamento). Retorna {code,erro,...} em caso de bloqueio.
function criarFolga(usuario, alvoId, data, opts = {}) {
  const { motivo, substituto_id, turno } = opts;
  if (!data) return { code: 400, erro: 'Informe a data da folga.' };
  const hojeISO = new Date().toISOString().slice(0, 10);
  if (data < hojeISO) return { code: 400, erro: 'Não é possível pedir folga em data retroativa.' };
  // Regra: pede-se a folga do mês seguinte até o último dia do mês atual. Folga no mês corrente
  // está "fora do prazo" — libera, mas com índice de reprovação alto.
  const foraPrazo = data.slice(0, 7) === hojeISO.slice(0, 7);
  const alvo = infoColab(alvoId, usuario.empresa_id);
  if (!alvo || !alvo.ativo) return { code: 404, erro: 'Colaborador não encontrado.' };

  if (alvoId !== usuario.id) {
    const podeLancar = SUPER.includes(usuario.funcao_nome) || (GESTAO_LOJA.includes(usuario.funcao_nome) && usuario.loja_id === alvo.loja_id);
    if (!podeLancar) return { code: 403, erro: 'Sem permissão para lançar folga de outra pessoa.' };
  }

  const existe = db.prepare(`SELECT id FROM folgas WHERE empresa_id = ? AND colaborador_id = ? AND data = ?`).get(usuario.empresa_id, alvoId, data);
  if (existe) return { code: 400, erro: 'Já existe folga registrada para essa pessoa nessa data.' };

  if (precisaSubstituto(usuario.empresa_id, alvo, data) && !substituto_id) {
    return { code: 400, precisa_substituto: true, lideres: lideres(usuario.empresa_id, alvo.loja_id),
      erro: 'Gerente e subgerente ausentes nesse dia — escolha quem vai substituir na loja.' };
  }

  // Aprovada na hora SOMENTE quando a gestão LANÇA para outra pessoa (alvo ≠ quem lança) e tem alçada.
  // Pedido para si mesmo NUNCA é auto-aprovado — vai sempre para aprovação de um superior.
  const ehLancamentoParaOutro = alvoId !== usuario.id;
  const status = opts.forcarStatus || (ehLancamentoParaOutro && podeAprovar(usuario, alvo) ? 'aprovada' : 'pendente');
  const id = uuidv4();
  db.prepare(`INSERT INTO folgas (id, empresa_id, loja_id, colaborador_id, data, status, solicitado_por_id, aprovado_por_id, aprovado_em, substituto_id, turno, motivo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, usuario.empresa_id, alvo.loja_id, alvoId, data, status, usuario.id,
    status === 'aprovada' ? usuario.id : null, status === 'aprovada' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
    substituto_id || null, turno || null, motivo || null);

  if (status === 'pendente') {
    criarTarefaFolga({ id, empresa_id: usuario.empresa_id, data, motivo, solicitado_por_id: usuario.id }, alvo);
  }
  // Se já aprovada e há substituto, avisa o substituto (loja + turno).
  if (status === 'aprovada' && substituto_id) {
    notificarSubstituto(usuario.empresa_id, { substitutoId: substituto_id, alvo, data, turno, lojaId: alvo.loja_id, criadoPor: usuario.id, referenciaId: id });
  }
  // "Só para ciência": folga imposta pela gestão; o colaborador só confirma ciência (não pode recusar).
  if (opts.ciencia && status === 'aprovada' && alvoId !== usuario.id) {
    gerarTarefa({
      empresa_id: usuario.empresa_id, loja_id: alvo.loja_id, tipo: 'notificacao', origem: 'folga_ciencia', referencia_id: id,
      titulo: `Folga marcada · ${fmtBR(data)}`,
      descricao: `A gestão marcou uma folga sua em ${fmtBR(data)}.${motivo ? ' ' + motivo : ''} Confirme a ciência.`,
      responsavel_id: alvoId, sla_horas: 72, criado_por: usuario.id,
    });
  }

  const fila = db.prepare(`SELECT id FROM folgas WHERE empresa_id = ? AND loja_id = ? AND data = ? AND status != 'rejeitada' ORDER BY criado_em, id`)
    .all(usuario.empresa_id, alvo.loja_id, data);
  return {
    code: 201, id, status, fila_posicao: fila.findIndex(f => f.id === id) + 1, fila_total: fila.length,
    reprovacao_alta: foraPrazo,
    mensagem: (status === 'aprovada' ? 'Folga registrada e aprovada.' : 'Folga solicitada — pendente de aprovação.')
      + (foraPrazo ? ' ⚠️ Pedida dentro do mês (fora do prazo) — índice de reprovação alto.' : ''),
  };
}

router.post('/', (req, res) => {
  const { colaborador_id, data, datas, motivo, substituto_id, turno, ciencia, lancamentos } = req.body;
  const lista = [...new Set((Array.isArray(datas) && datas.length ? datas : (data ? [data] : [])).filter(Boolean))].sort();
  if (!lista.length) return res.status(400).json({ erro: 'Informe ao menos uma data.' });

  // Várias pessoas de uma vez: lancamentos = [{ colaborador_id, substituto_id, turno }]
  const pessoas = Array.isArray(lancamentos) && lancamentos.length
    ? lancamentos.filter(p => p.colaborador_id)
    : [{ colaborador_id: colaborador_id || req.usuario.id, substituto_id, turno }];

  if (pessoas.length === 1 && lista.length === 1 && !Array.isArray(lancamentos)) {
    const p = pessoas[0];
    const r = criarFolga(req.usuario, p.colaborador_id, lista[0], { motivo, substituto_id: p.substituto_id, turno: p.turno, ciencia });
    return res.status(r.code || 200).json(r);
  }

  const resultados = [];
  for (const p of pessoas) {
    for (const d of lista) {
      const r = criarFolga(req.usuario, p.colaborador_id, d, { motivo, substituto_id: p.substituto_id, turno: p.turno, ciencia });
      resultados.push({ colaborador_id: p.colaborador_id, data: d, ok: r.code === 201, status: r.status, precisa_substituto: !!r.precisa_substituto, erro: r.code >= 400 ? r.erro : null });
    }
  }
  const criadas = resultados.filter(r => r.ok).length;
  res.status(201).json({ multi: true, resultados, mensagem: `${criadas} de ${resultados.length} lançamento(s) registrados.` });
});

// GET /folgas?loja_id=&mes=&ano= — lista pra exibir no calendário/lista
router.get('/', (req, res) => {
  const { loja_id } = req.query;
  const mes = parseInt(req.query.mes, 10), ano = parseInt(req.query.ano, 10);
  let q = `SELECT fo.*, c.nome as colaborador_nome, fn.nome as funcao_nome,
      sub.nome as substituto_nome, ap.nome as aprovado_por_nome, sol.nome as solicitado_por_nome
    FROM folgas fo
    JOIN colaboradores c ON c.id = fo.colaborador_id
    JOIN funcoes fn ON fn.id = c.funcao_id
    LEFT JOIN colaboradores sub ON sub.id = fo.substituto_id
    LEFT JOIN colaboradores ap ON ap.id = fo.aprovado_por_id
    LEFT JOIN colaboradores sol ON sol.id = fo.solicitado_por_id
    WHERE fo.empresa_id = ?`;
  const p = [req.usuario.empresa_id];
  if (loja_id) { q += ` AND fo.loja_id = ?`; p.push(loja_id); }
  if (mes && ano) { q += ` AND CAST(strftime('%m', fo.data) AS INTEGER) = ? AND CAST(strftime('%Y', fo.data) AS INTEGER) = ?`; p.push(mes, ano); }
  q += ` ORDER BY fo.data, fo.criado_em`;
  res.json({ folgas: db.prepare(q).all(...p) });
});

// GET /folgas/minhas — folgas do próprio usuário
router.get('/minhas', (req, res) => {
  const rows = db.prepare(`SELECT fo.*, sub.nome as substituto_nome, ap.nome as aprovado_por_nome
    FROM folgas fo LEFT JOIN colaboradores sub ON sub.id = fo.substituto_id LEFT JOIN colaboradores ap ON ap.id = fo.aprovado_por_id
    WHERE fo.empresa_id = ? AND fo.colaborador_id = ? ORDER BY fo.data DESC`).all(req.usuario.empresa_id, req.usuario.id);
  res.json({ folgas: rows });
});

// GET /folgas/equipe?loja_id= — equipe pra gestão/supervisão lançar folga
router.get('/equipe', (req, res) => {
  const isGestao = GESTAO_LOJA.includes(req.usuario.funcao_nome);
  const isSuper = SUPER.includes(req.usuario.funcao_nome);
  if (!isGestao && !isSuper) return res.json({ equipe: [] });
  let q = `SELECT c.id, c.nome, f.nome as funcao_nome FROM colaboradores c JOIN funcoes f ON f.id = c.funcao_id WHERE c.empresa_id = ? AND c.ativo = 1`;
  const p = [req.usuario.empresa_id];
  if (isGestao) { q += ` AND c.loja_id = ?`; p.push(req.usuario.loja_id); }
  else if (req.query.loja_id) { q += ` AND c.loja_id = ?`; p.push(req.query.loja_id); }
  q += ` ORDER BY f.nome, c.nome`;
  res.json({ equipe: db.prepare(q).all(...p) });
});

// GET /folgas/pendentes — folgas pendentes que EU posso aprovar
router.get('/pendentes', (req, res) => {
  const rows = db.prepare(`SELECT fo.*, c.nome as colaborador_nome, c.loja_id as alvo_loja, fn.nome as funcao_nome, fn.escritorio,
      l.nome as loja_nome, sol.nome as solicitado_por_nome
    FROM folgas fo JOIN colaboradores c ON c.id = fo.colaborador_id JOIN funcoes fn ON fn.id = c.funcao_id
    LEFT JOIN lojas l ON l.id = fo.loja_id LEFT JOIN colaboradores sol ON sol.id = fo.solicitado_por_id
    WHERE fo.empresa_id = ? AND fo.status = 'pendente' ORDER BY fo.data, fo.criado_em`).all(req.usuario.empresa_id);
  const meus = rows.filter(r => podeAprovar(req.usuario, { funcao_nome: r.funcao_nome, escritorio: r.escritorio, loja_id: r.alvo_loja }));
  // Anexa a posição na fila (loja+data) pra cada pendente
  meus.forEach(r => {
    const fila = db.prepare(`SELECT id FROM folgas WHERE empresa_id = ? AND loja_id = ? AND data = ? AND status != 'rejeitada' ORDER BY criado_em, id`)
      .all(req.usuario.empresa_id, r.loja_id, r.data);
    r.fila_posicao = fila.findIndex(f => f.id === r.id) + 1;
    r.fila_total = fila.length;
  });
  res.json({ pendentes: meus });
});

// POST /folgas/:id/aprovar — aprova (opcional substituto_id se ainda faltar)
router.post('/:id/aprovar', (req, res) => {
  const fo = db.prepare(`SELECT * FROM folgas WHERE id = ? AND empresa_id = ?`).get(req.params.id, req.usuario.empresa_id);
  if (!fo) return res.status(404).json({ erro: 'Folga não encontrada.' });
  if (fo.status === 'aprovada') return res.json({ mensagem: 'Já estava aprovada.' });
  if (fo.colaborador_id === req.usuario.id) return res.status(403).json({ erro: 'Você não pode aprovar a sua própria folga — ela precisa ser aprovada por outra pessoa.' });
  const alvo = infoColab(fo.colaborador_id, req.usuario.empresa_id);
  if (!podeAprovar(req.usuario, alvo)) return res.status(403).json({ erro: 'Sem permissão para aprovar esta folga.' });

  let substituto = fo.substituto_id || req.body.substituto_id || null;
  const turno = req.body.turno || fo.turno || null;
  if (!substituto) {
    const ehLideranca = precisaSubstituto(req.usuario.empresa_id, alvo, fo.data);
    const candidatos = ehLideranca
      ? lideres(req.usuario.empresa_id, fo.loja_id)
      : db.prepare(`SELECT c.id, c.nome, fn.nome as funcao FROM colaboradores c JOIN funcoes fn ON fn.id=c.funcao_id
          WHERE c.empresa_id=? AND c.loja_id=? AND c.ativo=1 AND c.id<>? ORDER BY c.nome`).all(req.usuario.empresa_id, fo.loja_id, fo.colaborador_id);
    return res.status(400).json({ exige_substituto: true, precisa_substituto: ehLideranca, substitutos: candidatos, lideres: ehLideranca ? candidatos : [],
      erro: 'Informe quem vai substituir antes de aprovar a folga.' });
  }
  db.prepare(`UPDATE folgas SET status = 'aprovada', aprovado_por_id = ?, aprovado_em = datetime('now'), substituto_id = ?, turno = ? WHERE id = ?`)
    .run(req.usuario.id, substituto, turno, fo.id);
  concluirTarefaFolga(req.usuario.empresa_id, fo.id);
  // Avisa o substituto designado (loja + turno).
  if (substituto) notificarSubstituto(req.usuario.empresa_id, { substitutoId: substituto, alvo, data: fo.data, turno, lojaId: fo.loja_id, criadoPor: req.usuario.id, referenciaId: fo.id });
  // Folga fora do prazo (pedida dentro do mês) aprovada → RH e supervisão entram para ciência.
  const foraPrazo = fo.criado_em && fo.data && fo.criado_em.slice(0, 7) === fo.data.slice(0, 7);
  if (foraPrazo) {
    const rh = primeiroComFuncao(req.usuario.empresa_id, ['RH', 'Gestor Geral', 'Diretor Geral']);
    const sup = primeiroComFuncao(req.usuario.empresa_id, ['Supervisor', 'Gestor Geral', 'Diretor Geral']);
    if (rh) gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id: fo.loja_id, tipo: 'notificacao', origem: 'folga',
      titulo: `Folga fora do prazo aprovada · ${alvo.nome}`,
      descricao: `Folga de ${fmtBR(fo.data)} foi pedida dentro do mês (fora do prazo) e aprovada por ${req.usuario.nome}. RH e supervisão em apoio para ciência.`,
      responsavel_id: rh, apoio_id: sup && sup !== rh ? sup : null, criado_por: req.usuario.id,
    });
  }
  res.json({ mensagem: 'Folga aprovada.' });
});

// POST /folgas/:id/rejeitar
router.post('/:id/rejeitar', (req, res) => {
  const fo = db.prepare(`SELECT * FROM folgas WHERE id = ? AND empresa_id = ?`).get(req.params.id, req.usuario.empresa_id);
  if (!fo) return res.status(404).json({ erro: 'Folga não encontrada.' });
  const alvo = infoColab(fo.colaborador_id, req.usuario.empresa_id);
  if (!podeAprovar(req.usuario, alvo)) return res.status(403).json({ erro: 'Sem permissão para rejeitar esta folga.' });
  db.prepare(`UPDATE folgas SET status = 'rejeitada', aprovado_por_id = ?, aprovado_em = datetime('now') WHERE id = ?`).run(req.usuario.id, fo.id);
  concluirTarefaFolga(req.usuario.empresa_id, fo.id);
  // Abre um card pro solicitante: ele pode pedir outro dia antes de encerrar.
  gerarTarefa({
    empresa_id: req.usuario.empresa_id, loja_id: fo.loja_id, tipo: 'tarefa', origem: 'folga_rejeitada', referencia_id: fo.id,
    titulo: `Folga recusada · ${fmtBR(fo.data)}`,
    descricao: `Sua folga de ${fmtBR(fo.data)} foi recusada. Você pode pedir outro dia aqui no card ou encerrar.`,
    responsavel_id: fo.colaborador_id, criado_por: req.usuario.id,
  });
  res.json({ mensagem: 'Folga rejeitada.' });
});

// POST /folgas/:id/repropor — solicitante pede outra data após recusa; encerra o card de recusa
router.post('/:id/repropor', (req, res) => {
  const fo = db.prepare(`SELECT * FROM folgas WHERE id = ? AND empresa_id = ?`).get(req.params.id, req.usuario.empresa_id);
  if (!fo) return res.status(404).json({ erro: 'Folga não encontrada.' });
  if (fo.colaborador_id !== req.usuario.id && fo.solicitado_por_id !== req.usuario.id)
    return res.status(403).json({ erro: 'Só quem pediu pode repropor.' });
  const r = criarFolga(req.usuario, fo.colaborador_id, req.body.data, { motivo: req.body.motivo });
  if (r.code && r.code >= 400) return res.status(r.code).json(r);
  // encerra o card de recusa
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE empresa_id=? AND origem='folga_rejeitada' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, fo.id);
  res.json(r);
});

// POST /folgas/:id/encerrar-recusa — solicitante desiste e fecha o card de recusa
router.post('/:id/encerrar-recusa', (req, res) => {
  const fo = db.prepare(`SELECT * FROM folgas WHERE id = ? AND empresa_id = ?`).get(req.params.id, req.usuario.empresa_id);
  if (!fo) return res.status(404).json({ erro: 'Folga não encontrada.' });
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE empresa_id=? AND origem='folga_rejeitada' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, fo.id);
  res.json({ mensagem: 'Encerrado.' });
});

// DELETE /folgas/:id — cancela a própria folga (ou gestão/supervisão cancela)
router.delete('/:id', (req, res) => {
  const fo = db.prepare(`SELECT * FROM folgas WHERE id = ? AND empresa_id = ?`).get(req.params.id, req.usuario.empresa_id);
  if (!fo) return res.status(404).json({ erro: 'Folga não encontrada.' });
  const alvo = infoColab(fo.colaborador_id, req.usuario.empresa_id);
  const pode = fo.colaborador_id === req.usuario.id || podeAprovar(req.usuario, alvo);
  if (!pode) return res.status(403).json({ erro: 'Sem permissão para cancelar esta folga.' });
  db.prepare(`DELETE FROM folgas WHERE id = ?`).run(fo.id);
  db.prepare(`DELETE FROM tarefas WHERE empresa_id=? AND origem='folga' AND referencia_id=?`).run(req.usuario.empresa_id, fo.id);
  res.json({ mensagem: 'Folga cancelada.' });
});

// GET /folgas/:id — detalhe da folga (usado pelo card do Kanban): fila, permissão e substituto
router.get('/:id', (req, res) => {
  const fo = db.prepare(`SELECT fo.*, c.nome as colaborador_nome, c.loja_id as alvo_loja, fn.nome as funcao_nome, fn.escritorio,
      sub.nome as substituto_nome, sol.nome as solicitado_por_nome
    FROM folgas fo JOIN colaboradores c ON c.id = fo.colaborador_id JOIN funcoes fn ON fn.id = c.funcao_id
    LEFT JOIN colaboradores sub ON sub.id = fo.substituto_id LEFT JOIN colaboradores sol ON sol.id = fo.solicitado_por_id
    WHERE fo.id = ? AND fo.empresa_id = ?`).get(req.params.id, req.usuario.empresa_id);
  if (!fo) return res.status(404).json({ erro: 'Folga não encontrada.' });
  const fila = db.prepare(`SELECT id FROM folgas WHERE empresa_id = ? AND loja_id = ? AND data = ? AND status != 'rejeitada' ORDER BY criado_em, id`)
    .all(req.usuario.empresa_id, fo.loja_id, fo.data);
  fo.fila_posicao = fila.findIndex(f => f.id === fo.id) + 1;
  fo.fila_total = fila.length;
  fo.fora_prazo = !!(fo.criado_em && fo.data && fo.criado_em.slice(0, 7) === fo.data.slice(0, 7));
  const alvo = { funcao_nome: fo.funcao_nome, escritorio: fo.escritorio, loja_id: fo.alvo_loja };
  fo.pode_aprovar = podeAprovar(req.usuario, alvo);
  fo.precisa_substituto = !fo.substituto_id && precisaSubstituto(req.usuario.empresa_id, alvo, fo.data);
  fo.lideres = fo.precisa_substituto ? lideres(req.usuario.empresa_id, fo.loja_id) : [];
  // Substituto é obrigatório em toda aprovação. Para liderança ausente, candidatos = Liderança;
  // nos demais casos, candidatos = colegas ativos da mesma loja (menos a própria pessoa).
  fo.exige_substituto = !fo.substituto_id;
  fo.substitutos = fo.precisa_substituto
    ? lideres(req.usuario.empresa_id, fo.loja_id)
    : db.prepare(`SELECT c.id, c.nome, fn.nome as funcao FROM colaboradores c JOIN funcoes fn ON fn.id=c.funcao_id
        WHERE c.empresa_id=? AND c.loja_id=? AND c.ativo=1 AND c.id<>? ORDER BY c.nome`)
        .all(req.usuario.empresa_id, fo.loja_id, fo.colaborador_id);
  res.json(fo);
});

module.exports = router;
