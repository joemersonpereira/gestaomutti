const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const { scorePorOcorrencias } = require('../lib/ocorrencias');

router.use(auth);

// Aplica/reverte o impacto em PONTOS de uma ocorrência na gamificação (idempotente por ref).
function aplicarPontosOcorrencia(empresaId, o, usuarioId) {
  const pts = Math.trunc(Number(o.pontos) || 0);
  if (!pts) return;
  const ref = `ocorrencia-pontos:${o.id}`;
  if (db.prepare('SELECT 1 FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').get(empresaId, ref)) return;
  const colab = db.prepare('SELECT nome, loja_id FROM colaboradores WHERE id=?').get(o.colaborador_id) || {};
  const comp = String(o.data || new Date().toISOString()).slice(0, 7);
  db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
    VALUES (?,?,?,?,?, ?, ?, ?, ?, 'ocorrencia', ?, ?, datetime('now'))`)
    .run(uuidv4(), empresaId, o.colaborador_id, colab.nome || '', colab.loja_id || o.loja_id || null,
      pts < 0 ? 'penalidade' : 'premio', `Ocorrência: ${o.motivo} — ${pts > 0 ? '+' : ''}${pts} pontos`, pts, comp, ref, usuarioId || null);
}
function reverterPontosOcorrencia(empresaId, ocorrenciaId) {
  db.prepare('DELETE FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').run(empresaId, `ocorrencia-pontos:${ocorrenciaId}`);
}

// ── Cadastro de motivos ──
router.get('/motivos', (req, res) => {
  let q = 'SELECT * FROM ocorrencia_motivos WHERE empresa_id=? AND ativo=1';
  const p = [req.usuario.empresa_id];
  if (req.query.categoria) { q += ' AND categoria=?'; p.push(req.query.categoria); }
  res.json({ motivos: db.prepare(q + ' ORDER BY categoria, motivo').all(...p) });
});

router.post('/motivos', exigePerfil('RH', 'Supervisor', 'Tesouraria', 'Suporte', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { categoria, motivo, deducao, zera, indicador_alvo, indicador_gerente, exige_termo, termo_tipo, pontos } = req.body;
  if (!categoria || !motivo || !indicador_alvo) return res.status(400).json({ erro: 'Categoria, motivo e indicador são obrigatórios.' });
  db.prepare(`INSERT INTO ocorrencia_motivos (id,empresa_id,categoria,motivo,deducao,zera,indicador_alvo,indicador_gerente,exige_termo,termo_tipo,pontos) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuidv4(), req.usuario.empresa_id, categoria, motivo, Number(deducao) || 0, zera ? 1 : 0, indicador_alvo, indicador_gerente || null, exige_termo ? 1 : 0, exige_termo ? (termo_tipo || 'advertencia') : null, Math.trunc(Number(pontos) || 0));
  res.json({ mensagem: 'Motivo cadastrado.' });
});

// Editar motivo existente (rota literal /motivos/:id — declarada antes do /:id genérico)
router.put('/motivos/:id', exigePerfil('RH', 'Supervisor', 'Tesouraria', 'Suporte', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const m = db.prepare('SELECT * FROM ocorrencia_motivos WHERE id=? AND empresa_id=? AND ativo=1').get(req.params.id, req.usuario.empresa_id);
  if (!m) return res.status(404).json({ erro: 'Motivo não encontrado.' });
  const { categoria, motivo, deducao, zera, indicador_alvo, indicador_gerente, exige_termo, termo_tipo, pontos } = req.body;
  if (!categoria || !motivo || !indicador_alvo) return res.status(400).json({ erro: 'Categoria, motivo e indicador são obrigatórios.' });
  db.prepare(`UPDATE ocorrencia_motivos SET categoria=?, motivo=?, deducao=?, zera=?, indicador_alvo=?, indicador_gerente=?, exige_termo=?, termo_tipo=?, pontos=? WHERE id=? AND empresa_id=?`)
    .run(categoria, motivo, Number(deducao) || 0, zera ? 1 : 0, indicador_alvo, indicador_gerente || null, exige_termo ? 1 : 0, exige_termo ? (termo_tipo || 'advertencia') : null, Math.trunc(Number(pontos) || 0), req.params.id, req.usuario.empresa_id);
  res.json({ mensagem: 'Motivo atualizado.' });
});

