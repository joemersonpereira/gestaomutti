const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { getPilares, premioGerente, notaPilar, notaGeral } = require('../lib/pilares');
const calc = require('../lib/calculosVendas');
const opLib = require('../lib/operacional');
const vendasErp = require('../lib/vendasErp');
const indErp = require('../lib/indicadoresErp');
const fv = require('../lib/fotoVendedor');
const trivioPdv = require('../lib/trivioPdv');
const encomendasSync = require('../lib/encomendasSync');

// Setores da gestão = departamentos. `funcoes` = quem "é dono" do setor (vê o Meu Setor).
// expPad = expectativas padrão (a direção edita em setor_config). Compartilhado por /diretoria e /meu-setor.
const SETORES_BASE = [
  { key: 'operacional', nome: 'Operacional', emoji: '🏪', donoPad: 'Gerentes / Supervisão', funcoes: ['Gerente', 'Subgerente', 'Supervisor'], expPad: [
    'Nota de loja ≥ 90 (checklist diário, limpeza e satisfação em dia)',
    'Ruptura ≤ 4% e reposição feita todo dia',
    'Todos os vendedores acompanhados; quem está abaixo da meta tem plano de ação',
    'Escala publicada e faltas/atrasos tratados na hora',
  ] },
  { key: 'comercial', nome: 'Comercial', emoji: '🛒', donoPad: 'Compradores', funcoes: ['Comprador Beleza', 'Comprador Bem-estar'], expPad: [
    'CMV dentro da meta e cobertura de estoque entre 45 e 60 dias',
    'Ruptura ≤ 4% nos grupos sob sua responsabilidade',
    'Acordos e trade fechados, com sell-out acompanhado',
    'Lista de faltas das lojas comprada em até 48h',
  ] },
  { key: 'marketing', nome: 'Marketing', emoji: '📣', donoPad: 'Marketing', funcoes: ['Marketing'], expPad: [
    '≥ 80% das ações do calendário executadas no prazo',
    'Calendário do mês publicado até o dia 25 do mês anterior',
    'Verba dentro do orçamento e ROI das campanhas medido',
    'Material de loja (etiquetas/placas) e redes sociais alinhados',
  ] },
  { key: 'gente', nome: 'Gente & Gestão', emoji: '👥', donoPad: 'RH', funcoes: ['RH'], expPad: [
    'Turnover e absenteísmo dentro da meta',
    'eNPS acompanhado e pesquisa de clima respondida',
    'Ponto: 100% vinculados e pendências tratadas no prazo',
    'Admissões, desligamentos e documentos (holerite) em dia',
  ] },
  { key: 'administrativo', nome: 'Administrativo', emoji: '🏛️', donoPad: 'Controladoria', funcoes: ['Controladoria', 'Financeiro', 'Tesouraria'], expPad: [
    'DRE fechada e checklist de fechamento validado no prazo',
    'Inadimplência/aging em queda e conciliação em dia',
    'Orçado × realizado revisado, com desvios justificados',
    'Quebras de caixa conferidas e cobradas',
  ] },
  { key: 'logistica', nome: 'Logística & Suporte', emoji: '📦', donoPad: 'Suporte', funcoes: ['Suporte'], expPad: [
    'Recebimento/conferência sem divergência e devoluções tratadas',
    'Tempo de atendimento online/entrega dentro da meta',
    'Almoxarifado: estoque e custos por loja sob controle',
    'Chamados de suporte resolvidos dentro do prazo',
  ] },
];

// Nota (0–100) de um indicador alimentado por checklist (% de itens feitos no período)
function checklistIndicadorNota(empresaId, lojaId, indicadorAlvo) {
  const hoje = new Date().toISOString().slice(0, 10);
  // itens via seção ligada ao indicador OU via checklist inteiro ligado ao indicador
  const itens = db.prepare(`
    SELECT i.id, i.periodicidade FROM operacional_itens i
    LEFT JOIN checklist_secao s ON s.id = i.secao_id
    LEFT JOIN checklist_def d ON d.id = i.checklist_id
    WHERE i.empresa_id=? AND i.ativo=1 AND (i.loja_id IS NULL OR i.loja_id=?)
      AND ( s.indicador_alvo=? OR (d.modo='inteiro' AND d.indicador_alvo=?) )
  `).all(empresaId, lojaId, indicadorAlvo, indicadorAlvo);
  if (!itens.length) return null;
  let feito = 0;
  itens.forEach(it => {
    const ref = opLib.periodoRef(it.periodicidade, hoje);
    const e = db.prepare('SELECT status FROM operacional_exec WHERE empresa_id=? AND item_id=? AND loja_id=? AND periodo_ref=?').get(empresaId, it.id, lojaId, ref);
    if (e && e.status === 'feito') feito++;
  });
  return Math.round((feito / itens.length) * 100);
}

router.use(auth);

const ESC = { bom: 100, regular: 50, ruim: 0 };

// Média (0–100) de um indicador de vendedor na loja/período
function avgVendedorInd(empresaId, lojaId, mes, ano, indicador) {
  const rows = db.prepare(`SELECT avaliacao FROM indicadores_vendedor WHERE empresa_id=? AND loja_id=? AND mes=? AND ano=? AND indicador=?`)
    .all(empresaId, lojaId, mes, ano, indicador);
  if (!rows.length) return null;
  return Math.round(rows.reduce((a, r) => a + (ESC[r.avaliacao] ?? 0), 0) / rows.length);
}

