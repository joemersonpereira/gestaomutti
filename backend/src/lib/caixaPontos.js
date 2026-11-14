// caixaPontos.js — Caixa Destaque por PONTOS (Joe 2026-11-11).
// Ranking TRIMESTRAL por operador, somando os critérios (valores configuráveis em caixa_pontos_regra):
//  AUTO (saem do ERP): diferença de caixa por faixa (-1/-5/-30), erro de sangria (-2, quebra origem 'sangria'),
//      modalidade errada (-1, "troca de forma" na conciliação de cartão).
//  AVULSO (lançado pela gestão): qualquer critério manual + ponto/diferença avulsos (caixa_pontos_lancamento).
// Cada contribuição guarda o CRITÉRIO que gerou (transparência). "Perdoar sem pontos" (apuração da diferença)
// tira a diferença do cálculo. Ganha quem alcança o mínimo (default 30). Pontualidade (Tangerino) e
// acerto, streaks (semanas consecutivas sem erro) e dias de erro consecutivos JÁ são calculados (via diasOperadorCaixa).
const db = require('../db/connection');
const t = require('./tesourariaErp');
const cc = require('./conciliacaoCartao');
const tang = require('./tangerino');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();

// Horário do mês (seg-sex) p/ validar pontualidade. Agora POR OPERADOR (colaborador_id).
// colaborador_id '' = padrão da loja (fallback); loja_id '' = vale p/ todas.
function getHorario(emp, { ano, mes, lojaId, colaboradorId } = {}) {
  const q = (lj, cid) => db.prepare('SELECT * FROM caixa_horario_mes WHERE empresa_id=? AND ano=? AND mes=? AND loja_id=? AND colaborador_id=?').get(emp, Number(ano), Number(mes), lj, cid);
  const cid = colaboradorId || '';
  // 1) operador na loja  2) operador global  3) padrão da loja  4) padrão global
  return (cid && (q(lojaId || '', cid) || q('', cid))) || q(lojaId || '', '') || (lojaId ? q('', '') : null);
}
function setHorario(emp, { ano, mes, lojaId, colaboradorId, entrada, saida_almoco, volta_almoco, saida, tolerancia_min }) {
  const lj = lojaId || '', cid = colaboradorId || '';
  const ex = db.prepare('SELECT id FROM caixa_horario_mes WHERE empresa_id=? AND ano=? AND mes=? AND loja_id=? AND colaborador_id=?').get(emp, Number(ano), Number(mes), lj, cid);
  if (ex) db.prepare('UPDATE caixa_horario_mes SET entrada=?, saida_almoco=?, volta_almoco=?, saida=?, tolerancia_min=?, atualizado_em=datetime(\'now\') WHERE id=?')
    .run(entrada || null, saida_almoco || null, volta_almoco || null, saida || null, Number(tolerancia_min) || 5, ex.id);
  else db.prepare('INSERT INTO caixa_horario_mes (id, empresa_id, ano, mes, loja_id, colaborador_id, entrada, saida_almoco, volta_almoco, saida, tolerancia_min) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(), emp, Number(ano), Number(mes), lj, cid, entrada || null, saida_almoco || null, volta_almoco || null, saida || null, Number(tolerancia_min) || 5);
  return { ok: true };
}
// Lista os horários cadastrados no mês (padrão + por operador), com o nome do colaborador.
function listarHorarios(emp, { ano, mes } = {}) {
  const rows = db.prepare(`SELECT h.*, c.nome colaborador_nome, l.nome loja_nome
    FROM caixa_horario_mes h LEFT JOIN colaboradores c ON c.id=h.colaborador_id LEFT JOIN lojas l ON l.id=h.loja_id
    WHERE h.empresa_id=? AND h.ano=? AND h.mes=? ORDER BY (h.colaborador_id=''), c.nome`).all(emp, Number(ano), Number(mes));
  return { ok: true, horarios: rows };
}
function removerHorario(emp, id) { db.prepare('DELETE FROM caixa_horario_mes WHERE empresa_id=? AND id=?').run(emp, id); return { ok: true }; }
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const pad = n => String(n).padStart(2, '0');

function trimestreRange(ano, tri) {
  const m0 = (Number(tri) - 1) * 3 + 1;            // 1,4,7,10
  const ini = `${ano}-${pad(m0)}-01`;
  const mEnd = m0 + 2;                              // 3,6,9,12
  const lastDay = new Date(Number(ano), mEnd, 0).getDate();
  const fim = `${ano}-${pad(mEnd)}-${pad(lastDay)}`;
  return { ini, fim };
}

// ── Ciclo de apuração CONFIGURÁVEL do Caixa Destaque (Joe 2026-11-11) ───────────
// A cada N meses (1/2/3/4/6/12) fechando no DIA DE CORTE (ex.: a cada 3 meses, dia 25 → 25).
// destaque_ciclo_meses (default 3 = trimestral) e destaque_dia_corte (default 1).
function cicloConfig(emp) {
  const g = k => { try { const r = db.prepare('SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave=?').get(emp, k); return r ? Number(r.valor) : null; } catch (e) { return null; } };
  let meses = g('destaque_ciclo_meses') || 3; if (![1, 2, 3, 4, 6, 12].includes(meses)) meses = 3;
  let diaCorte = g('destaque_dia_corte') || 1; diaCorte = Math.min(28, Math.max(1, diaCorte));
  return { meses, diaCorte, periodos: 12 / meses };
}
function setCiclo(emp, { meses, diaCorte } = {}) {
  const up = (k, v) => { const ex = db.prepare('SELECT 1 FROM tesouraria_config WHERE empresa_id=? AND chave=?').get(emp, k); if (ex) db.prepare('UPDATE tesouraria_config SET valor=? WHERE empresa_id=? AND chave=?').run(String(v), emp, k); else db.prepare('INSERT INTO tesouraria_config (empresa_id, chave, valor) VALUES (?,?,?)').run(emp, k, String(v)); };
  if (meses != null) { let m = Number(meses) || 3; if (![1, 2, 3, 4, 6, 12].includes(m)) m = 3; up('destaque_ciclo_meses', m); }
  if (diaCorte != null) up('destaque_dia_corte', Math.min(28, Math.max(1, Number(diaCorte) || 1)));
  return { ok: true };
}
const fmtD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Janela [ini, fim] (inclusive) do período `periodo` (1-based) no ano, conforme o ciclo configurado.
function periodoRange(emp, ano, periodo) {
  const { meses, diaCorte } = cicloConfig(emp);
  const p = Math.max(1, Number(periodo) || 1);
  const startMonth0 = (p - 1) * meses;             // 0-based mês de início dentro do ano
  const ini = new Date(Number(ano), startMonth0, diaCorte);
  const fimEx = new Date(Number(ano), startMonth0 + meses, diaCorte);  // exclusivo
  const fim = new Date(fimEx.getTime() - 86400000);  // último dia inclusive
  return { ini: fmtD(ini), fim: fmtD(fim), meses, diaCorte, periodos: 12 / meses };
}
// Em que (ano, periodo) cai a data de hoje, respeitando o dia de corte.
function periodoAtual(emp, hoje = new Date()) {
  const { meses, diaCorte } = cicloConfig(emp);
  let y = hoje.getFullYear(), m0 = hoje.getMonth();
  if (hoje.getDate() < diaCorte) { m0 -= 1; if (m0 < 0) { m0 = 11; y -= 1; } }
  return { ano: y, periodo: Math.floor(m0 / meses) + 1 };
}
// Rótulo amigável do período (ex.: "25/01 a 24/04/2026").
function periodoLabel(emp, ano, periodo) {
  const { ini, fim } = periodoRange(emp, ano, periodo);
  const br = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  return `${br(ini)} a ${br(fim)}/${fim.slice(0, 4)}`;
}

function regrasMapa(emp) {
  const m = {};
  db.prepare('SELECT chave, label, pontos, tipo, desclassifica, ativo FROM caixa_pontos_regra WHERE empresa_id=?').all(emp)
    .forEach(r => { m[r.chave] = r; });
  return m;
}
function minimo(emp) {
  try { const r = db.prepare("SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave='pontos_minimo_premiacao'").get(emp); return r ? (Number(r.valor) || 0) : 30; } catch (e) { return 30; }
}
function faixaDiferenca(valorAbs) {
  if (valorAbs <= 30) return 'dif_ate30';
  if (valorAbs <= 100) return 'dif_30a100';
  return 'dif_acima100';
}

async function rankingPontos(emp, { ano, tri, lojaId } = {}) {
  const atual = periodoAtual(emp);
  ano = Number(ano) || atual.ano;
  tri = Number(tri) || atual.periodo;             // "tri" agora = índice do período do ciclo configurado
  const { ini, fim, meses, diaCorte, periodos } = periodoRange(emp, ano, tri);
  const reg = regrasMapa(emp);
  const min = minimo(emp);
  const pts = ch => (reg[ch] && reg[ch].ativo !== 0 ? Number(reg[ch].pontos) || 0 : 0);
  const ativo = ch => reg[ch] && reg[ch].ativo !== 0;

  // acumulador por operador (nome)
  const ops = new Map();
  const get = nome => { const k = (nome || '—').trim() || '—'; if (!ops.has(k)) ops.set(k, { operador: k, total: 0, desclassificado: false, criterios: {} }); return ops.get(k); };
  const add = (nome, chave, pontos, n = 1) => {
    if (!pontos && !(reg[chave] && reg[chave].desclassifica)) { /* ainda registra o critério mesmo com 0? não */ }
    const o = get(nome);
    const c = o.criterios[chave] || { chave, label: (reg[chave] && reg[chave].label) || chave, pontos: 0, n: 0 };
    c.pontos += pontos; c.n += n; o.criterios[chave] = c; o.total += pontos;
    if (reg[chave] && reg[chave].desclassifica) o.desclassificado = true;
  };

  // 1) Diferenças de caixa + sangria (do ERP). Respeita "perdoar sem pontos".
  try {
    const q = await t.quebras(emp, { ini, fim, lojaId: lojaId || null });
    for (const d of (q.quebras || [])) {
      const perdoadoSemPontos = d.cobranca && d.cobranca.status === 'perdoado' && String(d.cobranca.observacao || '').startsWith('[sem pontos]');
      if (perdoadoSemPontos) continue;
      if (d.origem === 'sangria') { if (ativo('erro_sangria_dp')) add(d.operador, 'erro_sangria_dp', pts('erro_sangria_dp')); continue; }
      if (d.origem === 'correcao_cartao') continue; // modalidade errada entra pela conciliação (abaixo), não dobra
      const abs = Math.abs(Number(d.valor) || 0);
      if (abs <= 0) continue;
      const ch = faixaDiferenca(abs);
      if (ativo(ch)) add(d.operador, ch, pts(ch));
    }
  } catch (e) { /* ERP indisponível: segue sem diferença */ }

  // 2) Modalidade errada = "troca de forma" na conciliação de cartão, por operador.
  try {
    if (ativo('modalidade_errada')) {
      const corr = await cc.correcoes(emp, { ini, fim, lojaId: lojaId || null });
      for (const o of (corr.porOperador || [])) {
        if (!o.nome || o.nome === '—') continue;
        add(o.nome, 'modalidade_errada', pts('modalidade_errada') * (o.n || 0), o.n || 0);
      }
    }
  } catch (e) { /* conciliação indisponível */ }

  // 2b) Deixar venda/entrega na tela sem baixar = orçamento status 'A' que virou o dia (ERP), por operador.
  try {
    if (ativo('tela_sem_baixar')) {
      const vt = await t.vendasNaTela(emp, { ini, fim, lojaId: lojaId || null });
      for (const [nome, n] of Object.entries(vt.porOperador || {})) { if (n > 0) add(nome, 'tela_sem_baixar', pts('tela_sem_baixar') * n, n); }
    }
  } catch (e) { /* ERP indisponível */ }

  // 2c) Agilidade = retorno DENTRO do SLA no contato de desconto (tesouraria_apagar), por operador.
  try {
    if (ativo('agilidade')) {
      const rows = db.prepare(`SELECT operador, no_prazo FROM tesouraria_apagar
        WHERE empresa_id=? AND contato_em IS NOT NULL AND retorno_em IS NOT NULL
          AND substr(contato_em,1,10) >= ? AND substr(contato_em,1,10) <= ?`).all(emp, ini, fim);
      for (const r of rows) { if (r.no_prazo) add((r.operador || '—').trim(), 'agilidade', pts('agilidade')); }
    }
  } catch (e) { /* sem contatos */ }

  // 3) Lançamentos AVULSOS (pontos e critérios manuais) no período.
  try {
    const lanc = db.prepare(`SELECT operador_nome, regra_chave, SUM(pontos) pontos, COUNT(*) n
      FROM caixa_pontos_lancamento WHERE empresa_id=? AND data>=? AND data<=? GROUP BY operador_nome, regra_chave`).all(emp, ini, fim);
    for (const l of lanc) add(l.operador_nome, l.regra_chave || 'avulso', Number(l.pontos) || 0, Number(l.n) || 0);
  } catch (e) { /* sem lançamentos */ }

  // 4) ACERTO de caixa (fechamento sem quebra = diferença zero) — ponto positivo automático.
  try {
    if (ativo('acerto_caixa')) {
      const ac = await t.acertosCaixa(emp, { ini, fim, lojaId: lojaId || null });
      for (const [nome, n] of Object.entries(ac.porOperador || {})) { if (n > 0) add(nome, 'acerto_caixa', pts('acerto_caixa') * n, n); }
    }
  } catch (e) { /* ERP indisponível */ }

  // 4b) STREAKS: semanas consecutivas SEM erro (+5/+15/+30/+50) e dias de erro CONSECUTIVOS (−5/−10).
  //     Base = dias trabalhados por operador (fechamentocaixa) com flag de erro. Semana = Mon-based;
  //     gaps (semanas não trabalhadas) NÃO quebram a sequência de "sem errar" (folga não é erro).
  try {
    const usaStreak = ['sem_erro_1sem', 'sem_erro_2sem', 'sem_erro_3sem', 'sem_erro_4sem'].some(ativo);
    const usaDiasErro = ativo('erro_3dias') || ativo('erro_5dias');
    if (usaStreak || usaDiasErro) {
      const limiar = (() => { try { return t.getConfig(emp).limiar; } catch (e) { return 5; } })(); // micro-diferença (≤ limiar) NÃO é erro
      const dias = await t.diasOperadorCaixa(emp, { ini, fim, lojaId: lojaId || null, limiar });
      const semanaIdx = s => Math.floor((Date.parse(s + 'T00:00:00Z') / 86400000 + 3) / 7); // índice de semana (seg)
      const porOp = new Map();
      for (const d of (dias || [])) { const k = (d.operador || '—').trim() || '—'; if (!porOp.has(k)) porOp.set(k, []); porOp.get(k).push(d); }
      for (const [nome, lista] of porOp) {
        lista.sort((a, b) => a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0);
        if (usaStreak) {
          const wk = new Map(); // semana → errou?
          for (const d of lista) { const w = semanaIdx(d.dia); wk.set(w, (wk.get(w) || false) || !!d.errou); }
          let streak = 0, maxStreak = 0;
          for (const w of [...wk.keys()].sort((a, b) => a - b)) { if (!wk.get(w)) { streak++; if (streak > maxStreak) maxStreak = streak; } else streak = 0; }
          const ch = maxStreak >= 4 && ativo('sem_erro_4sem') ? 'sem_erro_4sem'
            : maxStreak >= 3 && ativo('sem_erro_3sem') ? 'sem_erro_3sem'
              : maxStreak >= 2 && ativo('sem_erro_2sem') ? 'sem_erro_2sem'
                : maxStreak >= 1 && ativo('sem_erro_1sem') ? 'sem_erro_1sem' : null;
          if (ch) add(nome, ch, pts(ch), 1);
        }
        if (usaDiasErro) {
          let run = 0, maxRun = 0, lastErr = null;
          for (const d of lista) {
            if (d.errou) { const cons = lastErr && ((Date.parse(d.dia) - Date.parse(lastErr)) / 86400000 === 1); run = cons ? run + 1 : 1; if (run > maxRun) maxRun = run; lastErr = d.dia; }
            else lastErr = null;
          }
          const ch = maxRun >= 5 && ativo('erro_5dias') ? 'erro_5dias' : maxRun >= 3 && ativo('erro_3dias') ? 'erro_3dias' : null;
          if (ch) add(nome, ch, pts(ch), 1);
        }
      }
    }
  } catch (e) { /* ERP indisponível: segue sem streak */ }

  // 5) PONTUALIDADE — 1ª batida do Tangerino vs o horário padrão do mês (atraso). Desclassifica acima de 30 min.
  try {
    const usaPont = ativo('pontual_1015') || ativo('pontual_1630') || ativo('pontual_mais30');
    if (usaPont && tang.habilitado()) {
      // mapa tangerino_id -> nome e id do colaborador (horário é POR OPERADOR)
      const tgNome = {}, tgId = {};
      db.prepare("SELECT id, nome, tangerino_id FROM colaboradores WHERE tangerino_id IS NOT NULL AND tangerino_id<>''").all()
        .forEach(c => { tgNome[String(c.tangerino_id)] = c.nome; tgId[String(c.tangerino_id)] = c.id; });
      const horCache = {}; // "cid|mm" -> horário (resolve operador→loja→global, com fallback)
      const horDe = (cid, mm) => { const k = cid + '|' + mm; if (!(k in horCache)) horCache[k] = getHorario(emp, { ano, mes: mm, lojaId: lojaId || '', colaboradorId: cid }); return horCache[k]; };
      const bat = await tang.todasBatidas({ startDate: ini, endDate: fim, employeeIds: Object.keys(tgNome) });
      const primeira = {}; // employeeId|dia -> ts mínimo
      for (const b of bat) {
        if (!b.dateIn) continue; const ts = Number(b.dateIn); const dia = new Date(ts).toISOString().slice(0, 10);
        const k = String(b.employeeId) + '|' + dia; if (!(k in primeira) || ts < primeira[k]) primeira[k] = ts;
      }
      for (const [k, ts] of Object.entries(primeira)) {
        const [eid, dia] = k.split('|'); const nome = tgNome[eid]; if (!nome) continue;
        const dow = new Date(dia + 'T12:00:00').getDay(); if (dow === 0 || dow === 6) continue; // só seg-sex
        const h = horDe(tgId[eid] || '', Number(dia.slice(5, 7))); if (!h || !h.entrada) continue;
        const [eh, em] = String(h.entrada).split(':').map(Number);
        const esperado = new Date(dia + 'T00:00:00'); esperado.setHours(eh || 0, em || 0, 0, 0);
        const atraso = Math.round((ts - esperado.getTime()) / 60000);
        if (atraso > 30 && ativo('pontual_mais30')) add(nome, 'pontual_mais30', 0);
        else if (atraso >= 16 && ativo('pontual_1630')) add(nome, 'pontual_1630', pts('pontual_1630'));
        else if (atraso >= 10 && ativo('pontual_1015')) add(nome, 'pontual_1015', pts('pontual_1015'));
      }
    }
  } catch (e) { /* Tangerino indisponível: segue sem pontualidade */ }

  const ranking = [...ops.values()].map(o => ({
    operador: o.operador, total: r2(o.total), desclassificado: o.desclassificado,
    elegivel: !o.desclassificado && o.total >= min,
    criterios: Object.values(o.criterios).sort((a, b) => a.pontos - b.pontos),
  })).sort((a, b) => (b.desclassificado ? -1 : 1) - (a.desclassificado ? -1 : 1) || b.total - a.total);

  return { ok: true, ano, tri, periodo: { ini, fim }, ciclo: { meses, diaCorte, periodos, label: periodoLabel(emp, ano, tri) }, minimo: min, ranking };
}

// Planilha de ponto do mês (Tangerino): entrada/saída por colaborador por dia + atraso vs horário padrão.
async function pontoMes(emp, { ano, mes, lojaId } = {}) {
  if (!tang.habilitado()) return { ok: false, erro: 'Tangerino não configurado.' };
  const ini = `${ano}-${pad(mes)}-01`;
  const lastDay = new Date(Number(ano), Number(mes), 0).getDate();
  const fim = `${ano}-${pad(mes)}-${pad(lastDay)}`;
  const h = getHorario(emp, { ano, mes, lojaId: lojaId || '' });
  const tgNome = {};
  db.prepare("SELECT nome, tangerino_id FROM colaboradores WHERE tangerino_id IS NOT NULL AND tangerino_id<>''").all().forEach(c => { tgNome[String(c.tangerino_id)] = c.nome; });
  const bat = await tang.todasBatidas({ startDate: ini, endDate: fim });
  const dias = {};
  for (const b of bat) {
    const ts = b.dateIn ? Number(b.dateIn) : null; if (!ts) continue;
    const dia = new Date(ts).toISOString().slice(0, 10);
    const k = String(b.employeeId) + '|' + dia;
    if (!dias[k]) dias[k] = { ins: [], outs: [] };
    dias[k].ins.push(ts); if (b.dateOut) dias[k].outs.push(Number(b.dateOut));
  }
  const hm = ts => new Date(ts).toTimeString().slice(0, 5);
  const rows = [];
  for (const [k, v] of Object.entries(dias)) {
    const [eid, dia] = k.split('|'); const nome = tgNome[eid] || ('Tangerino ' + eid);
    const entradaTs = Math.min(...v.ins); const saidaTs = v.outs.length ? Math.max(...v.outs) : Math.max(...v.ins);
    let atraso = '';
    if (h && h.entrada) { const [eh, em] = String(h.entrada).split(':').map(Number); const esp = new Date(dia + 'T00:00:00'); esp.setHours(eh || 0, em || 0, 0, 0); atraso = Math.round((entradaTs - esp.getTime()) / 60000); }
    const dow = new Date(dia + 'T12:00:00').getDay();
    rows.push({ colaborador: nome, data: dia, dia_semana: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dow], entrada: hm(entradaTs), saida: hm(saidaTs), atraso });
  }
  rows.sort((a, b) => a.colaborador.localeCompare(b.colaborador) || a.data.localeCompare(b.data));
  return { ok: true, horario: h || null, rows };
}