// Excluir motivo (soft delete — ocorrências já lançadas continuam intactas)
router.delete('/motivos/:id', exigePerfil('RH', 'Supervisor', 'Tesouraria', 'Suporte', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const m = db.prepare('SELECT id FROM ocorrencia_motivos WHERE id=? AND empresa_id=? AND ativo=1').get(req.params.id, req.usuario.empresa_id);
  if (!m) return res.status(404).json({ erro: 'Motivo não encontrado.' });
  db.prepare('UPDATE ocorrencia_motivos SET ativo=0 WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ mensagem: 'Motivo excluído.' });
});

// ── Modelos de termo (advertência/suspensão) configuráveis por empresa ──
const DEFAULT_TERMO_ADVERTENCIA = `TERMO DE ADVERTÊNCIA

Colaborador(a): {COLABORADOR}
Empresa (registro): {EMPRESA_REGISTRO}
Local de trabalho: {LOCAL_TRABALHO}
Data: {DATA}
Motivo: {MOTIVO}

Prezado(a) colaborador(a),

Pela presente, comunicamos a aplicação de advertência em razão dos fatos descritos a seguir:

{OBS}

Esclarecemos que a reincidência poderá ensejar a aplicação de penalidades mais severas, inclusive a rescisão por justa causa, nos termos do art. 482 da CLT.

Solicitamos a leitura, ciência e assinatura deste documento.

Local e data: ______________________________

_______________________________      _______________________________
   Assinatura do(a) colaborador(a)              Assinatura da empresa`;

const DEFAULT_TERMO_SUSPENSAO = `TERMO DE SUSPENSÃO

Colaborador(a): {COLABORADOR}
Empresa (registro): {EMPRESA_REGISTRO}
Local de trabalho: {LOCAL_TRABALHO}
Data: {DATA}
Motivo: {MOTIVO}

Prezado(a) colaborador(a),

Pela presente, comunicamos a aplicação de suspensão em razão dos fatos descritos a seguir:

{OBS}

Período de suspensão: de ____/____/______ a ____/____/______ ( ____ dia(s) ).

Esclarecemos que a reincidência poderá ensejar a aplicação de penalidades mais severas, inclusive a rescisão por justa causa, nos termos do art. 482 da CLT.

Solicitamos a leitura, ciência e assinatura deste documento.

Local e data: ______________________________

_______________________________      _______________________________
   Assinatura do(a) colaborador(a)              Assinatura da empresa`;

function getModelo(empresaId, chave, padrao) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?').get(empresaId, chave);
  return row?.valor ?? padrao;
}

// GET /ocorrencias/modelos-termo — modelos atuais (com placeholders)
router.get('/modelos-termo', (req, res) => {
  res.json({
    advertencia: getModelo(req.usuario.empresa_id, 'termo_advertencia', DEFAULT_TERMO_ADVERTENCIA),
    suspensao: getModelo(req.usuario.empresa_id, 'termo_suspensao', DEFAULT_TERMO_SUSPENSAO),
    placeholders: ['{COLABORADOR}', '{DATA}', '{MOTIVO}', '{OBS}'],
  });
});

// POST /ocorrencias/modelos-termo — salva os modelos (RH/gestão)
router.post('/modelos-termo', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const up = db.prepare(`INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`);
  if (typeof req.body.advertencia === 'string') up.run(req.usuario.empresa_id, 'termo_advertencia', req.body.advertencia);
  if (typeof req.body.suspensao === 'string') up.run(req.usuario.empresa_id, 'termo_suspensao', req.body.suspensao);
  res.json({ mensagem: 'Modelos de termo salvos.' });
});