function avgFuncao(empresaId, lojaId, mes, ano, funcaoId) {
  const cfg = db.prepare(`SELECT indicador, peso FROM config_indicadores WHERE empresa_id=? AND funcao_id=? AND ativo=1`).all(empresaId, funcaoId);
  if (!cfg.length) return null;
  const colabs = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id=? AND ativo=1`).all(empresaId, lojaId, funcaoId);
  if (!colabs.length) return null;
  const notas = [];
  for (const c of colabs) {
    const rows = db.prepare(`SELECT indicador, avaliacao FROM avaliacoes_funcao WHERE colaborador_id=? AND mes=? AND ano=?`).all(c.id, mes, ano);
    if (!rows.length) continue;
    const mapa = {}; rows.forEach(r => mapa[r.indicador] = r.avaliacao);
    notas.push(calc.calcNotaIndicadores(mapa, cfg.map(x => ({ indicador: x.indicador, peso: x.peso }))));
  }
  if (!notas.length) return null;
  return Math.round(notas.reduce((a, n) => a + n, 0) / notas.length);
}

function notaVendas(empresaId, lojaId, mes, ano) {
  const meta = db.prepare(`SELECT valor_meta FROM metas WHERE empresa_id=? AND loja_id=? AND colaborador_id IS NULL AND mes=? AND ano=? ORDER BY criado_em DESC LIMIT 1`).get(empresaId, lojaId, mes, ano);
  if (!meta || !meta.valor_meta) return null;
  // Vendas AO VIVO do ERP (cache pré-aquecido pela rota); fallback: tabela local.
  const v = vendasErp.totalLojaMesSync(lojaId, mes, ano);
  return Math.min(100, calc.pct(v, meta.valor_meta));
}

function campanhasPct(empresaId, lojaId, campo, tipo) {
  let q = `SELECT cl.ciencia_em, cl.comprovante_status FROM campanhas_lojas cl JOIN campanhas c ON c.id=cl.campanha_id WHERE c.empresa_id=? AND cl.loja_id=?`;
  const params = [empresaId, lojaId];
  if (tipo) { q += ' AND c.tipo=?'; params.push(tipo); }
  const rows = db.prepare(q).all(...params);
  if (!rows.length) return null;
  const ok = rows.filter(r => campo === 'ciencia' ? r.ciencia_em : r.comprovante_status === 'validado').length;
  return Math.round((ok / rows.length) * 100);
}

function auditoriaNota(empresaId, lojaId, mes, ano) {
  const r = db.prepare(`SELECT AVG(nota) m FROM auditorias WHERE empresa_id=? AND loja_id=? AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?`).get(empresaId, lojaId, mes, ano);
  return r.m != null ? Math.round(r.m) : null;
}

function checklistMedia(empresaId, lojaId, mes, ano, periodos) {
  const ph = periodos.map(() => '?').join(',');
  const r = db.prepare(`SELECT AVG(nota) m FROM checklist_execucoes WHERE empresa_id=? AND loja_id=? AND periodo IN (${ph}) AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?`)
    .get(empresaId, lojaId, ...periodos, mes, ano);
  return r.m != null ? Math.round(r.m) : null;
}

// Média das execuções de checklists de uma categoria específica (ex.: 'limpeza'),
// lendo só os modelos marcados com aquela categoria.
function checklistMediaCategoria(empresaId, lojaId, mes, ano, categoria) {
  const r = db.prepare(`SELECT AVG(e.nota) m FROM checklist_execucoes e JOIN checklist_modelos m ON m.id=e.modelo_id
    WHERE e.empresa_id=? AND e.loja_id=? AND m.categoria=? AND CAST(strftime('%m',e.data) AS INTEGER)=? AND CAST(strftime('%Y',e.data) AS INTEGER)=?`)
    .get(empresaId, lojaId, categoria, mes, ano);
  return r.m != null ? Math.round(r.m) : null;
}

// Disciplina operacional: faltas de reposição. Colaborador com 3+ faltas no mês derruba o indicador.
function notaDisciplina(empresaId, lojaId, mes, ano) {
  const faltas = db.prepare(`SELECT colaborador_id, COUNT(*) n FROM reposicao_dia
    WHERE empresa_id=? AND loja_id=? AND fez=0 AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?
    GROUP BY colaborador_id`).all(empresaId, lojaId, mes, ano);
  if (!faltas.length) return null; // sem registro ainda → não impacta
  const max = Math.max(...faltas.map(f => f.n));
  if (max >= 3) return 0;   // 3+ faltas → disciplina comprometida (gerente cai p/ 3%)
  if (max === 2) return 50;
  return 100;
}

// Regra dos 90%: se ≥90% dos vendedores com meta a atingiram, positiva o indicador do gerente.
function notaMetaEquipe(empresaId, lojaId, mes, ano) {
  const metas = db.prepare(`SELECT atingida FROM metas WHERE empresa_id=? AND loja_id=? AND colaborador_id IS NOT NULL AND mes=? AND ano=?`).all(empresaId, lojaId, mes, ano);
  if (!metas.length) return null;
  const pct = Math.round(metas.filter(m => m.atingida).length / metas.length * 100);
  return pct >= 90 ? 100 : pct;
}

// Indicador "Caixa": média das notas das diferenças diárias (perto de zero = melhor).
function notaCaixa(empresaId, lojaId, mes, ano) {
  const rows = db.prepare(`SELECT diferenca, justif_status FROM lancamentos_caixa WHERE empresa_id=? AND loja_id=? AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?`)
    .all(empresaId, lojaId, mes, ano);
  if (!rows.length) return null;
  const nota = d => { const v = Math.abs(d || 0); return v === 0 ? 100 : v <= 5 ? 90 : v <= 20 ? 70 : v <= 50 ? 40 : 0; };
  // Justificativa ACEITA pela Tesouraria neutraliza a diferença daquele dia (foi justificada)
  return Math.round(rows.reduce((a, r) => a + (r.justif_status === 'aceita' ? 100 : nota(r.diferenca)), 0) / rows.length);
}

function tarefasNoPrazo(empresaId, lojaId) {
  const r = db.prepare(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN status='concluido' AND (prazo IS NULL OR concluido_em<=prazo) THEN 1 ELSE 0 END) ok
    FROM tarefas WHERE empresa_id=? AND loja_id=? AND tipo='tarefa'
  `).get(empresaId, lojaId);
  if (!r.total) return null;
  return Math.round((r.ok / r.total) * 100);
}

