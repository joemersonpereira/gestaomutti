const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { getRegra, premiacaoPorPct } = require('../lib/premiacao');
const { scorePorOcorrencias, scoreAtendimento } = require('../lib/ocorrencias');
const { auth, exigePerfil, exigePerfilOuLideranca } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const calc = require('../lib/calculosVendas');
const recebimentoErp = require('../lib/recebimentoErp');
const indErp = require('../lib/indicadoresErp');
const cuidadoFarmac = require('../lib/cuidadoFarmac');

router.use(auth);

const FUNCOES_AVALIADAS = ['func-farmaceutico', 'func-estagiario', 'func-conferente'];
// Indicadores do conferente que agora são 100% automáticos (ERP + checklist do gerente + devoluções).
const AUTO_CONFERENTE = ['erros_entrada', 'recebimento', 'org_estoque', 'devolucoes'];

// Overrides automáticos do conferente. Só entram quando NÃO há avaliação manual do
// indicador — assim o lançamento manual do chefe do setor continua valendo como override.
// Retorna { overrides: {ind: 0..1}, auto: {ind: 0..100} }.
async function overridesConferente(colab, cfg, mapa, mes, ano) {
  const overrides = {}, auto = {};
  const usaConf = cfg.some(x => AUTO_CONFERENTE.includes(x.indicador));
  if (!usaConf) return { overrides, auto };
  for (const ind of AUTO_CONFERENTE) {
    if (!cfg.some(x => x.indicador === ind)) continue;
    let nota = null;
    try { nota = await recebimentoErp.conferenteNota(colab.id, ind, mes, ano); } catch { nota = null; }
    if (nota == null) continue;
    auto[ind] = nota;
    if (!mapa[ind]) overrides[ind] = nota / 100; // manual (se houver) vence
  }
  return { overrides, auto };
}

// Nota do conferente RENORMALIZADA: critério sem dado (org_estoque não preenchido pelo
// gerente, ou sem devoluções no mês) é tratado como N/P e SAI do denominador — não pode
// penalizar o conferente. Nota = Σ(peso×ratio dos presentes) ÷ Σ(peso dos presentes) × 100.
function notaConferente(mapa, cfg, overrides = {}) {
  let soma = 0, pesoPresente = 0;
  for (const c of cfg) {
    let ratio = null;
    if (Object.prototype.hasOwnProperty.call(overrides, c.indicador)) ratio = overrides[c.indicador];
    else if (mapa[c.indicador] && mapa[c.indicador] !== 'np') ratio = calc.ESCALA[mapa[c.indicador]] ?? 0;
    if (ratio == null) continue;
    soma += c.peso * ratio; pesoPresente += c.peso;
  }
  return pesoPresente ? Math.round((soma / pesoPresente) * 100) : null;
}

// Tarefas em aberto de um colaborador (para mostrar no ranking, igual ao painel do gerente).
function tarefasPendentes(empresaId, colabId) {
  const rows = db.prepare(`SELECT titulo, status, prazo FROM tarefas
    WHERE empresa_id=? AND responsavel_id=? AND status!='concluido' ORDER BY prazo IS NULL, prazo ASC`).all(empresaId, colabId);
  const agora = new Date();
  const atrasadas = rows.filter(t => t.status === 'atrasado' || (t.prazo && new Date(t.prazo) < agora)).length;
  return { tarefas_abertas: rows.length, tarefas_atrasadas: atrasadas, tarefas_titulos: rows.slice(0, 4).map(t => t.titulo) };
}