// ── Lançar / listar ocorrências ──
router.get('/', (req, res) => {
  const ehGestao = ['RH', 'Suporte', 'Tesouraria', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Gerente', 'Subgerente', 'Marketing', 'Comercial'].includes(req.usuario.funcao_nome);
  let q = `SELECT o.*, c.nome as colaborador_nome, COALESCE(NULLIF(c.empresa_registro,''), e.nome) as empresa_registro FROM ocorrencias o JOIN colaboradores c ON c.id=o.colaborador_id LEFT JOIN empresas e ON e.id=o.empresa_id WHERE o.empresa_id=?`;
  const p = [req.usuario.empresa_id];
  if (req.query.colaborador_id) { q += ' AND o.colaborador_id=?'; p.push(req.query.colaborador_id); }
  if (req.query.mes) { q += ` AND CAST(strftime('%m', o.data) AS INTEGER)=?`; p.push(parseInt(req.query.mes)); }
  if (req.query.ano) { q += ` AND CAST(strftime('%Y', o.data) AS INTEGER)=?`; p.push(parseInt(req.query.ano)); }
  // O colaborador só enxerga a ocorrência DEPOIS de o RH validar (nunca aguardando_rh/rejeitada)
  const veProprio = req.query.colaborador_id === req.usuario.id;
  if (!ehGestao || veProprio) { q += ` AND o.status NOT IN ('aguardando_rh','rejeitada')`; }
  res.json({ ocorrencias: db.prepare(q + ' ORDER BY o.data DESC, o.criado_em DESC').all(...p) });
});

// Fila do RH: ocorrências aguardando validação (e reanálises pedidas)
router.get('/fila-rh', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const rows = db.prepare(`SELECT o.*, c.nome as colaborador_nome, q.nome as lancado_por_nome FROM ocorrencias o
    JOIN colaboradores c ON c.id=o.colaborador_id LEFT JOIN colaboradores q ON q.id=o.criado_por
    WHERE o.empresa_id=? AND o.status IN ('aguardando_rh','reanalise') ORDER BY o.criado_em DESC`).all(req.usuario.empresa_id);
  res.json({ ocorrencias: rows });
});

const LANCAR_PERFIS = ['Supervisor', 'Gerente', 'Subgerente', 'Gestor Geral', 'Diretor Geral', 'RH', 'Suporte', 'Tesouraria', 'Marketing', 'Comercial'];
const ATENDIMENTO_FUNCOES = ['func-vendedor', 'func-caixa', 'func-conferente', 'func-farmaceutico', 'func-estagiario', 'func-subgerente'];