function ocorrenciasZeradas(empresaId, lojaId) {
  const colabs = db.prepare(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND loja_id=? AND ativo=1`).get(empresaId, lojaId).n;
  if (!colabs) return null;
  const comOcorr = db.prepare(`SELECT COUNT(DISTINCT o.colaborador_id) n FROM ocorrencias o JOIN colaboradores c ON c.id=o.colaborador_id WHERE c.loja_id=? AND o.status IN ('pendente','contestado','mantido')`).get(lojaId).n;
  return Math.round(((colabs - comOcorr) / colabs) * 100);
}

function encomendasNota(empresaId, lojaId) {
  const pend = db.prepare(`SELECT COUNT(*) n FROM tarefas WHERE empresa_id=? AND loja_id=? AND origem='encomenda' AND status!='concluido'`).get(empresaId, lojaId).n;
  return pend < 5 ? 100 : Math.max(0, 100 - (pend - 4) * 15);
}

// Calcula uma loja: retorna pilares com nota por indicador (live/estimado)
// Média das avaliações administrativas (chefe do setor) de uma função na loja, no mês.
// bom=100, regular=50, ruim=0. Retorna null se não houver avaliação concluída.
function avgAdminEval(empresaId, lojaId, mes, ano, funcaoId) {
  const rows = db.prepare(`SELECT nota, nota_pct FROM avaliacao_admin
    WHERE empresa_id=? AND loja_id=? AND funcao_id=? AND status='avaliada'
      AND (nota_pct IS NOT NULL OR nota IS NOT NULL)
      AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?`)
    .all(empresaId, lojaId, funcaoId, mes, ano);
  if (!rows.length) return null;
  const mapa = { bom: 100, regular: 50, ruim: 0 };
  const vals = rows.map(r => r.nota_pct != null ? r.nota_pct : (mapa[r.nota] ?? null)).filter(v => v != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, v) => a + v, 0) / vals.length);
}

// Nota (0–100) da pesquisa de satisfação da loja no mês (média das estrelas ÷ 5 × 100).
function satisfacaoNota(lojaId, mes, ano) {
  const mm = String(mes).padStart(2, '0');
  const r = db.prepare(`SELECT AVG(nota) m, COUNT(*) n FROM satisfacao_avaliacoes
    WHERE loja_id=? AND strftime('%m',criado_em)=? AND strftime('%Y',criado_em)=?`).get(lojaId, mm, String(ano));
  return r && r.n ? Math.round((r.m / 5) * 100) : null;
}

// Vitaminas e PBM de LOJA a partir do ERP (média real dos vendedores), no lugar da
// tabela manual antiga. PBM = média da aderência % dos vendedores; Vitaminas = média da
// nota (unidades ÷ meta do vendedor). null quando o ERP ainda não tem dado (mantém fallback).
function vitPbmLojaErp(empresaId, lojaId, mes, ano) {
  const vends = db.prepare(`SELECT id FROM colaboradores WHERE loja_id=? AND funcao_id='func-vendedor' AND ativo=1`).all(lojaId);
  const metaVit = fv.metaColaboradorInd(empresaId, lojaId, 'vitaminas', mes, ano);
  const pbms = [], vitNotas = [];
  for (const v of vends) {
    const pbm = indErp.indicadorVendedorSync(lojaId, mes, ano, v.id, 'pbm');
    if (pbm != null) pbms.push(Number(pbm));
    const vit = indErp.indicadorVendedorSync(lojaId, mes, ano, v.id, 'vitaminas');
    if (vit != null) { const nota = calc.notaIndicador('vitaminas', Number(vit), metaVit); if (nota != null) vitNotas.push(nota); }
  }
  const med = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  return { pbm: med(pbms), vitaminas: med(vitNotas) };
}

function calcularGerente(empresaId, lojaId, mes, ano) {
  const live = {
    nps: satisfacaoNota(lojaId, mes, ano),
    meta_vendas: notaVendas(empresaId, lojaId, mes, ano),
    vitaminas: avgVendedorInd(empresaId, lojaId, mes, ano, 'vitaminas'),
    pbm: avgVendedorInd(empresaId, lojaId, mes, ano, 'pbm'),
    generico: avgVendedorInd(empresaId, lojaId, mes, ano, 'generico'),
    campanhas_cumpridas: campanhasPct(empresaId, lojaId, 'comprovante', 'campanha'),
    encomendas: encomendasNota(empresaId, lojaId),
    auditoria: auditoriaNota(empresaId, lojaId, mes, ano),
    checklist: checklistMedia(empresaId, lojaId, mes, ano, ['checkin', 'checkout']),
    tarefas_prazo: tarefasNoPrazo(empresaId, lojaId),
    farmaceutico: avgFuncao(empresaId, lojaId, mes, ano, 'func-farmaceutico'),
    estagiarios: avgFuncao(empresaId, lojaId, mes, ano, 'func-estagiario'),
    ocorrencias_rh: ocorrenciasZeradas(empresaId, lojaId),
    conferencia: avgFuncao(empresaId, lojaId, mes, ano, 'func-conferente'),
    acoes_loja: campanhasPct(empresaId, lojaId, 'comprovante', 'acao'),
    campanhas_ciencia: campanhasPct(empresaId, lojaId, 'ciencia', null),
    limpeza: checklistMediaCategoria(empresaId, lojaId, mes, ano, 'limpeza'),
    caixa: notaCaixa(empresaId, lojaId, mes, ano),
    metas_equipe: notaMetaEquipe(empresaId, lojaId, mes, ano),
    disciplina: notaDisciplina(empresaId, lojaId, mes, ano),
  };

  // PDV+ (Taxa de Conversão de sugestões) da loja, via Trivio. Nota 0–100 com meta de
  // conversão = 10% → nota 100 (ex.: 9,4% → 94). Só entra se houver dado da Trivio.
  const convPdvLoja = trivioPdv.conversaoLojaSync(lojaId, mes, ano);
  if (convPdvLoja != null) live.pdvplus = Math.min(100, Math.round(convPdvLoja * 10));

  // Vitaminas e PBM de loja: média real dos vendedores (ERP) quando houver dado.
  const vp = vitPbmLojaErp(empresaId, lojaId, mes, ano);
  if (vp.pbm != null) live.pbm = vp.pbm;
  if (vp.vitaminas != null) live.vitaminas = vp.vitaminas;

  // Avaliação administrativa (chefe do setor) alimenta os indicadores do gerente.
  // Conferentes → indicador "conferencia"; Caixas → indicador "caixa". Mistura com o dado
  // operacional já existente (média dos dois) ou usa a avaliação se não houver outro dado.
  const evalConf = avgAdminEval(empresaId, lojaId, mes, ano, 'func-conferente');
  if (evalConf != null) live.conferencia = live.conferencia != null ? Math.round((live.conferencia + evalConf) / 2) : evalConf;
  const evalCaixa = avgAdminEval(empresaId, lojaId, mes, ano, 'func-caixa');
  if (evalCaixa != null) live.caixa = live.caixa != null ? Math.round((live.caixa + evalCaixa) / 2) : evalCaixa;

  // Checklists ligados a indicadores alimentam o painel automaticamente
  const alvos = db.prepare(`
    SELECT indicador_alvo FROM checklist_secao WHERE empresa_id=? AND indicador_alvo IS NOT NULL
    UNION SELECT indicador_alvo FROM checklist_def WHERE empresa_id=? AND modo='inteiro' AND indicador_alvo IS NOT NULL
  `).all(empresaId, empresaId);
  alvos.forEach(({ indicador_alvo }) => {
    const n = checklistIndicadorNota(empresaId, lojaId, indicador_alvo);
    if (n != null) live[indicador_alvo] = n;
  });

  // Ocorrências ligadas ao indicador do GERENTE alimentam o painel (média da loja)
  const ocGer = db.prepare(`SELECT DISTINCT indicador_gerente FROM ocorrencias WHERE empresa_id=? AND loja_id=? AND status='ativa' AND indicador_gerente IS NOT NULL`).all(empresaId, lojaId);
  if (ocGer.length) {
    const colabsLoja = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND ativo=1`).all(empresaId, lojaId);
    ocGer.forEach(({ indicador_gerente }) => {
      if (!colabsLoja.length) return;
      const media = Math.round(colabsLoja.reduce((a, c) => {
        const ocs = db.prepare(`SELECT deducao, zera FROM ocorrencias WHERE empresa_id=? AND colaborador_id=? AND indicador_gerente=? AND status='ativa' AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?`).all(empresaId, c.id, indicador_gerente, mes, ano);
        if (ocs.some(o => o.zera)) return a + 0;
        return a + Math.max(0, 100 - ocs.reduce((x, o) => x + (o.deducao || 0), 0));
      }, 0) / colabsLoja.length);
      live[indicador_gerente] = live[indicador_gerente] != null ? Math.min(live[indicador_gerente], media) : media;
    });
  }

  // Notas manuais lançadas (indicadores de fonte 'manual') entram no painel do gerente.
  const notasManuais = db.prepare(`SELECT indicador_id, nota FROM indicador_nota_manual WHERE empresa_id=? AND loja_id=? AND mes=? AND ano=?`).all(empresaId, lojaId, mes, ano);
  notasManuais.forEach(n => { if (n.nota != null) live[n.indicador_id] = n.nota; });

  const pilares = getPilares(empresaId).map(p => ({
    id: p.id, nome: p.nome, cor: p.cor, peso: p.peso,
    indicadores: p.indicadores.map(ind => {
      const nota = live[ind.id] != null ? live[ind.id] : null;
      const temDado = nota != null;
      return {
        id: ind.id, nome: ind.nome, min: ind.min, acao: ind.acao,
        nota, ok: temDado ? nota >= ind.min : null,
        fonte: temDado ? 'live' : 'estimado',
      };
    }),
  }));

  // notaPilar considera só indicadores com dado
  pilares.forEach(p => {
    const comDado = p.indicadores.filter(i => i.nota != null);
    p.nota = comDado.length ? Math.round(comDado.reduce((a, i) => a + i.nota, 0) / comDado.length) : null;
    p.sem_dado = p.indicadores.length - comDado.length;
  });
  const comNota = pilares.filter(p => p.nota != null);
  const geral = comNota.length ? Math.round(comNota.reduce((a, p) => a + p.nota * (p.peso / 100), 0) / comNota.reduce((a, p) => a + p.peso / 100, 0)) : 0;

  return { pilares, nota_geral: geral, premio_pct: premioGerente(geral, require('../lib/premiacaoConfig').getGerente(empresaId)) };
}

// GET /painel/vendedor-grupos?colaborador_id=&mes=&ano= — vendas do vendedor por grupo (ao vivo)
router.get('/vendedor-grupos', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const colabId = req.query.colaborador_id;
  if (!colabId) return res.status(400).json({ erro: 'Colaborador obrigatório.' });
  const grupos = await vendasErp.vendasGruposVendedor(colabId, mes, ano);
  res.json({ colaborador_id: colabId, mes, ano, grupos });
});