// Integração Estágio ⇄ checklist do gerente: a avaliação mensal que o gerente/supervisor já
// faz do estagiário (função func-estagiario) ALIMENTA a estagio_avaliacao da ficha — que é o
// que calcula o índice de aprovação usado na renovação. Assim há UMA avaliação por mês (a do
// checklist), sem formulário duplicado. Requer a ficha vinculada ao colaborador (unificação).
// id = ficha+'__'+competencia (YYYY-MM) → mesmo esquema da aba Avaliações, 1 linha por mês.
function feedEstagioAvaliacao(empresaId, colab, nota, mes, ano, lancadoPorId) {
  if (nota == null) return false;
  let ficha = db.prepare(`SELECT id FROM estagio_ficha WHERE colaborador_id=? AND empresa_id=? AND status='ativo' LIMIT 1`).get(colab.id, empresaId);
  if (!ficha) ficha = db.prepare(`SELECT id FROM estagio_ficha WHERE colaborador_id=? AND empresa_id=? LIMIT 1`).get(colab.id, empresaId);
  if (!ficha) return false;
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  const sup = db.prepare(`SELECT nome FROM colaboradores WHERE id=?`).get(lancadoPorId);
  db.prepare(`INSERT INTO estagio_avaliacao (id,empresa_id,ficha_id,competencia,nota,supervisor,comentario,criado_em)
    VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,ficha_id,competencia) DO UPDATE SET nota=excluded.nota, supervisor=excluded.supervisor, comentario=excluded.comentario`)
    .run(ficha.id + '__' + competencia, empresaId, ficha.id, competencia, nota, (sup && sup.nome) || 'Gerente', 'Avaliação do checklist do gerente');
  return true;
}

