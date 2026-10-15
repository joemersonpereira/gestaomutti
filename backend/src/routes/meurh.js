const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const vendasErp = require('../lib/vendasErp');

router.use(auth);

// ── Meus dados (o próprio colaborador vê e atualiza seus dados pessoais) ──────────
router.get('/dados', (req, res) => {
  const c = db.prepare(`SELECT c.id, c.nome, c.cpf, c.email, c.telefone, c.nascimento, c.admissao, c.apelido, (c.foto IS NOT NULL) tem_foto,
      c.contato_emergencia_nome, c.contato_emergencia_telefone, c.endereco, c.cep, c.endereco_numero, c.complemento, c.bairro, c.cidade, c.uf,
      c.num_calcado, c.tam_blusa, c.tam_calca, c.tam_jaleco, c.lgpd_consentido, c.lgpd_consentido_em, f.nome funcao, l.nome loja
    FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id JOIN lojas l ON l.id=c.loja_id WHERE c.id=?`).get(req.usuario.id);
  const docs = db.prepare(`SELECT id, nome, mime FROM colaborador_docs WHERE colaborador_id=? ORDER BY criado_em DESC`).all(req.usuario.id);
  const dependentes = db.prepare(`SELECT id, tipo, especie, nome, apelido, nascimento, (foto IS NOT NULL) tem_foto FROM dependentes WHERE colaborador_id=? ORDER BY criado_em`).all(req.usuario.id);
  res.json({ ...c, documentos: docs, dependentes });
});
// Campos que o colaborador pode alterar sozinho (NÃO inclui função/salário/loja).
const AUTO_CAMPOS = ['telefone', 'nascimento', 'apelido', 'contato_emergencia_nome', 'contato_emergencia_telefone',
  'endereco', 'cep', 'endereco_numero', 'complemento', 'bairro', 'cidade', 'uf', 'num_calcado', 'tam_blusa', 'tam_calca', 'tam_jaleco'];
router.patch('/dados', (req, res) => {
  const b = req.body || {};
  AUTO_CAMPOS.forEach(k => { if (b[k] !== undefined) db.prepare(`UPDATE colaboradores SET ${k}=? WHERE id=?`).run((b[k] || '').toString().slice(0, 500) || null, req.usuario.id); });
  if (b.email !== undefined && String(b.email).trim()) db.prepare(`UPDATE colaboradores SET email=? WHERE id=?`).run(String(b.email).slice(0, 160).toLowerCase(), req.usuario.id);
  if (b.foto !== undefined) db.prepare(`UPDATE colaboradores SET foto=? WHERE id=?`).run((b.foto || '').toString().slice(0, 900000) || null, req.usuario.id);
  res.json({ ok: true, mensagem: 'Dados atualizados.' });
});