// GET /painel/gerente?loja_id=&mes=&ano=
router.get('/gerente', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const loja = db.prepare('SELECT nome FROM lojas WHERE id=?').get(lojaId);
  await vendasErp.prewarmLoja(lojaId, mes, ano); // aquece vendas ao vivo do ERP
  await indErp.prewarmIndicadoresVendedores(lojaId, mes, ano); // indicadores por vendedor (ERP)
  await trivioPdv.prewarmPdv(mes, ano); await trivioPdv.prewarmFilipeta(mes, ano); // PDV+ e Filipeta da Trivio
  await encomendasSync.sincronizarEncomendas(req.usuario.empresa_id); // gera/encerra tarefas de encomenda (throttled)
  const r = calcularGerente(req.usuario.empresa_id, lojaId, mes, ano);
  const abaixo = r.pilares.flatMap(p => p.indicadores).filter(i => i.ok === false).length;
  const hojeISO = hoje.toISOString().slice(0, 10);
  const ferias = db.prepare(`SELECT c.nome, a.data_inicio, a.data_fim, a.tipo, sub.nome as substituto_nome
    FROM afastamentos a JOIN colaboradores c ON c.id=a.colaborador_id LEFT JOIN colaboradores sub ON sub.id=a.substituto_id
    WHERE a.empresa_id=? AND c.loja_id=? AND date(a.data_inicio)<=date(?) AND (a.data_fim IS NULL OR date(a.data_fim)>=date(?))
    ORDER BY a.tipo, c.nome`).all(req.usuario.empresa_id, lojaId, hojeISO, hojeISO);

  // Indicadores comerciais da loja (ao vivo do ERP)
  let indicadoresErp = null;
  try { indicadoresErp = await indErp.indicadoresLojaMes(lojaId, mes, ano); } catch { /* ignora */ }
  // Vendas da loja por grupo (visão inicial do gerente)
  let vendasGruposLoja = null;
  try { vendasGruposLoja = await vendasErp.vendasGruposLojaMes(lojaId, mes, ano); } catch { /* ignora */ }

  // Resumo de vendas: meta x realizado da loja + TODOS os vendedores da loja
  // (com todos os indicadores e a premiação acumulada — mesma lógica da tela do supervisor).
  const eid = req.usuario.empresa_id;
  const metaLojaRow = fv.metaLojaDoPeriodo(eid, lojaId, mes, ano);
  const lojaVendido = vendasErp.totalLojaMesSync(lojaId, mes, ano);
  const metaLoja = metaLojaRow?.valor_meta || 0;
  const superMeta = metaLojaRow?.valor_super_meta ?? null;
  const r2 = v => Math.round((v || 0) * 100) / 100;

  const vendList = fv.vendedoresDaLoja(eid, lojaId, mes, ano);
  const somaPesos = vendList.reduce((a, v) => a + v.peso, 0) || 1;
  const pesos = fv.pesosVendedor(eid);
  const basePrem = await indErp.premiacaoBaseVendedoresLoja(lojaId, mes, ano);

  // TODOS os vendedores; os abaixo da meta vêm primeiro (pior pct no topo).
  const vendedores = vendList.map(v => {
    const foto = fv.fotoVendedor(eid, lojaId, mes, ano, v, somaPesos, metaLoja, pesos);
    const b = basePrem[v.colaborador_id] || { premiacao_liquido: 0, uv_remuneracao: 0 };
    const premiacaoValor = r2((foto.premiacao_pct / 100) * b.premiacao_liquido);
    const vitaminasValor = r2(foto.premiacao_vitamina_total);
    const uvValor = r2(b.uv_remuneracao);
    const premiacaoTotal = r2(premiacaoValor + vitaminasValor + uvValor);
    // realizado de cada indicador do vendedor (Identificação, Pdv+, PBM, Vitaminas, Campanhas)
    const indicadores = pesos.map(c => {
      const metaC = fv.metaColaboradorInd(eid, lojaId, c.indicador, mes, ano);
      const real = fv.realizadoInd(eid, v.colaborador_id, c.indicador, mes, ano);
      const nota = calc.notaIndicador(c.indicador, real, metaC);
      const unidade = ['identificacao', 'pbm', 'cadastro'].includes(c.indicador) ? 'pct'
        : c.indicador === 'encomendas' ? 'qtd' : 'un';
      return { indicador: c.indicador, label: c.label, peso: c.peso, realizado: real, meta: metaC ?? null, nota, unidade };
    });
    const identificacao = indErp.indicadorVendedorSync(lojaId, mes, ano, v.colaborador_id, 'identificacao');
    // Tarefas em aberto do colaborador (responsável) + quantas já passaram do prazo
    const tp = db.prepare(`SELECT prazo, titulo FROM tarefas WHERE empresa_id=? AND responsavel_id=? AND status!='concluido'`).all(eid, v.colaborador_id);
    const tarefasAtrasadas = tp.filter(t => t.prazo && new Date(t.prazo).getTime() < hoje.getTime()).length;
    return {
      colaborador_id: v.colaborador_id, nome: v.nome,
      vendido: foto.vendido, meta: foto.meta, super_meta: foto.super_meta,
      pct: foto.pct_meta, pct_super: foto.pct_super, abaixo: foto.meta > 0 && foto.pct_meta < 100,
      nota_indicadores: foto.nota_indicadores,
      identificacao: identificacao === undefined ? null : identificacao,
      vitaminas: foto.vitaminas_unidades,
      indicadores,
      premiacao_pct: foto.premiacao_pct,
      premiacao_valor: premiacaoValor, vitaminas_valor: vitaminasValor, uv_valor: uvValor,
      premiacao_total: premiacaoTotal,
      tarefas_abertas: tp.length, tarefas_atrasadas: tarefasAtrasadas,
      tarefas_titulos: tp.slice(0, 6).map(t => t.titulo),
    };
  }).sort((a, b) => {
    const am = a.meta > 0, bm = b.meta > 0;
    if (am !== bm) return am ? -1 : 1;                        // com meta individual primeiro
    if (am && a.abaixo !== b.abaixo) return a.abaixo ? -1 : 1; // abaixo da meta no topo
    if (am) return a.pct - b.pct;                             // pior pct primeiro
    return (b.vendido || 0) - (a.vendido || 0);               // sem meta: maior vendido primeiro
  });
  // Toda venda realizada na loja (ERP) — inclui quem vendeu mas não é func-vendedor / não está vinculado.
  const extras = [];
  try {
    const realizados = vendasErp.vendedoresRealizadosLojaSync(lojaId, mes, ano);
    const colabPorPessoa = new Map(db.prepare('SELECT id, erp_pessoa_id, nome FROM colaboradores WHERE loja_id=? AND erp_pessoa_id IS NOT NULL').all(lojaId).map(c => [String(c.erp_pessoa_id), c]));
    const jaListado = new Set(vendedores.map(v => v.colaborador_id));
    for (const rz of realizados) {
      const colab = rz.pessoaid != null ? colabPorPessoa.get(String(rz.pessoaid)) : null;
      if (colab && jaListado.has(colab.id)) continue; // já aparece com meta/foto
      extras.push({ colaborador_id: colab ? colab.id : `erp:${rz.pessoaid || rz.nome}`, nome: colab ? colab.nome : rz.nome, vendido: rz.vendido, meta: 0, super_meta: null, pct: null, pct_super: null, abaixo: false, extra: true, semVinculo: !colab });
    }
  } catch { /* ERP indisponível — mantém só os cadastrados */ }
  const vendedoresFull = [...vendedores, ...extras.sort((a, b) => (b.vendido || 0) - (a.vendido || 0))];
  const resumoVendas = {
    meta: metaLojaRow?.valor_meta ?? null,
    super_meta: superMeta,
    vendido: lojaVendido,
    pct: metaLojaRow?.valor_meta ? Math.round((lojaVendido / metaLojaRow.valor_meta) * 100) : null,
    pct_super: superMeta ? Math.round((lojaVendido / superMeta) * 100) : null,
    total_vendedores: vendedoresFull.length,
    total_vendedores_com_meta: vendedores.filter(v => v.meta > 0).length,
    abaixo_count: vendedores.filter(v => v.abaixo).length,
    premiacao_total: r2(vendedores.reduce((a, v) => a + v.premiacao_total, 0)),
    pesos,
    vendedores: vendedoresFull,
  };

  res.json({ loja: loja?.nome, loja_id: lojaId, mes, ano, ...r, indicadores_abaixo: abaixo, ferias,
    indicadores_erp: indicadoresErp, resumo_vendas: resumoVendas, vendas_grupos_loja: vendasGruposLoja });
});