// Abre 1 tarefa de CIÊNCIA por conferente/mês para o chefe do setor (Suporte, senão Gerente):
// mesmo automatizada, a avaliação do conferente precisa ser vista/validada pelo responsável.
function garantirCienciaConferente(empresaId, colab, nota, mes, ano) {
  const ref = `ciencia-conf:${colab.id}:${ano}-${String(mes).padStart(2, '0')}`;
  const existe = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='avaliacao_conferente' AND referencia_id=?`).get(empresaId, ref);
  if (existe) return;
  // Destinatário: Suporte da loja → Gerente da loja → (rede) Supervisor → Gestor → Diretor.
  // Assim, mesmo lojas sem chefia local (ex.: Ultra/Entre Rios 2) têm quem receba a ciência.
  const naLoja = f => db.prepare(`SELECT id, loja_id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id=? AND ativo=1 LIMIT 1`).get(empresaId, colab.loja_id, f);
  const naRede = f => db.prepare(`SELECT id, loja_id FROM colaboradores WHERE empresa_id=? AND funcao_id=? AND ativo=1 ORDER BY nome LIMIT 1`).get(empresaId, f);
  const chefe = naLoja('func-suporte') || naLoja('func-gerente')
    || naRede('func-supervisor') || naRede('func-gestor') || naRede('func-diretor');
  if (!chefe) return;
  gerarTarefa({
    empresa_id: empresaId, loja_id: colab.loja_id, tipo: 'tarefa', origem: 'avaliacao_conferente', referencia_id: ref,
    titulo: `Ciência — avaliação de ${colab.nome} (${mes}/${ano})`,
    descricao: `O checklist do conferente ${colab.nome} foi apurado automaticamente (nota ${nota}). Confira os 4 critérios (erros de entrada, recepção de transporte, organização do estoque e devoluções) e ajuste manualmente apenas se necessário.`,
    responsavel_id: chefe.id, urgente: 0, sla_horas: 120, criado_por: null,
  });
}

function pesos(empresaId, funcaoId) {
  return db.prepare(`SELECT indicador, label, peso, ordem FROM config_indicadores WHERE empresa_id = ? AND funcao_id = ? AND ativo = 1 ORDER BY ordem`)
    .all(empresaId, funcaoId);
}

// Limiar de tarefa por função (abaixo disso, gera tarefa de desenvolvimento)
const LIMIAR_TAREFA = { 'func-conferente': 75 };
// Faixa de premiação por nota (R$) — ajustável
function premiacaoPorNota(nota) {
  if (nota >= 95) return 50;
  if (nota >= 85) return 30;
  if (nota >= 75) return 15;
  return 0;
}

// GET /avaliacoes/ranking/:funcaoId?mes=&ano= — leaderboard de uma função
router.get('/ranking/:funcaoId', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const funcaoId = req.params.funcaoId;
  const cfg = pesos(req.usuario.empresa_id, funcaoId);
  const regraPrem = getRegra(req.usuario.empresa_id, funcaoId);

  // Conferente é MARCAÇÃO no cadastro (flag), não a função — a maioria também é vendedor.
  // Para os demais rankings, filtra pela função normalmente.
  const colabs = funcaoId === 'func-conferente'
    ? db.prepare(`SELECT c.id, c.nome, c.loja_id, l.nome as loja FROM colaboradores c JOIN lojas l ON l.id = c.loja_id
        WHERE c.empresa_id = ? AND c.conferente = 1 AND c.ativo = 1 ORDER BY c.nome`).all(req.usuario.empresa_id)
    : db.prepare(`SELECT c.id, c.nome, c.loja_id, l.nome as loja FROM colaboradores c JOIN lojas l ON l.id = c.loja_id
        WHERE c.empresa_id = ? AND c.funcao_id = ? AND c.ativo = 1`).all(req.usuario.empresa_id, funcaoId);

  const ranking = await Promise.all(colabs.map(async c => {
    const rows = db.prepare(`SELECT indicador, avaliacao FROM avaliacoes_funcao WHERE colaborador_id = ? AND mes = ? AND ano = ?`).all(c.id, mes, ano);
    const mapa = {}; rows.forEach(r => mapa[r.indicador] = r.avaliacao);
    // Valores automáticos: atendimento (média das avaliações de tarefa) e conduta (ocorrências)
    const overrides = {};
    if (cfg.some(x => x.indicador === 'atendimento')) {
      const at = scoreAtendimento(req.usuario.empresa_id, c.id, mes, ano);
      if (at != null) overrides.atendimento = at / 100;
    }
    if (cfg.some(x => x.indicador === 'conduta')) overrides.conduta = scorePorOcorrencias(req.usuario.empresa_id, c.id, 'conduta', mes, ano) / 100;
    // Conferente: 4 critérios automáticos (ERP + checklist do gerente + devoluções)
    const { overrides: ovConf, auto } = await overridesConferente(c, cfg, mapa, mes, ano);
    Object.assign(overrides, ovConf);
    // Cuidado Farmacêutico: nº de atendimentos do mês vs meta (automático do módulo)
    if (cfg.some(x => x.indicador === 'cuidado_farmac')) {
      const cf = cuidadoFarmac.notaCuidado(req.usuario.empresa_id, c.id, mes, ano);
      if (cf) { auto.cuidado_farmac = cf.nota; if (!mapa.cuidado_farmac) overrides.cuidado_farmac = cf.nota / 100; }
    }
    const avaliado = rows.length > 0 || Object.keys(ovConf).length > 0;
    const temAuto = Object.keys(overrides).length > 0;
    const ehConf = funcaoId === 'func-conferente';
    const nota = (avaliado || temAuto) ? (ehConf ? notaConferente(mapa, cfg, overrides) : calc.calcNotaIndicadores(mapa, cfg, overrides)) : null;
    // Ciência ao chefe do setor quando a nota do conferente é apurada automaticamente
    if (funcaoId === 'func-conferente' && Object.keys(ovConf).length > 0 && nota != null) {
      try { garantirCienciaConferente(req.usuario.empresa_id, c, nota, mes, ano); } catch { /* ignora */ }
    }
    // Indicadores detalhados (para expandir no ranking): % efetivo por critério
    const indicadores = cfg.map(x => {
      const manual = mapa[x.indicador] || null;
      const a = auto[x.indicador];
      const pct = manual ? Math.round((calc.ESCALA[manual] ?? 0) * 100) : (a != null ? a : null);
      return { indicador: x.indicador, label: x.label, peso: x.peso, avaliacao: manual, auto: a != null ? a : null, automatico: AUTO_CONFERENTE.includes(x.indicador) || x.indicador === 'cuidado_farmac', pct };
    });
    const tk = tarefasPendentes(req.usuario.empresa_id, c.id);
    const premiacaoChecklist = nota != null ? premiacaoPorPct(nota, regraPrem) : 0;
    // Comissão sobre as vendas do próprio conferente (atendimento), escalonada pela nota.
    let comissao_itens_pct = 0, comissao_itens_base = 0, comissao_itens_valor = 0;
    if (funcaoId === 'func-conferente' && nota != null) {
      comissao_itens_pct = calc.premiacaoConferenteItensPct(nota);
      if (comissao_itens_pct > 0) {
        try {
          const base = await indErp.premiacaoBaseVendedor(c.id, mes, ano);
          comissao_itens_base = base.premiacao_liquido || 0;
          comissao_itens_valor = Math.round(comissao_itens_base * comissao_itens_pct) / 100;
        } catch { /* ERP indisponível */ }
      }
    }
    return {
      colaborador_id: c.id, nome: c.nome, loja: c.loja, avaliado, nota,
      premiacao: premiacaoChecklist,
      comissao_itens_pct, comissao_itens_base, comissao_itens_valor,
      premiacao_total: Math.round((premiacaoChecklist + comissao_itens_valor) * 100) / 100,
      indicadores, ...tk,
    };
  }));
  ranking.sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));
  res.json({ mes, ano, funcao: funcaoId, criterios: cfg, regra: regraPrem, ranking });
});

// GET /avaliacoes/:colaboradorId?mes=&ano=
router.get('/:colaboradorId', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const colab = db.prepare(`SELECT c.*, f.id as fid FROM colaboradores c JOIN funcoes f ON f.id = c.funcao_id WHERE c.id = ? AND c.empresa_id = ?`)
    .get(req.params.colaboradorId, req.usuario.empresa_id);
  if (!colab) return res.status(404).json({ erro: 'Colaborador não encontrado.' });

  // Permissão: o próprio, ou gestão
  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  if (!ehGestao && req.params.colaboradorId !== req.usuario.id) return res.status(403).json({ erro: 'Sem permissão.' });

  // Permite avaliar pelo PAPEL do dia (ex.: avaliar alguém como farmacêutico mesmo não sendo a função cadastrada)
  const funcaoAval = (req.query.funcao && FUNCOES_AVALIADAS.includes(req.query.funcao)) ? req.query.funcao : colab.funcao_id;
  const cfg = pesos(req.usuario.empresa_id, funcaoAval);
  const rows = db.prepare(`SELECT indicador, avaliacao FROM avaliacoes_funcao WHERE colaborador_id = ? AND mes = ? AND ano = ?`)
    .all(req.params.colaboradorId, mes, ano);
  const mapa = {}; rows.forEach(r => mapa[r.indicador] = r.avaliacao);

  // Conferente: critérios automáticos (o chefe do setor só ajusta manualmente se quiser)
  const { overrides, auto } = await overridesConferente(colab, cfg, mapa, mes, ano);
  // Cuidado Farmacêutico: atendimentos do mês vs meta (automático do módulo)
  if (cfg.some(x => x.indicador === 'cuidado_farmac')) {
    const cf = cuidadoFarmac.notaCuidado(req.usuario.empresa_id, colab.id, mes, ano);
    if (cf) { auto.cuidado_farmac = cf.nota; if (!mapa.cuidado_farmac) overrides.cuidado_farmac = cf.nota / 100; }
  }

  res.json({
    mes, ano, funcao: funcaoAval,
    indicadores: cfg.map(c => ({
      indicador: c.indicador, label: c.label, peso: c.peso,
      avaliacao: mapa[c.indicador] || null,
      auto: auto[c.indicador] != null ? auto[c.indicador] : null, // % apurado automaticamente (0–100)
      automatico: AUTO_CONFERENTE.includes(c.indicador) || c.indicador === 'cuidado_farmac',
    })),
    nota: funcaoAval === 'func-conferente' ? notaConferente(mapa, cfg, overrides) : calc.calcNotaIndicadores(mapa, cfg, overrides),
  });
});

// POST /avaliacoes/:colaboradorId — gestão avalia
// body: { mes, ano, avaliacoes: { indicador: 'bom'|'regular'|'ruim' } }
router.post('/:colaboradorId', exigePerfilOuLideranca('Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  const { avaliacoes = {} } = req.body;

  const colab = db.prepare(`SELECT * FROM colaboradores WHERE id = ? AND empresa_id = ?`).get(req.params.colaboradorId, req.usuario.empresa_id);
  if (!colab) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const funcaoAval = (req.body.funcao && FUNCOES_AVALIADAS.includes(req.body.funcao)) ? req.body.funcao : colab.funcao_id;
  if (!FUNCOES_AVALIADAS.includes(funcaoAval)) return res.status(400).json({ erro: 'Função não possui este tipo de avaliação.' });

  const cfg = pesos(req.usuario.empresa_id, funcaoAval);
  const validas = new Set(cfg.map(c => c.indicador));
  const upsert = db.prepare(`
    INSERT INTO avaliacoes_funcao (id,empresa_id,loja_id,colaborador_id,funcao_id,mes,ano,indicador,avaliacao,lancado_por_id,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(colaborador_id, mes, ano, indicador)
    DO UPDATE SET avaliacao = excluded.avaliacao, lancado_por_id = excluded.lancado_por_id, atualizado_em = datetime('now')
  `);
  for (const [ind, av] of Object.entries(avaliacoes)) {
    if (!validas.has(ind) || !['bom', 'regular', 'ruim', 'np'].includes(av)) continue;
    upsert.run(uuidv4(), req.usuario.empresa_id, colab.loja_id, colab.id, colab.funcao_id, mes, ano, ind, av, req.usuario.id);
  }

  const rows = db.prepare(`SELECT indicador, avaliacao FROM avaliacoes_funcao WHERE colaborador_id = ? AND mes = ? AND ano = ?`).all(colab.id, mes, ano);
  const mapa = {}; rows.forEach(r => mapa[r.indicador] = r.avaliacao);
  // Conferente: nota inclui os critérios automáticos e é renormalizada (N/P fora do denominador).
  let nota;
  if (funcaoAval === 'func-conferente') {
    const { overrides } = await overridesConferente(colab, cfg, mapa, mes, ano);
    nota = notaConferente(mapa, cfg, overrides);
  } else {
    nota = calc.calcNotaIndicadores(mapa, cfg);
  }

  // Regra: nota baixa gera tarefa de desenvolvimento ao gerente (limiar por função)
  const limiar = LIMIAR_TAREFA[colab.funcao_id] || 90;
  let tarefa_gerada = false;
  if (nota != null && nota < limiar) {
    const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND loja_id = ? AND funcao_id = 'func-gerente' AND ativo = 1 LIMIT 1`)
      .get(req.usuario.empresa_id, colab.loja_id);
    if (gerente) {
      gerarTarefa({
        empresa_id: req.usuario.empresa_id, loja_id: colab.loja_id, tipo: 'tarefa', origem: 'avaliacao',
        titulo: `Desenvolvimento — ${colab.nome} (nota ${nota})`,
        descricao: `Avaliação da função abaixo de ${limiar}pts. Planejar desenvolvimento.`,
        responsavel_id: gerente.id, urgente: 0, sla_horas: 120, criado_por: req.usuario.id,
      });
      tarefa_gerada = true;
    }
  }

  // Conquista automática ao atingir nota de excelência (>=95)
  let conquista = false;
  if (nota >= 95) {
    db.prepare(`INSERT INTO certificados (id,empresa_id,colaborador_id,tipo,titulo,descricao,emitido_por,pontos,validado,criado_em)
                VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))`)
      .run(uuidv4(), req.usuario.empresa_id, colab.id, 'conquista', 'Excelência na função', `Nota ${nota} na avaliação ${mes}/${ano}.`, req.usuario.id, 10);
    conquista = true;
  }

  // Estágio: se este colaborador tem ficha de estágio, a nota do checklist vira a avaliação
  // mensal do estagiário (alimenta o índice de aprovação / renovação).
  let estagio_alimentado = false;
  try { estagio_alimentado = feedEstagioAvaliacao(req.usuario.empresa_id, colab, nota, mes, ano, req.usuario.id); } catch { /* módulo estágio ausente */ }

  res.json({ mensagem: 'Avaliação salva.', nota, premiacao: premiacaoPorNota(nota), tarefa_gerada, conquista, estagio_alimentado });
});

module.exports = router;
