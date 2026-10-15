// pontoRepp.js — API do módulo PONTO REP-P NATIVO (escala com validação de legislação
// e autorização do RH, modelos de escala, motivos de afastamento, parâmetros legais).
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const P = require('../lib/pontorep');
const C = require('../lib/pontorepColeta');
const F = require('../lib/pontorepFiscal');
const R = require('../lib/pontorepRegra');
const B = require('../lib/pontorepBanco');

// Leitura (consultar escala, batidas, banco de horas, espelho): inclui Gerente/Subgerente
const GESTAO = ['RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Controladoria', 'Gerente', 'Subgerente'];
const RH_SUP = ['RH', 'Gestor Geral', 'Diretor Geral']; // quem pode AUTORIZAR/alterar
router.use(auth);
const emp = (req) => req.usuario.empresa_id;

// cadastros base
router.get('/modelos', (req, res) => res.json(P.modelos(emp(req))));
router.get('/motivos', (req, res) => res.json(P.motivos(emp(req))));
router.post('/motivos', exigePerfil(...RH_SUP), (req, res) => { const r = P.criarMotivo(emp(req), req.body || {}); if (r.erro) return res.status(400).json(r); res.json(r); });
router.put('/motivos/:id', exigePerfil(...RH_SUP), (req, res) => res.json(P.salvarMotivoFlags(emp(req), req.params.id, req.body || {})));
// Justificativas de atraso (catálogo)
router.get('/justificativas', (req, res) => res.json(P.justificativasAtraso(emp(req))));
router.post('/justificativas', exigePerfil(...RH_SUP), (req, res) => { const r = P.salvarJustificativa(emp(req), req.body || {}); if (r.erro) return res.status(400).json(r); res.json(r); });
router.delete('/justificativas/:id', exigePerfil(...RH_SUP), (req, res) => res.json(P.removerJustificativa(emp(req), req.params.id)));
router.get('/parametros', exigePerfil(...GESTAO), (req, res) => res.json(P.parametros(emp(req))));
// Configurações (Geral/Web/Mobile/Inconsistências)
router.get('/config', exigePerfil(...GESTAO), (req, res) => res.json(P.configs(emp(req))));
router.put('/config/:chave', exigePerfil(...RH_SUP), (req, res) => res.json(P.setConfig(emp(req), req.params.chave, req.body.valor)));
router.put('/parametros/:chave', exigePerfil(...RH_SUP), (req, res) => {
  const r = P.setParam(emp(req), req.params.chave, req.body.valor);
  res.json(r);
});

// colaboradores (para o seletor da escala)
router.get('/colaboradores', exigePerfil(...GESTAO), (req, res) => {
  const db = require('../db/connection');
  const rows = db.prepare(`SELECT id, nome, loja_id FROM colaboradores WHERE empresa_id=? AND ativo=1 ORDER BY nome`).all(emp(req));
  res.json(rows);
});

// funções/cargos para o filtro dos relatórios
router.get('/funcoes', exigePerfil(...GESTAO), (req, res) => {
  const db = require('../db/connection');
  res.json(db.prepare(`SELECT DISTINCT f.id, f.nome FROM funcoes f JOIN colaboradores c ON c.funcao_id=f.id
    WHERE c.empresa_id=? AND c.ativo=1 ORDER BY f.nome`).all(emp(req)));
});
// Relatório consolidado de folha de ponto (por loja/função/período)
router.get('/relatorio/folha', exigePerfil(...GESTAO), (req, res) => {
  res.json(C.relatorioConsolidado(emp(req), { lojaId: req.query.loja, funcaoId: req.query.funcao, ini: req.query.ini, fim: req.query.fim, apurar: req.query.apurar !== '0' }));
});

// Enviar Folha de Ponto por e-mail (usa o SMTP do sistema)
router.post('/relatorio/enviar-email', exigePerfil(...RH_SUP), async (req, res) => {
  const esp = C.espelho(emp(req), req.body?.colaborador, req.body?.ini, req.body?.fim);
  const para = req.body?.para || esp.colaborador?.email;
  if (!para) return res.status(400).json({ erro: 'Colaborador sem e-mail cadastrado — informe um destinatário.' });
  const email = require('../lib/emailInbox');
  const html = F.folhaHtml(esp);
  const r = await email.enviarEmail(para, `Folha de Ponto — ${esp.colaborador?.nome || ''} (${esp.periodo.ini} a ${esp.periodo.fim})`, html);
  if (!r.ok) return res.status(502).json(r);
  res.json(r);
});