router.post('/', exigePerfil(...LANCAR_PERFIS), (req, res) => {
  const { colaborador_id, motivo_id, obs } = req.body;
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  if (!colaborador_id || !motivo_id) return res.status(400).json({ erro: 'Colaborador e motivo obrigatórios.' });
  const m = db.prepare('SELECT * FROM ocorrencia_motivos WHERE id=? AND empresa_id=?').get(motivo_id, req.usuario.empresa_id);
  if (!m) return res.status(404).json({ erro: 'Motivo não encontrado.' });
  const colab = db.prepare('SELECT id, loja_id, nome, funcao_id FROM colaboradores WHERE id=? AND empresa_id=?').get(colaborador_id, req.usuario.empresa_id);
  if (!colab) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  // Gerente/Subgerente só lançam para a equipe de Atendimento da própria loja
  if (['Gerente', 'Subgerente'].includes(req.usuario.funcao_nome)) {
    if (!ATENDIMENTO_FUNCOES.includes(colab.funcao_id) || colab.loja_id !== req.usuario.loja_id) {
      return res.status(403).json({ erro: 'Você só pode lançar ocorrências para a equipe de Atendimento da sua loja.' });
    }
  }
  // Evita lançar a MESMA ocorrência (mesmo motivo, colaborador e dia) mais de uma vez enquanto ainda está aguardando RH ou ativa
  const dup = db.prepare(`SELECT 1 FROM ocorrencias WHERE empresa_id=? AND colaborador_id=? AND motivo_id=? AND data=? AND status IN ('aguardando_rh','ativa')`)
    .get(req.usuario.empresa_id, colaborador_id, motivo_id, data);
  if (dup) return res.status(409).json({ erro: 'Já existe uma ocorrência deste motivo para este colaborador hoje (aguardando RH ou ativa). Não é possível lançar de novo.' });

  const id = uuidv4();
  db.prepare(`INSERT INTO ocorrencias (id,empresa_id,loja_id,colaborador_id,motivo_id,motivo,deducao,zera,categoria,indicador_alvo,indicador_gerente,obs,data,criado_por,status,exige_termo,termo_tipo,pontos)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'aguardando_rh',?,?,?)`)
    .run(id, req.usuario.empresa_id, colab.loja_id, colaborador_id, m.id, m.motivo, m.deducao, m.zera, m.categoria, m.indicador_alvo, m.indicador_gerente || null, obs || null, data, req.usuario.id, m.exige_termo ? 1 : 0, m.exige_termo ? (m.termo_tipo || 'advertencia') : null, m.pontos || 0);
  // Abre tarefa de validação para o RH E para o Diretor ao mesmo tempo.
  // Quem decidir primeiro (autorizar ou rejeitar) fecha automaticamente o card do outro.
  const validadores = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id IN ('func-rh','func-diretor') AND ativo=1`).all(req.usuario.empresa_id);
  const destinos = [...new Set(validadores.map(r => r.id))];
  destinos.forEach(rid => gerarTarefa({
    empresa_id: req.usuario.empresa_id, loja_id: colab.loja_id, tipo: 'tarefa', origem: 'ocorrencia_validar', referencia_id: id,
    titulo: `Validar ocorrência: ${m.motivo}`,
    descricao: `${req.usuario.nome} lançou uma ocorrência para ${colab.nome} (${m.motivo}). Valide se autoriza (vai ao colaborador) ou rejeita. ${obs || ''}`.trim(),
    responsavel_id: rid, urgente: 0, sla_horas: 48, criado_por: req.usuario.id,
  }));
  res.json({ mensagem: 'Ocorrência registrada e enviada para validação do RH e do Diretor.' });
});

// RH valida: autoriza (vai ao colaborador) ou rejeita
router.post('/:id/validar', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const o = db.prepare('SELECT * FROM ocorrencias WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!o) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
  if (o.status !== 'aguardando_rh') return res.status(400).json({ erro: 'Esta ocorrência não está aguardando validação.' });
  const autorizar = req.body.decisao === 'autorizar';
  // conclui a tarefa de validação do RH
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now') WHERE empresa_id=? AND origem='ocorrencia_validar' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, o.id);
  if (!autorizar) {
    db.prepare(`UPDATE ocorrencias SET status='rejeitada', validada_por=?, validada_em=datetime('now'), obs=COALESCE(obs,'') || ' | RH rejeitou: ' || ? WHERE id=?`).run(req.usuario.id, req.body.obs || '', o.id);
    if (o.criado_por) gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: o.loja_id, tipo: 'notificacao', origem: 'ocorrencia',
      titulo: `Ocorrência não autorizada: ${o.motivo}`, descricao: `O RH não autorizou a ocorrência de ${o.motivo}. ${req.body.obs || ''}`.trim(),
      responsavel_id: o.criado_por, urgente: 0, sla_horas: null, criado_por: req.usuario.id });
    return res.json({ mensagem: 'Ocorrência rejeitada — não chega ao colaborador.' });
  }
  const exigeAss = req.body.exige_assinatura ? 1 : 0;
  const documento = typeof req.body.documento === 'string' ? req.body.documento : null;
  db.prepare(`UPDATE ocorrencias SET status='ativa', validada_por=?, validada_em=datetime('now'), exige_assinatura=?, documento=COALESCE(?, documento) WHERE id=?`).run(req.usuario.id, exigeAss, documento, o.id);
  // Impacto em PONTOS do colaborador (gamificação), se o motivo tiver pontos configurados. Idempotente.
  aplicarPontosOcorrencia(req.usuario.empresa_id, o, req.usuario.id);
  // agora sim notifica o colaborador (pode pedir reanálise / assinar)
  gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: o.loja_id, tipo: exigeAss ? 'tarefa' : 'notificacao', origem: 'ocorrencia', referencia_id: o.id,
    titulo: `Ocorrência registrada: ${o.motivo}`,
    descricao: `Foi registrada uma ocorrência (${o.motivo})${o.zera ? ' — zera o indicador' : ` — impacto de ${o.deducao}% no indicador`}.${exigeAss ? ' É necessário assinar o termo.' : ''} Você pode pedir reanálise se discordar.`.trim(),
    responsavel_id: o.colaborador_id, urgente: exigeAss ? 1 : 0, sla_horas: exigeAss ? 72 : 48, criado_por: req.usuario.id });
  res.json({ mensagem: `Ocorrência autorizada e enviada ao colaborador.${exigeAss ? ' Assinatura solicitada.' : ''}` });
});

// Colaborador pede reanálise (só depois de validada)
router.post('/:id/reanalise', (req, res) => {
  const o = db.prepare('SELECT * FROM ocorrencias WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!o) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
  if (o.colaborador_id !== req.usuario.id) return res.status(403).json({ erro: 'Só o próprio colaborador pode pedir reanálise.' });
  if (o.status !== 'ativa') return res.status(400).json({ erro: 'Só é possível pedir reanálise de uma ocorrência ativa.' });
  db.prepare(`UPDATE ocorrencias SET status='reanalise', reanalise=? WHERE id=?`).run(req.body.texto || '', o.id);
  const rhs = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-rh' AND ativo=1`).all(req.usuario.empresa_id);
  rhs.forEach(r => gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: o.loja_id, tipo: 'tarefa', origem: 'ocorrencia_reanalise', referencia_id: o.id,
    titulo: `Reanálise pedida: ${o.motivo}`, descricao: `${req.usuario.nome} pediu reanálise da ocorrência. ${req.body.texto || ''} Decida se mantém ou reverte.`.trim(),
    responsavel_id: r.id, urgente: 0, sla_horas: 48, criado_por: req.usuario.id }));
  res.json({ mensagem: 'Reanálise enviada ao RH.' });
});