// GET /painel/supervisor?mes=&ano=  — visão de todas as lojas (média dos gerentes)
router.get('/supervisor', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojas = db.prepare('SELECT id, nome FROM lojas WHERE empresa_id=? AND ativa=1 ORDER BY nome').all(req.usuario.empresa_id);
  await Promise.all(lojas.map(l => vendasErp.prewarmLoja(l.id, mes, ano))); // aquece todas as lojas
  await Promise.all(lojas.map(l => indErp.prewarmIndicadoresVendedores(l.id, mes, ano))); // vitaminas/pbm por vendedor (ERP)
  await trivioPdv.prewarmPdv(mes, ano); await trivioPdv.prewarmFilipeta(mes, ano); // PDV+ e Filipeta da Trivio p/ todas as lojas
  const resultado = lojas.map(l => {
    const r = calcularGerente(req.usuario.empresa_id, l.id, mes, ano);
    const abaixoInds = r.pilares.flatMap(p => (p.indicadores || []).filter(i => i.ok === false).map(i => ({ nome: i.label || i.indicador, nota: i.nota, pilar: p.nome })));
    // Vendas da loja no mês (do cache já aquecido — sync, sem chamada extra ao ERP)
    const vendido = Number(vendasErp.totalLojaMesSync(l.id, mes, ano)) || 0;
    const mrow = fv.metaLojaDoPeriodo(req.usuario.empresa_id, l.id, mes, ano);
    const meta = mrow?.valor_meta || 0, superM = mrow?.valor_super_meta || 0;
    return {
      loja_id: l.id, loja: l.nome, nota_geral: r.nota_geral, premio_pct: r.premio_pct,
      indicadores_abaixo: abaixoInds.length,
      criticos: abaixoInds.sort((a, b) => (a.nota ?? 0) - (b.nota ?? 0)),
      pilares: r.pilares.map(p => ({ id: p.id, nome: p.nome, nota: p.nota })),
      vendido, meta, super_meta: superM,
      pct: meta ? Math.round(vendido / meta * 100) : null,
    };
  });
  resultado.sort((a, b) => b.nota_geral - a.nota_geral);
  const media = resultado.length ? Math.round(resultado.reduce((a, r) => a + r.nota_geral, 0) / resultado.length) : 0;
  const rv = resultado.reduce((a, l) => a + l.vendido, 0);
  const rm = resultado.reduce((a, l) => a + l.meta, 0);
  const rs = resultado.reduce((a, l) => a + l.super_meta, 0);
  const resumo_rede = { vendido: rv, meta: rm, super_meta: rs, pct: rm ? Math.round(rv / rm * 100) : null, pct_super: rs ? Math.round(rv / rs * 100) : null };
  res.json({ mes, ano, media_rede: media, lojas: resultado, resumo_rede });
});

// GET /painel/diretoria?mes=&ano= — visão executiva: o que a Direção precisa bater o olho e cobrar por setor.
// valorRef das áreas MENSAIS LEVES para um mês qualquer (usado p/ semear a tendência do mês anterior
// sem recalcular o painel inteiro — não inclui as áreas pesadas de loja).
async function snapshotMensalMes(emp, mes, ano) {
  const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimo = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
  const out = {};
  try { const t = require('../lib/tesourariaErp'); const q = await t.quebras(emp, { ini, fim }); out['Tesouraria'] = Number(q.resumo?.valorAcobrar || 0); } catch { /* skip */ }
  try { const en = require('../lib/entregaErp'); const r = await en.resumo(emp, { ini, fim }); out['Atendimento Online'] = Number(r.tempoMedio || 0); } catch { /* skip */ }
  try { const fin = require('../lib/financeiroErp'); const dre = await fin.dre(emp, { ano }); if (dre.ok) out['Financeiro (DRE)'] = Number((dre.resultado || [])[mes - 1] || 0); } catch { /* skip */ }
  try { const { orcamentoCompra } = require('../lib/orcamentoErp'); const o = await orcamentoCompra(emp, { ano, mes }); const mc = o.mesCorrente || o.mes || {}; out['Compras — Orçamento'] = Number(mc.saldo != null ? mc.saldo : ((mc.orcamento || 0) - (mc.comprado || 0))); } catch { /* skip */ }
  try { const ag = db.prepare('SELECT status FROM mkt_agenda WHERE empresa_id=? AND data_ini>=? AND data_ini<=?').all(emp, ini, fim); const tot = ag.length; const f = ag.filter(a => ['publicado', 'concluido'].includes(a.status)).length; if (tot) out['Marketing'] = Math.round(100 * f / tot); } catch { /* skip */ }
  return out;
}