// lojas (distintas dos colaboradores) para os seletores
router.get('/lojas', exigePerfil(...GESTAO), (req, res) => {
  const db = require('../db/connection');
  const rows = db.prepare(`SELECT DISTINCT loja_id FROM colaboradores WHERE empresa_id=? AND loja_id IS NOT NULL AND loja_id<>'' ORDER BY loja_id`).all(emp(req));
  res.json(rows.map(r => r.loja_id));
});

// prévia da validação (não grava)
router.post('/escala/validar', exigePerfil(...GESTAO), (req, res) => {
  const r = P.validarPreview(emp(req), req.body || {});
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

// cria a escala (permite; registra exceções para o RH autorizar)
router.post('/escala', exigePerfil(...GESTAO), (req, res) => {
  const r = P.criarEscala(emp(req), req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

router.get('/escalas', exigePerfil(...GESTAO), (req, res) => res.json(P.listarEscalas(emp(req), { status: req.query.status })));
router.get('/escala/:id', exigePerfil(...GESTAO), (req, res) => {
  const d = P.escalaDetalhe(emp(req), req.params.id);
  if (!d) return res.status(404).json({ erro: 'Escala não encontrada.' });
  res.json(d);
});

// autorização do superior do RH (justificativa + ciência)
router.post('/escala/:id/autorizar', exigePerfil(...RH_SUP), (req, res) => {
  const r = P.autorizarEscala(emp(req), req.params.id, req.usuario, req.body?.justificativa);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.post('/escala/:id/publicar', exigePerfil(...GESTAO), (req, res) => {
  const r = P.publicarEscala(emp(req), req.params.id, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

// escala em LOTE (vários colaboradores de uma vez)
router.post('/escala/lote', exigePerfil(...GESTAO), (req, res) => {
  const r = P.criarEscalaLote(emp(req), req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

// config por colaborador (travar hora extra)
router.get('/colaborador/:id/config', exigePerfil(...GESTAO), (req, res) => res.json(P.colaboradorConfig(emp(req), req.params.id)));
router.put('/colaborador/:id/config', exigePerfil(...RH_SUP), (req, res) => res.json(P.setColaboradorConfig(emp(req), req.params.id, req.body || {})));

// regra de ponto por colaborador (versionada por vigência)
router.get('/colaborador/:id/regras', exigePerfil(...GESTAO), (req, res) => res.json(P.regrasColaborador(emp(req), req.params.id)));
router.post('/colaborador/:id/regras', exigePerfil(...RH_SUP), (req, res) => {
  const r = P.trocarRegraColaborador(emp(req), req.params.id, req.body?.modeloId, req.body?.vigenciaIni, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.delete('/colaborador/regras/:regraId', exigePerfil(...RH_SUP), (req, res) => res.json(P.removerRegraColaborador(emp(req), req.params.regraId)));

// feriados (para a falta ser considerada e p/ regra de férias)
router.get('/feriados', exigePerfil(...GESTAO), (req, res) => res.json(P.feriados(emp(req), req.query.loja)));
router.post('/feriados', exigePerfil(...RH_SUP), (req, res) => {
  const r = P.criarFeriado(emp(req), req.body || {});
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.delete('/feriados/:id', exigePerfil(...RH_SUP), (req, res) => res.json(P.removerFeriado(emp(req), req.params.id)));

// necessidade de equipe por loja/turno (base da Escala Inteligente)
router.get('/necessidades', exigePerfil(...GESTAO), (req, res) => res.json(P.necessidades(emp(req), req.query.loja)));
router.post('/necessidades', exigePerfil(...GESTAO), (req, res) => {
  const r = P.criarNecessidade(emp(req), req.body || {});
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.delete('/necessidades/:id', exigePerfil(...GESTAO), (req, res) => res.json(P.removerNecessidade(emp(req), req.params.id)));

// ───────── Fechamento / janela de correção ─────────
router.get('/fechamento/config', exigePerfil(...GESTAO), (req, res) => res.json(P.fechamentoConfig(emp(req))));
router.put('/fechamento/config', exigePerfil(...RH_SUP), (req, res) => res.json(P.setFechamentoConfig(emp(req), req.body || {})));
router.get('/fechamentos', exigePerfil(...GESTAO), (req, res) => res.json(P.listarFechamentos(emp(req))));
router.post('/fechamento/:competencia/fechar', exigePerfil(...RH_SUP), (req, res) => {
  const r = P.fecharCompetencia(emp(req), req.params.competencia, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.post('/fechamento/:competencia/reabrir', exigePerfil(...RH_SUP), (req, res) => res.json(P.reabrirCompetencia(emp(req), req.params.competencia)));

// janela de correção + solicitação do colaborador (qualquer autenticado pede o próprio)
router.get('/correcao/janela', (req, res) => res.json(P.janelaCorrecao(emp(req), req.query.data)));
router.post('/correcao', (req, res) => {
  const r = P.solicitarCorrecao(emp(req), req.usuario, req.body || {});
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
// colaborador vê o PRÓPRIO espelho e as PRÓPRIAS correções (autoservição, sem exigir perfil)
router.get('/meu-espelho', (req, res) => res.json(C.espelho(emp(req), req.usuario.id, req.query.ini, req.query.fim)));
router.get('/minhas-correcoes', (req, res) => {
  const db = require('../db/connection');
  res.json(db.prepare(`SELECT * FROM pontorep_correcao WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em DESC LIMIT 100`).all(emp(req), req.usuario.id));
});

router.get('/correcoes', exigePerfil(...GESTAO), (req, res) => res.json(P.listarCorrecoes(emp(req), { status: req.query.status })));
router.post('/correcao/:id/responder', exigePerfil(...GESTAO), (req, res) => {
  const r = P.responderCorrecao(emp(req), req.params.id, req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

// espelhos (assinatura)
router.get('/espelhos/:competencia', exigePerfil(...GESTAO), (req, res) => res.json(P.listarEspelhos(emp(req), req.params.competencia)));
router.post('/espelhos/:competencia/enviar', exigePerfil(...RH_SUP), (req, res) => res.json(P.enviarEspelhos(emp(req), req.params.competencia)));

// afastamentos
router.get('/afastamentos', exigePerfil(...GESTAO), (req, res) => res.json(P.listarAfastamentos(emp(req), { colaboradorId: req.query.colaborador })));
router.post('/afastamentos', exigePerfil(...RH_SUP), (req, res) => {
  const r = P.lancarAfastamento(emp(req), req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

// painel de acompanhamento
router.get('/acompanhamento', exigePerfil(...GESTAO), (req, res) => res.json(P.acompanhamento(emp(req), { meses: Number(req.query.meses) || 12 })));

// Escala Inteligente
router.get('/inteligente/picos', exigePerfil(...GESTAO), async (req, res) => {
  try { res.json(await P.picosVenda(emp(req), req.query.loja)); } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.post('/inteligente/sugerir', exigePerfil(...GESTAO), async (req, res) => {
  try {
    const r = await P.sugerirEscalaInteligente(emp(req), req.body || {});
    if (r.erro) return res.status(400).json(r);
    res.json(r);
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.post('/inteligente/aplicar', exigePerfil(...GESTAO), (req, res) => {
  const r = P.aplicarSugestao(emp(req), req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

// ───────── Coleta de batidas + apuração ─────────
router.post('/bater', (req, res) => { // qualquer autenticado bate (kiosk usa o próprio colaborador)
  const r = C.baterPonto(emp(req), { colaboradorId: req.body?.colaboradorId || req.usuario.id, ...req.body });
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.get('/batidas', exigePerfil(...GESTAO), (req, res) => res.json(C.batidasDia(emp(req), req.query.colaborador, req.query.data)));
router.post('/apurar', exigePerfil(...GESTAO), (req, res) => {
  const r = C.apurarPeriodo(emp(req), req.body || {});
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.get('/espelho', exigePerfil(...GESTAO), (req, res) => res.json(C.espelho(emp(req), req.query.colaborador, req.query.ini, req.query.fim)));

// Pontos pendentes/suspeitos (falha facial, GPS, fake GPS) — revisão do RH
router.get('/pendentes', exigePerfil(...GESTAO), (req, res) => res.json(C.batidasPendentes(emp(req), { pendentesSo: req.query.todas !== '1' })));
router.post('/pendentes/:id/revisar', exigePerfil(...RH_SUP), (req, res) => {
  const r = C.revisarMarcacao(emp(req), req.params.id, req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

// Banco de horas (FIFO, com vencimento)
router.get('/banco', exigePerfil(...GESTAO), (req, res) => res.json(B.bancoHoras(emp(req), req.query.colaborador)));

// Apropriação de Horas — RH ajusta as correções (camada de tratamento sobre a batida imutável)
router.get('/apropriacao', exigePerfil(...GESTAO), (req, res) => res.json(C.apropriacao(emp(req), req.query.colaborador, req.query.ini, req.query.fim)));
router.post('/apropriacao/tratar', exigePerfil(...RH_SUP), (req, res) => {
  const r = C.salvarTratamento(emp(req), req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.delete('/apropriacao/tratar', exigePerfil(...RH_SUP), (req, res) => res.json(C.removerTratamento(emp(req), req.query.colaborador, req.query.data)));

// ───────── Regras de Ponto (N regras, padrão, colaboradores em lote) ─────────
router.get('/regras', exigePerfil(...GESTAO), (req, res) => res.json(R.listarRegras(emp(req))));
router.get('/regra/:id', exigePerfil(...GESTAO), (req, res) => {
  const r = R.getRegra(emp(req), req.params.id);
  if (!r) return res.status(404).json({ erro: 'Regra não encontrada.' });
  res.json(r);
});
router.post('/regra', exigePerfil(...RH_SUP), (req, res) => {
  const r = R.salvarRegra(emp(req), req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.delete('/regra/:id', exigePerfil(...RH_SUP), (req, res) => {
  const r = R.removerRegra(emp(req), req.params.id);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.post('/regra/:id/padrao', exigePerfil(...RH_SUP), (req, res) => res.json(R.setPadrao(emp(req), req.params.id)));
router.get('/regra/:id/colaboradores', exigePerfil(...GESTAO), (req, res) => res.json(R.colaboradoresDaRegra(emp(req), req.params.id)));
router.post('/regra/:id/colaboradores', exigePerfil(...RH_SUP), (req, res) => {
  const r = R.adicionarColaboradores(emp(req), req.params.id, req.body || {});
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.delete('/regra/colaborador/:linkId', exigePerfil(...RH_SUP), (req, res) => res.json(R.removerColaboradorRegra(emp(req), req.params.linkId)));

// Arquivos fiscais (AFD/AEJ)
router.get('/fiscal/afd', exigePerfil(...GESTAO), (req, res) => {
  const r = F.gerarAFD(emp(req), { lojaId: req.query.loja, ini: req.query.ini, fim: req.query.fim });
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.get('/fiscal/aej', exigePerfil(...GESTAO), (req, res) => {
  const r = F.gerarAEJ(emp(req), { lojaId: req.query.loja, ini: req.query.ini, fim: req.query.fim });
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

// Férias (regras CLT)
router.post('/ferias/validar', exigePerfil(...GESTAO), (req, res) => res.json({ alertas: P.validarFerias(emp(req), req.body || {}) }));
router.post('/ferias', exigePerfil(...GESTAO), (req, res) => {
  const r = P.solicitarFerias(emp(req), req.body || {}, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});
router.get('/ferias', exigePerfil(...GESTAO), (req, res) => res.json(P.listarFerias(emp(req))));
router.post('/ferias/:id/decidir', exigePerfil(...RH_SUP), (req, res) => {
  const r = P.decidirFerias(emp(req), req.params.id, req.body?.status, req.usuario);
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

module.exports = router;