// Lançamento avulso de pontos OU de diferença (a diferença avulsa também é só pontos aqui).
function lancar(emp, { operador_nome, colaborador_id, loja_id, data, regra_chave, pontos, obs, usuario }) {
  if (!operador_nome) throw new Error('Informe o operador.');
  const d = (data || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const id = uuid();
  db.prepare(`INSERT INTO caixa_pontos_lancamento (id, empresa_id, colaborador_id, operador_nome, loja_id, data, regra_chave, pontos, origem, obs, por)
    VALUES (?,?,?,?,?,?,?,?, 'avulso', ?, ?)`)
    .run(id, emp, colaborador_id || null, String(operador_nome).trim(), loja_id || null, d, regra_chave || 'avulso', Math.round(Number(pontos) || 0), obs || null, (usuario && (usuario.nome || usuario.id)) || null);
  return { ok: true, id };
}
function listarLancamentos(emp, { ano, tri } = {}) {
  const atual = periodoAtual(emp);
  const { ini, fim } = periodoRange(emp, Number(ano) || atual.ano, Number(tri) || atual.periodo);
  const rows = db.prepare('SELECT * FROM caixa_pontos_lancamento WHERE empresa_id=? AND data>=? AND data<=? ORDER BY data DESC, criado_em DESC').all(emp, ini, fim);
  return { ok: true, lancamentos: rows };
}
function removerLancamento(emp, id) {
  db.prepare('DELETE FROM caixa_pontos_lancamento WHERE empresa_id=? AND id=?').run(emp, id);
  return { ok: true };
}

// Snapshot persistente do ranking: abre na hora o último salvo; recalcula só com forcar.
function rankingSnapshot(emp, ano, periodo, lojaId) {
  const row = db.prepare('SELECT payload, atualizado_em FROM caixa_ranking_cache WHERE empresa_id=? AND ano=? AND periodo=? AND loja_id=?').get(emp, Number(ano), Number(periodo), lojaId || '');
  if (!row || !row.payload) return null;
  try { return { payload: JSON.parse(row.payload), atualizado_em: row.atualizado_em }; } catch (e) { return null; }
}
async function rankingComCache(emp, { ano, tri, lojaId, forcar } = {}) {
  const atual = periodoAtual(emp);
  ano = Number(ano) || atual.ano;
  tri = Number(tri) || atual.periodo;
  const lj = lojaId || '';
  if (!forcar) {
    const snap = rankingSnapshot(emp, ano, tri, lj);
    if (snap) return { ...snap.payload, ano, tri, cache: { salvo: true, atualizado_em: snap.atualizado_em } };
  }
  const r = await rankingPontos(emp, { ano, tri, lojaId: lojaId || null });
  try {
    db.prepare(`INSERT INTO caixa_ranking_cache (empresa_id, ano, periodo, loja_id, payload, atualizado_em) VALUES (?,?,?,?,?, datetime('now'))
      ON CONFLICT(empresa_id,ano,periodo,loja_id) DO UPDATE SET payload=excluded.payload, atualizado_em=excluded.atualizado_em`).run(emp, ano, tri, lj, JSON.stringify(r));
  } catch (e) { /* cache é opcional */ }
  const row = db.prepare('SELECT atualizado_em FROM caixa_ranking_cache WHERE empresa_id=? AND ano=? AND periodo=? AND loja_id=?').get(emp, ano, tri, lj);
  return { ...r, cache: { salvo: false, atualizado_em: row ? row.atualizado_em : null } };
}

module.exports = { rankingPontos, rankingComCache, lancar, listarLancamentos, removerLancamento, trimestreRange, getHorario, setHorario, listarHorarios, removerHorario, pontoMes, cicloConfig, setCiclo, periodoRange, periodoAtual, periodoLabel };