router.get('/diretoria', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const emp = req.usuario.empresa_id;
  const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fim = hoje.toISOString().slice(0, 10);
  const lojas = db.prepare('SELECT id, nome FROM lojas WHERE empresa_id=? AND ativa=1 ORDER BY nome').all(emp);
  const brl = v => 'R$ ' + (Math.round(Number(v) || 0)).toLocaleString('pt-BR');
  const areas = [];
  const add = a => areas.push(a);
  const resumo = { mediaRede: null, lojasCriticas: null, lojasTotal: lojas.length };

  // 🏪 OPERAÇÃO (lojas) — nota da rede + lojas críticas
  try {
    await Promise.all(lojas.map(l => vendasErp.prewarmLoja(l.id, mes, ano).catch(() => {})));
    const notas = lojas.map(l => { const r = calcularGerente(emp, l.id, mes, ano); const abaixo = r.pilares.flatMap(p => p.indicadores || []).filter(i => i.ok === false).length; return { loja: l.nome, nota: r.nota_geral || 0, abaixo }; });
    const media = notas.length ? Math.round(notas.reduce((a, n) => a + n.nota, 0) / notas.length) : 0;
    const criticas = notas.filter(n => n.nota < 75).sort((a, b) => a.nota - b.nota);
    resumo.mediaRede = media; resumo.lojasCriticas = criticas.length;
    add({ area: 'Operação (lojas)', emoji: '🏪', link: 'supervisor',
      kpis: [
        { label: 'Nota média da rede', valor: media + '/100', status: media >= 90 ? 'verde' : media >= 75 ? 'amarelo' : 'vermelho' },
        { label: 'Lojas abaixo de 75', valor: String(criticas.length), status: criticas.length ? 'vermelho' : 'verde' },
      ],
      valorRef: media, melhorQuando: 'alto', mensal: true,
      cobrar: criticas.length ? `Cobrar gerentes: ${criticas.slice(0, 3).map(c => `${c.loja} (${c.nota})`).join(' · ')}` : 'Todas as lojas no verde. 👏' });
  } catch (e) { add({ area: 'Operação (lojas)', emoji: '🏪', erro: true }); }

  // 💰 COMERCIAL / VENDAS — faturamento da rede no mês
  try {
    const totais = await Promise.all(lojas.map(l => vendasErp.totalLojaMes(l.id, mes, ano).catch(() => 0)));
    const vend = totais.reduce((a, b) => a + (Number(b) || 0), 0);
    add({ area: 'Comercial / Vendas', emoji: '💰', link: 'supervisor',
      kpis: [{ label: `Faturamento ${String(mes).padStart(2, '0')}/${ano} (rede)`, valor: brl(vend), status: 'neutro' }],
      valorRef: vend, melhorQuando: 'alto', mensal: true,
      cobrar: 'Acompanhe a super meta e os grupos abaixo em Campanhas/Supervisão.' });
  } catch (e) { add({ area: 'Comercial / Vendas', emoji: '💰', erro: true }); }

  // 🏦 TESOURARIA — quebras de caixa a cobrar
  try {
    const t = require('../lib/tesourariaErp');
    const q = await t.quebras(emp, { ini, fim });
    const R = q.resumo || {};
    add({ area: 'Tesouraria', emoji: '🏦', link: 'caixa',
      kpis: [
        { label: 'Faltas a cobrar', valor: String(R.acobrar || 0), status: (R.acobrar || 0) > 0 ? 'vermelho' : 'verde', sub: brl(R.valorAcobrar || 0) },
        { label: 'Cobranças pendentes', valor: String(R.pendentes || 0), status: (R.pendentes || 0) > 0 ? 'amarelo' : 'verde' },
      ],
      valorRef: Number(R.valorAcobrar || 0), melhorQuando: 'baixo', mensal: true,
      cobrar: (R.acobrar || 0) > 0 ? `Cobrar ${brl(R.valorAcobrar || 0)} em faltas de caixa dos operadores.` : 'Sem faltas relevantes a cobrar.' });
  } catch (e) { add({ area: 'Tesouraria', emoji: '🏦', erro: true }); }

  // 💳 CONTAS A RECEBER — em aberto e vencido
  try {
    const cr = require('../lib/contasReceberErp');
    const r = await cr.resumo(emp, {});
    add({ area: 'Contas a Receber', emoji: '💳', link: 'contas-receber',
      kpis: [
        { label: 'Em aberto (rede)', valor: brl(r.total), status: 'neutro' },
        { label: 'Vencido', valor: brl(r.vencidoTotal), status: (r.vencidoTotal || 0) > 0 ? 'vermelho' : 'verde' },
      ],
      valorRef: Number(r.vencidoTotal || 0), melhorQuando: 'baixo', mensal: false,
      cobrar: (r.vencidoTotal || 0) > 0 ? `Cobrar ${brl(r.vencidoTotal)} vencidos (crediário/cartão/PBM).` : 'Nada vencido.' });
  } catch (e) { add({ area: 'Contas a Receber', emoji: '💳', erro: true }); }

  // 📦 COMPRAS — CMV e ruptura
  try {
    const { indicadoresEstoque } = require('../lib/indicadoresCompraErp');
    const i = await indicadoresEstoque(emp, {});
    if (i.erp === false || i.erro) throw new Error(i.erro || 'ERP indisponível');
    const rup = Number(i.ruptura?.pct ?? 0);
    const cob = i.cobertura?.dias != null ? Number(i.cobertura.dias) : null;
    const valEst = Number(i.estoque?.valor ?? 0);
    add({ area: 'Compras / Estoque', emoji: '📦', link: 'painel-compras',
      kpis: [
        { label: 'Ruptura', valor: rup.toFixed(1) + '%', status: i.ruptura?.semaforo || (rup <= 4 ? 'verde' : rup <= 8 ? 'amarelo' : 'vermelho') },
        { label: 'Cobertura', valor: cob == null ? '—' : cob + ' d', status: i.cobertura?.semaforo || 'neutro' },
        { label: 'Estoque a custo', valor: brl(valEst), status: 'neutro' },
      ],
      valorRef: rup, melhorQuando: 'baixo', mensal: false,
      cobrar: (i.ruptura?.semaforo === 'vermelho' || rup > (i.ruptura?.meta || 5)) ? 'Ruptura acima da meta — cobrar reposição do comprador.' : 'Estoque saudável.' });
  } catch (e) { add({ area: 'Compras / Estoque', emoji: '📦', erro: true }); }

  // ↩️ DEVOLUÇÕES — Suporte fechar o ciclo (recolher/reembolsar/concluir), não deixar parar
  try {
    const d = new Date(); const M = String(d.getMonth() + 1).padStart(2, '0'), A = String(d.getFullYear());
    const AT = "('andamento','analise_fornecedor','coleta','reembolso')";
    const par = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(valor_total),0) v FROM devolucoes WHERE empresa_id=? AND status IN ${AT}`).get(emp);
    const concl = db.prepare(`SELECT COUNT(*) c FROM devolucoes WHERE empresa_id=? AND status='concluido' AND strftime('%m',status_desde)=? AND strftime('%Y',status_desde)=?`).get(emp, M, A).c;
    const atras = db.prepare(`SELECT COUNT(*) c FROM devolucoes WHERE empresa_id=? AND status IN ${AT} AND (julianday('now') - julianday(status_desde)) > 7`).get(emp).c;
    add({ area: 'Devoluções', emoji: '↩️', link: 'devolucoes',
      kpis: [
        { label: 'Valor parado', valor: brl(par.v), status: (par.c || 0) > 0 ? 'amarelo' : 'verde' },
        { label: 'Em aberto', valor: String(par.c), status: atras > 0 ? 'vermelho' : (par.c > 0 ? 'amarelo' : 'verde') },
        { label: 'Fechadas no mês', valor: String(concl), status: 'neutro' },
      ],
      valorRef: Number(par.c || 0), melhorQuando: 'baixo', mensal: false,
      cobrar: atras > 0 ? `${atras} devolução(ões) parada(s) há +7 dias — cobrar o Suporte a recolher/reembolsar/concluir.` : (par.c > 0 ? `${par.c} em aberto — acompanhar o fechamento.` : 'Devoluções em dia.') });
  } catch (e) { add({ area: 'Devoluções', emoji: '↩️', erro: true }); }

  // 🛵 ENTREGA
  try {
    const en = require('../lib/entregaErp');
    const r = await en.resumo(emp, { ini, fim });
    add({ area: 'Atendimento Online', emoji: '📱', link: 'entrega',
      kpis: [
        { label: 'Entregas no mês', valor: String(r.total || 0), status: 'neutro', sub: `${r.finalizadas || 0} finalizadas` },
        { label: 'Tempo médio de rota', valor: (r.tempoMedio || 0) + ' min', status: (r.tempoMedio || 0) <= 45 ? 'verde' : (r.tempoMedio || 0) <= 75 ? 'amarelo' : 'vermelho' },
      ],
      valorRef: Number(r.tempoMedio || 0), melhorQuando: 'baixo', mensal: true,
      cobrar: (r.tempoMedio || 0) > 75 ? 'Tempo de rota alto — cobrar logística/entregadores.' : 'Delivery no ritmo.' });
  } catch (e) { add({ area: 'Atendimento Online', emoji: '📱', erro: true }); }

  // 👥 GENTE & GESTÃO — tarefas atrasadas + satisfação do cliente
  try {
    const atrasadas = db.prepare(`SELECT count(*) n FROM tarefas WHERE empresa_id=? AND status NOT IN ('concluido','concluida','cancelado','resolvido') AND prazo IS NOT NULL AND date(prazo) < date('now')`).get(emp).n || 0;
    const sat = db.prepare(`SELECT round(avg(nota),1) m, count(*) n FROM satisfacao_avaliacoes WHERE empresa_id=?`).get(emp) || {};
    const kpis = [{ label: 'Tarefas atrasadas (rede)', valor: String(atrasadas), status: atrasadas === 0 ? 'verde' : atrasadas <= 10 ? 'amarelo' : 'vermelho' }];
    if (sat.n) kpis.push({ label: 'Satisfação do cliente (QR)', valor: (sat.m || '—') + '★', status: (sat.m || 0) >= 4 ? 'verde' : (sat.m || 0) >= 3 ? 'amarelo' : 'vermelho', sub: `${sat.n} avaliações` });
    add({ area: 'Gente & Gestão / Cliente', emoji: '👥', link: 'painel-rh',
      kpis, valorRef: atrasadas, melhorQuando: 'baixo', mensal: false,
      cobrar: atrasadas > 0 ? `${atrasadas} tarefas atrasadas — cobrar os responsáveis pelos setores.` : 'Tarefas em dia.' });
  } catch (e) { add({ area: 'Gente & Gestão / Cliente', emoji: '👥', erro: true }); }

  // 📊 FINANCEIRO — lucro/resultado do mês (DRE)
  try {
    const fin = require('../lib/financeiroErp');
    const dre = await fin.dre(emp, { ano });
    if (dre.ok) {
      const i = mes - 1;
      const lucro = (dre.resultado || [])[i] || 0;
      const marg = (dre.margem || [])[i];
      const recL = (dre.receitaLiquida || [])[i] || 0;
      add({ area: 'Financeiro (DRE)', emoji: '📊', link: 'financeiro',
        kpis: [
          { label: `Resultado ${String(mes).padStart(2, '0')}/${ano}`, valor: brl(lucro), status: lucro > 0 ? 'verde' : lucro < 0 ? 'vermelho' : 'neutro', sub: recL ? `receita ${brl(recL)}` : '' },
          { label: 'Margem líquida', valor: (marg != null ? marg.toFixed(1) : '—') + '%', status: marg == null ? 'neutro' : marg >= 5 ? 'verde' : marg >= 0 ? 'amarelo' : 'vermelho' },
        ],
        valorRef: Number(lucro || 0), melhorQuando: 'alto', mensal: true,
        cobrar: lucro < 0 ? 'Resultado negativo no mês — revisar despesas e margem com a Controladoria.' : 'Resultado positivo. Acompanhe a margem.' });
    }
  } catch (e) { add({ area: 'Financeiro (DRE)', emoji: '📊', erro: true }); }

  // 🧮 ORÇAMENTO DE COMPRAS — orçado × comprado do mês
  try {
    const { orcamentoCompra } = require('../lib/orcamentoErp');
    const o = await orcamentoCompra(emp, { ano, mes });
    const mc = o.mesCorrente || o.mes || {};
    const orc = mc.orcamento || 0, comp = mc.comprado || 0;
    if (o.erp !== false) add({ area: 'Compras — Orçamento', emoji: '🧮', link: 'painel-compras',
      kpis: [
        { label: 'Orçado do mês (CMV)', valor: brl(orc), status: 'neutro' },
        { label: 'Já comprado', valor: brl(comp), status: (mc.semaforo === 'vermelho') ? 'vermelho' : mc.semaforo === 'amarelo' ? 'amarelo' : 'verde', sub: `saldo ${brl(mc.saldo || (orc - comp))}` },
      ],
      valorRef: Number(mc.saldo != null ? mc.saldo : (orc - comp)), melhorQuando: 'alto', mensal: true,
      cobrar: (mc.saldo || 0) < 0 ? 'Compras acima do orçamento do mês — cobrar o comprador/Controladoria.' : 'Compras dentro do orçamento.' });
  } catch (e) { add({ area: 'Compras — Orçamento', emoji: '🧮', erro: true }); }

  // 🕐 PONTO — cobertura do vínculo com o Tangerino (detalhe de absenteísmo fica no módulo Ponto)
  try {
    const ativos = db.prepare(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1`).get(emp).n || 0;
    const vinc = db.prepare(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1 AND tangerino_id IS NOT NULL`).get(emp).n || 0;
    const pct = ativos ? Math.round(100 * vinc / ativos) : 0;
    add({ area: 'Ponto (Tangerino)', emoji: '🕐', link: 'ponto',
      kpis: [{ label: 'Colaboradores no ponto', valor: `${vinc}/${ativos}`, status: pct >= 90 ? 'verde' : pct >= 70 ? 'amarelo' : 'vermelho', sub: `${pct}% vinculados` }],
      valorRef: pct, melhorQuando: 'alto', mensal: false,
      cobrar: pct < 90 ? `${ativos - vinc} colaborador(es) sem vínculo no Tangerino — o RH deve vincular. Faltas/atrasos no módulo Ponto.` : 'Ponto coberto. Veja faltas/atrasos no módulo Ponto.' });
  } catch (e) { add({ area: 'Ponto (Tangerino)', emoji: '🕐', erro: true }); }

  // 📣 MARKETING — ações do calendário no mês + execução + verba
  try {
    const ag = db.prepare('SELECT status FROM mkt_agenda WHERE empresa_id=? AND data_ini>=? AND data_ini<=?').all(emp, ini, fim);
    const totalA = ag.length;
    const feitas = ag.filter(a => ['publicado', 'concluido'].includes(a.status)).length;
    const pctFeitas = totalA ? Math.round(100 * feitas / totalA) : null;
    const verba = db.prepare('SELECT valor FROM mkt_orcamento WHERE empresa_id=? AND ano=? AND mes=?').get(emp, ano, mes)?.valor || 0;
    add({ area: 'Marketing', emoji: '📣', link: 'mkt-calendario',
      kpis: [
        { label: 'Ações no mês', valor: String(totalA), status: 'neutro', sub: `${feitas} concluídas` },
        { label: '% executadas', valor: pctFeitas == null ? '—' : pctFeitas + '%', status: pctFeitas == null ? 'neutro' : pctFeitas >= 80 ? 'verde' : pctFeitas >= 50 ? 'amarelo' : 'vermelho' },
        { label: 'Verba do mês', valor: brl(verba), status: 'neutro' },
      ],
      valorRef: pctFeitas, melhorQuando: 'alto', mensal: true,
      cobrar: totalA === 0 ? 'Nenhuma ação de marketing no calendário deste mês — planejar com o time.' : (pctFeitas != null && pctFeitas < 50 ? 'Menos da metade das ações executadas — cobrar o calendário de marketing.' : 'Marketing no ritmo do calendário.') });
  } catch (e) { add({ area: 'Marketing', emoji: '📣', erro: true }); }

  // Setores = departamentos do menu (mesmo vocabulário). Cada área do painel cai num setor.
  const SETOR_DE_AREA = {
    'Operação (lojas)': 'operacional', 'Comercial / Vendas': 'operacional',
    'Compras / Estoque': 'comercial', 'Compras — Orçamento': 'comercial',
    'Marketing': 'marketing',
    'Gente & Gestão / Cliente': 'gente', 'Ponto (Tangerino)': 'gente',
    'Tesouraria': 'administrativo', 'Contas a Receber': 'administrativo', 'Financeiro (DRE)': 'administrativo',
    'Atendimento Online': 'operacional', 'Devoluções': 'logistica',
  };
  areas.forEach(a => { a.setor = SETOR_DE_AREA[a.area] || 'operacional'; });
  const SETORES = SETORES_BASE;
  let cfg = {};
  try { db.prepare('SELECT setor_key, dono, meta, expectativas FROM setor_config WHERE empresa_id=?').all(emp).forEach(r => { cfg[r.setor_key] = r; }); } catch { /* migração pendente */ }
  const setores = SETORES.map(sx => ({
    key: sx.key, nome: sx.nome, emoji: sx.emoji,
    dono: cfg[sx.key]?.dono || sx.donoPad,
    meta: cfg[sx.key]?.meta || '',
    expectativas: (cfg[sx.key]?.expectativas != null && cfg[sx.key].expectativas !== '') ? cfg[sx.key].expectativas : sx.expPad.join('\n'),
    expectativas_sugerida: !(cfg[sx.key]?.expectativas), // true = ainda é a sugestão padrão (não editada)
  }));

  // Tendência ▲▼ mês-a-mês via snapshot mensal (guarda valorRef por competência e compara).
  try {
    const comp = `${ano}-${String(mes).padStart(2, '0')}`;
    const pm = mes === 1 ? 12 : mes - 1;
    const pa = mes === 1 ? ano - 1 : ano;
    const compPrev = `${pa}-${String(pm).padStart(2, '0')}`;
    const up = db.prepare(`INSERT INTO painel_snapshot (empresa_id, area, competencia, valor) VALUES (?,?,?,?)
      ON CONFLICT(empresa_id, area, competencia) DO UPDATE SET valor=excluded.valor, criado_em=datetime('now')`);
    areas.forEach(a => { if (!a.erro && typeof a.valorRef === 'number' && !Number.isNaN(a.valorRef)) up.run(emp, a.area, comp, a.valorRef); });
    const prev = {};
    db.prepare('SELECT area, valor FROM painel_snapshot WHERE empresa_id=? AND competencia=?').all(emp, compPrev).forEach(r => { prev[r.area] = r.valor; });
    // Se faltar o mês anterior nas áreas mensais leves, calcula uma vez e grava (bootstrap imediato).
    const faltam = areas.some(a => a.mensal && !a.erro && prev[a.area] == null && !['Operação (lojas)', 'Comercial / Vendas'].includes(a.area));
    if (faltam) {
      const boot = await snapshotMensalMes(emp, pm, pa);
      Object.entries(boot).forEach(([area, v]) => { if (typeof v === 'number' && !Number.isNaN(v)) { up.run(emp, area, compPrev, v); prev[area] = v; } });
    }
    areas.forEach(a => {
      const p = prev[a.area];
      if (a.erro || typeof a.valorRef !== 'number' || Number.isNaN(a.valorRef) || p == null) { a.tendencia = null; return; }
      const diff = a.valorRef - p;
      if (Math.abs(diff) / Math.max(Math.abs(p), 1) < 0.005) { a.tendencia = { dir: 'flat', bom: null }; return; }
      const subiu = diff > 0;
      a.tendencia = { dir: subiu ? 'up' : 'down', bom: a.melhorQuando === 'alto' ? subiu : !subiu };
    });
  } catch { /* tendência é best-effort */ }

  res.json({ mes, ano, geradoEm: fim, areas, resumo, setores });
});

// Meu Setor — o responsável vê (LEITURA) o que a direção espera dele + as cobranças
// que a direção direcionou a ele. Casa o setor pela FUNÇÃO do usuário (SETORES_BASE.funcoes).
router.get('/meu-setor', (req, res) => {
  const emp = req.usuario.empresa_id, funcao = req.usuario.funcao_nome;
  const meus = SETORES_BASE.filter(s => (s.funcoes || []).includes(funcao));
  const cfg = {};
  try { db.prepare('SELECT setor_key, dono, meta, expectativas FROM setor_config WHERE empresa_id=?').all(emp).forEach(r => { cfg[r.setor_key] = r; }); } catch { /* migração pendente */ }
  const setores = meus.map(sx => {
    const c = cfg[sx.key] || {};
    const temExp = c.expectativas && c.expectativas.trim();
    return {
      key: sx.key, nome: sx.nome, emoji: sx.emoji,
      dono: c.dono || sx.donoPad, meta: c.meta || '',
      expectativas: temExp ? c.expectativas.split('\n').map(x => x.trim()).filter(Boolean) : sx.expPad,
      expectativas_padrao: !temExp,
    };
  });
  // Cobranças direcionadas a mim (o comentário do painel que a direção "direcionou" virou tarefa).
  const cobrancas = db.prepare(`SELECT id, titulo, descricao, status, prazo, criado_em FROM tarefas
    WHERE empresa_id=? AND responsavel_id=? AND origem='painel'
    ORDER BY (status!='concluido') DESC, prazo IS NULL, prazo ASC, criado_em DESC LIMIT 50`).all(emp, req.usuario.id);
  res.json({ funcao, temSetor: setores.length > 0, setores, cobrancas });
});

// Definir dono/meta de um setor (só direção/gestão).
router.post('/setor-config', (req, res) => {
  if (!['Diretor Geral', 'Gestor Geral'].includes(req.usuario.funcao_nome)) return res.status(403).json({ erro: 'Só a direção define dono/meta do setor.' });
  const { setor_key, dono, meta, expectativas } = req.body;
  if (!setor_key) return res.status(400).json({ erro: 'setor_key obrigatório.' });
  db.prepare(`INSERT INTO setor_config (empresa_id, setor_key, dono, meta, expectativas, atualizado_por, atualizado_em)
    VALUES (?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, setor_key) DO UPDATE SET dono=excluded.dono, meta=excluded.meta, expectativas=excluded.expectativas, atualizado_por=excluded.atualizado_por, atualizado_em=datetime('now')`)
    .run(req.usuario.empresa_id, setor_key, (dono || '').trim(), (meta || '').trim(), (expectativas || '').trim(), req.usuario.nome);
  res.json({ ok: true });
});

// Total de vendas do mês (escopo do usuário) — para o widget fixo no menu.
router.get('/venda-topo', async (req, res) => {
  const hoje = new Date();
  const mes = hoje.getMonth() + 1, ano = hoje.getFullYear();
  const emp = req.usuario.empresa_id;
  const ehGestao = ['Diretor Geral', 'Gestor Geral', 'Supervisor'].includes(req.usuario.funcao_nome);
  try {
    let ids;
    if (ehGestao) ids = db.prepare('SELECT id FROM lojas WHERE empresa_id=? AND ativa=1').all(emp).map(r => r.id);
    else if (req.usuario.loja_id) ids = [req.usuario.loja_id];
    else return res.json({ escopo: 'none' });
    let total = 0, meta = 0, sup = 0;
    await Promise.all(ids.map(async lid => {
      try { total += Number(await vendasErp.totalLojaMes(lid, mes, ano)) || 0; } catch { /* ignora */ }
      const m = fv.metaLojaDoPeriodo(emp, lid, mes, ano);
      if (m) { meta += Number(m.valor_meta) || 0; sup += Number(m.valor_super_meta) || 0; }
    }));
    res.json({ escopo: ehGestao ? 'rede' : 'loja', total, meta, super: sup,
      pct: meta ? Math.round(total / meta * 100) : null, pct_super: sup ? Math.round(total / sup * 100) : null, mes, ano });
  } catch (e) { res.json({ erro: true }); }
});

// ── Comunidade da gestão: comentários por painel + chat do escritório ────────
const { v4: uuidPC } = require('uuid');
const soEscritorio = (req, res, next) => req.usuario.escritorio ? next() : res.status(403).json({ erro: 'Área da gestão (escritório).' });

// Comentários de um painel/bloco (quem tem acesso deixa notas/informações).
router.get('/comentarios', soEscritorio, (req, res) => {
  const key = (req.query.key || '').toString().slice(0, 120);
  if (!key) return res.json({ comentarios: [] });
  const rows = db.prepare(`SELECT id, autor_id, autor_nome, autor_funcao, texto, criado_em FROM painel_comentarios
    WHERE empresa_id=? AND painel_key=? ORDER BY criado_em ASC LIMIT 200`).all(req.usuario.empresa_id, key);
  res.json({ comentarios: rows });
});
router.post('/comentarios', soEscritorio, (req, res) => {
  const key = (req.body.key || '').toString().slice(0, 120);
  const texto = (req.body.texto || '').toString().trim().slice(0, 2000);
  if (!key || !texto) return res.status(400).json({ erro: 'Informe o painel e o texto.' });
  const id = uuidPC();
  db.prepare(`INSERT INTO painel_comentarios (id,empresa_id,painel_key,autor_id,autor_nome,autor_funcao,texto,criado_em)
    VALUES (?,?,?,?,?,?,?,datetime('now'))`).run(id, req.usuario.empresa_id, key, req.usuario.id, req.usuario.nome, req.usuario.funcao_nome || null, texto);
  // Direcionar: cria tarefa para a pessoa escolhida (o comentário vira uma cobrança com dono).
  let tarefaId = null;
  const alvo = (req.body.direcionar_id || '').toString();
  if (alvo) {
    const pessoa = db.prepare('SELECT nome FROM colaboradores WHERE id=? AND empresa_id=?').get(alvo, req.usuario.empresa_id);
    if (pessoa) {
      tarefaId = uuidPC();
      const setor = key.replace('diretoria:', '');
      db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
        VALUES (?,?, 'tarefa','painel',?,?,?,?,'aberto',datetime('now'),datetime('now'))`)
        .run(tarefaId, req.usuario.empresa_id, key, `Painel da Gestão — ${setor}`.slice(0, 140), `${req.usuario.nome} direcionou a você no painel:\n\n"${texto}"`, alvo);
    }
  }
  res.status(201).json({ ok: true, id, tarefa_id: tarefaId });
});