// RH decide a reanálise: aceita (reverte) ou mantém
router.post('/:id/decidir-reanalise', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const o = db.prepare('SELECT * FROM ocorrencias WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!o) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
  if (o.status !== 'reanalise') return res.status(400).json({ erro: 'Não há reanálise pendente.' });
  const aceita = req.body.decisao === 'aceita';
  db.prepare(`UPDATE ocorrencias SET status=? WHERE id=?`).run(aceita ? 'revertida' : 'ativa', o.id);
  if (aceita) reverterPontosOcorrencia(req.usuario.empresa_id, o.id); // devolve os pontos descontados
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now') WHERE empresa_id=? AND origem='ocorrencia_reanalise' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, o.id);
  gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: o.loja_id, tipo: 'notificacao', origem: 'ocorrencia',
    titulo: aceita ? `Reanálise aceita: ${o.motivo}` : `Reanálise não aceita: ${o.motivo}`,
    descricao: aceita ? 'Sua reanálise foi aceita — a ocorrência foi revertida.' : 'Sua reanálise não foi aceita — a ocorrência permanece.',
    responsavel_id: o.colaborador_id, urgente: 0, sla_horas: null, criado_por: req.usuario.id });
  res.json({ mensagem: aceita ? 'Reanálise aceita — ocorrência revertida.' : 'Reanálise mantida.' });
});

// Colaborador assina o termo (quando o RH exigiu assinatura)
router.post('/:id/assinar', (req, res) => {
  const o = db.prepare('SELECT * FROM ocorrencias WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!o) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
  if (o.colaborador_id !== req.usuario.id) return res.status(403).json({ erro: 'Só o próprio colaborador pode assinar.' });
  if (!o.exige_assinatura) return res.status(400).json({ erro: 'Esta ocorrência não exige assinatura.' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || '';
  db.prepare(`UPDATE ocorrencias SET assinado_em=datetime('now') WHERE id=?`).run(o.id);
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now') WHERE empresa_id=? AND origem='ocorrencia' AND referencia_id=? AND responsavel_id=? AND status!='concluido'`).run(req.usuario.empresa_id, o.id, o.colaborador_id);
  res.json({ mensagem: 'Termo assinado.', assinado_em: new Date().toISOString(), ip });
});

// Score do indicador impactado por ocorrências
router.get('/score', (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const nota = scorePorOcorrencias(req.usuario.empresa_id, req.query.colaborador_id, req.query.indicador_alvo || 'conduta', mes, ano);
  res.json({ nota });
});

// GET /ocorrencias/:id — detalhe de uma ocorrência (RH/gestão), usado pelo card de validação no Kanban
router.get('/:id', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Tesouraria', 'Suporte'), (req, res) => {
  const o = db.prepare(`SELECT oc.*, c.nome as colaborador_nome, l.nome as loja_nome,
      COALESCE(NULLIF(c.empresa_registro,''), e.nome) as empresa_registro
    FROM ocorrencias oc JOIN colaboradores c ON c.id=oc.colaborador_id JOIN lojas l ON l.id=oc.loja_id
    LEFT JOIN empresas e ON e.id=oc.empresa_id
    WHERE oc.id=? AND oc.empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!o) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
  res.json(o);
});

module.exports = router;