// Meus dependentes (filhos e pets) — o próprio colaborador gerencia
router.post('/dados/dependentes', (req, res) => {
  const d = req.body || {};
  if (!String(d.nome || '').trim()) return res.status(400).json({ erro: 'Informe o nome.' });
  const id = uuidv4();
  db.prepare(`INSERT INTO dependentes (id,empresa_id,colaborador_id,tipo,especie,nome,apelido,nascimento,foto,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, req.usuario.id, d.tipo === 'pet' ? 'pet' : 'filho', d.tipo === 'pet' ? (d.especie || 'outro') : null,
      String(d.nome).slice(0, 120), (d.apelido || '').toString().slice(0, 80) || null, d.nascimento || null, (d.foto || '').toString().slice(0, 900000) || null);
  res.status(201).json({ ok: true, id });
});
router.delete('/dados/dependentes/:id', (req, res) => {
  db.prepare(`DELETE FROM dependentes WHERE id=? AND colaborador_id=?`).run(req.params.id, req.usuario.id);
  res.json({ ok: true });
});

// Consentimento LGPD do próprio colaborador (gera termo em Meus Documentos)
router.post('/dados/lgpd', async (req, res) => {
  const c = db.prepare('SELECT * FROM colaboradores WHERE id=?').get(req.usuario.id);
  try { const { registrarConsentimentoLgpd } = require('./colaboradores'); await registrarConsentimentoLgpd(req.usuario.empresa_id, c, req.ip, req.usuario.nome); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
router.post('/dados/docs', (req, res) => {
  const { nome, mime, dados } = req.body || {};
  if (!dados) return res.status(400).json({ erro: 'Anexe um arquivo.' });
  db.prepare(`INSERT INTO colaborador_docs (id,empresa_id,colaborador_id,nome,mime,dados,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`)
    .run(uuidv4(), req.usuario.empresa_id, req.usuario.id, (nome || 'documento').toString().slice(0, 120), (mime || '').toString().slice(0, 60), String(dados).slice(0, 8_000_000));
  res.status(201).json({ ok: true });
});
router.get('/dados/docs/:id', (req, res) => {
  const d = db.prepare(`SELECT nome, mime, dados FROM colaborador_docs WHERE id=? AND colaborador_id=?`).get(req.params.id, req.usuario.id);
  if (!d) return res.status(404).end();
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${(d.nome || 'documento').replace(/[^\w .-]/g, '_')}"`);
  res.send(Buffer.from(String(d.dados).replace(/^data:.*;base64,/, ''), 'base64'));
});
router.delete('/dados/docs/:id', (req, res) => {
  db.prepare(`DELETE FROM colaborador_docs WHERE id=? AND colaborador_id=?`).run(req.params.id, req.usuario.id);
  res.json({ ok: true });
});

// ── Minhas férias (afastamentos tipo=ferias) + solicitar ─────────────────────────
router.get('/ferias', (req, res) => {
  const ferias = db.prepare(`SELECT data_inicio, data_fim, motivo, criado_em FROM afastamentos
    WHERE colaborador_id=? AND tipo='ferias' ORDER BY data_inicio DESC LIMIT 20`).all(req.usuario.id);
  const hoje = new Date().toISOString().slice(0, 10);
  const emFerias = ferias.some(f => f.data_inicio <= hoje && (!f.data_fim || f.data_fim >= hoje));
  res.json({ ferias, em_ferias: emFerias });
});
router.post('/ferias/solicitar', (req, res) => {
  const de = (req.body.data_inicio || '').toString().slice(0, 10), ate = (req.body.data_fim || '').toString().slice(0, 10);
  if (!de) return res.status(400).json({ erro: 'Informe a data desejada.' });
  // Solicitação de férias vai para o RH (fallback: gerente da loja, se não houver RH cadastrado).
  const dest = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-rh' AND ativo=1 LIMIT 1`).get(req.usuario.empresa_id)
    || db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id='func-gerente' AND ativo=1 LIMIT 1`).get(req.usuario.empresa_id, req.usuario.loja_id);
  if (dest) gerarTarefa({
    empresa_id: req.usuario.empresa_id, loja_id: req.usuario.loja_id, tipo: 'tarefa', origem: 'ferias_solicitacao',
    titulo: `Solicitação de férias — ${req.usuario.nome}`,
    descricao: `${req.usuario.nome} solicitou férias a partir de ${de.split('-').reverse().join('/')}${ate ? ` até ${ate.split('-').reverse().join('/')}` : ''}.${req.body.obs ? '\n' + req.body.obs : ''}`,
    responsavel_id: dest.id, urgente: 0, sla_horas: 120, criado_por: req.usuario.id,
  });
  res.status(201).json({ ok: true, mensagem: 'Solicitação enviada — o gestor/RH vai analisar e você recebe a resposta por aqui. Não é aprovação automática. 👍' });
});

// GET /meu-rh?colaborador_id=&mes=&ano=
// Sem colaborador_id => o próprio usuário. Gestão pode consultar membros da loja.
router.get('/', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const alvo = req.query.colaborador_id || req.usuario.id;

  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'RH'].includes(req.usuario.funcao_nome);
  if (alvo !== req.usuario.id && !ehGestao) return res.status(403).json({ erro: 'Sem permissão.' });

  const colab = db.prepare(`
    SELECT c.id, c.nome, c.email, c.loja_id, c.funcao_id, l.nome as loja_nome, f.nome as funcao_nome
    FROM colaboradores c JOIN lojas l ON l.id=c.loja_id JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.id=? AND c.empresa_id=?
  `).get(alvo, req.usuario.empresa_id);
  if (!colab) return res.status(404).json({ erro: 'Colaborador não encontrado.' });

  // Ocorrências (pontos deduzidos no período)
  const ocorrencias = db.prepare(`SELECT id, tipo, descricao, pontos_deduzidos, status, data_ocorrencia FROM ocorrencias WHERE colaborador_id=? ORDER BY data_ocorrencia DESC LIMIT 20`).all(alvo);
  const pontosDeduzidos = ocorrencias.reduce((a, o) => a + (o.pontos_deduzidos || 0), 0);
  const ocorrenciasPendentes = ocorrencias.filter(o => ['pendente', 'contestado'].includes(o.status)).length;

  // Movimentações (transferências / cobertura)
  const movimentacoes = db.prepare(`
    SELECT m.id, m.tipo, m.tipo_transferencia, m.motivo, m.status, m.data_inicio, m.data_fim, m.ciencia_em,
           lo.nome as origem, ld.nome as destino
    FROM movimentacoes m LEFT JOIN lojas lo ON lo.id=m.loja_origem_id LEFT JOIN lojas ld ON ld.id=m.loja_destino_id
    WHERE m.colaborador_id=? ORDER BY m.criado_em DESC LIMIT 15
  `).all(alvo);

  // Certificados / reconhecimentos
  const certificados = db.prepare(`SELECT id, tipo, titulo, descricao, pontos, validado, criado_em FROM certificados WHERE colaborador_id=? ORDER BY criado_em DESC`).all(alvo);
  const pontosCertificados = certificados.filter(c => c.validado).reduce((a, c) => a + (c.pontos || 0), 0);

  // Tarefas atribuídas a mim
  const tarefas = db.prepare(`SELECT id, titulo, status, urgente, prazo, origem FROM tarefas WHERE responsavel_id=? AND status!='concluido' ORDER BY urgente DESC, prazo LIMIT 15`).all(alvo);

  // Desempenho comercial (se vendedor)
  let comercial = null;
  if (colab.funcao_id === 'func-vendedor') {
    const vendido = await vendasErp.totalVendedorMes(alvo, mes, ano); // ao vivo do ERP
    const ind = db.prepare(`SELECT indicador, avaliacao FROM indicadores_vendedor WHERE colaborador_id=? AND mes=? AND ano=?`).all(alvo, mes, ano);
    comercial = { vendido, indicadores_avaliados: ind.length };
  }

  // Avaliação da função (farmacêutico/estagiário/conferente)
  let avaliacaoFuncao = null;
  const avf = db.prepare(`SELECT indicador, avaliacao FROM avaliacoes_funcao WHERE colaborador_id=? AND mes=? AND ano=?`).all(alvo, mes, ano);
  if (avf.length) avaliacaoFuncao = { itens: avf.length };

  // Pontuação consolidada (base 100 - deduções + certificados, teto 100)
  const pontuacao = Math.max(0, Math.min(100, 100 - pontosDeduzidos + pontosCertificados));

  res.json({
    colaborador: colab,
    mes, ano,
    resumo: {
      pontuacao,
      pontos_deduzidos: pontosDeduzidos,
      pontos_certificados: pontosCertificados,
      ocorrencias_pendentes: ocorrenciasPendentes,
      tarefas_abertas: tarefas.length,
      certificados: certificados.length,
    },
    comercial,
    avaliacao_funcao: avaliacaoFuncao,
    ocorrencias, movimentacoes, certificados, tarefas,
  });
});

module.exports = router;