// Pessoas do escritório (para direcionar um comentário/tarefa).
router.get('/pessoas', soEscritorio, (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.nome, f.nome funcao FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.escritorio=1 ORDER BY c.nome`).all(req.usuario.empresa_id);
  res.json({ pessoas: rows });
});
router.delete('/comentarios/:id', soEscritorio, (req, res) => {
  const c = db.prepare('SELECT autor_id FROM painel_comentarios WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Não encontrado.' });
  const gestor = ['Diretor Geral', 'Gestor Geral'].includes(req.usuario.funcao_nome);
  if (c.autor_id !== req.usuario.id && !gestor) return res.status(403).json({ erro: 'Só o autor ou a diretoria pode apagar.' });
  db.prepare('DELETE FROM painel_comentarios WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
// Contagem de comentários por chave (p/ mostrar badge sem carregar tudo).
router.get('/comentarios/contagem', soEscritorio, (req, res) => {
  const rows = db.prepare(`SELECT painel_key, COUNT(*) n, MAX(criado_em) ultimo FROM painel_comentarios WHERE empresa_id=? GROUP BY painel_key`).all(req.usuario.empresa_id);
  res.json({ contagem: Object.fromEntries(rows.map(r => [r.painel_key, { n: r.n, ultimo: r.ultimo }])) });
});

// Chat do escritório (sala única da gestão).
router.get('/chat', soEscritorio, (req, res) => {
  const rows = db.prepare(`SELECT id, autor_id, autor_nome, autor_funcao, texto, criado_em FROM gestao_chat
    WHERE empresa_id=? ORDER BY criado_em DESC LIMIT 60`).all(req.usuario.empresa_id);
  res.json({ mensagens: rows.reverse(), eu: req.usuario.id });
});
router.post('/chat', soEscritorio, (req, res) => {
  const texto = (req.body.texto || '').toString().trim().slice(0, 2000);
  if (!texto) return res.status(400).json({ erro: 'Mensagem vazia.' });
  const id = uuidPC();
  db.prepare(`INSERT INTO gestao_chat (id,empresa_id,autor_id,autor_nome,autor_funcao,texto,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, req.usuario.id, req.usuario.nome, req.usuario.funcao_nome || null, texto);
  res.status(201).json({ ok: true, id });
});

module.exports = router;
module.exports.calcularGerente = calcularGerente;
