// caixaPontos.js — Caixa Destaque por PONTOS (Joe 2026-11-11).
// Ranking TRIMESTRAL por operador, somando os critérios (valores configuráveis em caixa_pontos_regra):
//  AUTO (saem do ERP): diferença de caixa por faixa (-1/-5/-30), erro de sangria (-2, quebra origem 'sangria'),
//      modalidade errada (-1, "troca de forma" na conciliação de cartão).
//  AVULSO (lançado pela gestão): qualquer critério manual + ponto/diferença avulsos (caixa_pontos_lancamento).
// Cada contribuição guarda o CRITÉRIO que gerou (transparência). "Perdoar sem pontos" (apuração da diferença)
// tira a diferença do cálculo. Ganha quem alcança o mínimo (default 30). Pontualidade (Tangerino) e
// acerto/streaks ficam p/ a próxima fatia (precisam da escala de horário).
const db = require('../db/connection');
const t = require('./tesourariaErp');
const cc = require('./conciliacaoCartao');
const tang = require('./tangerino');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();

// Horário padrão do mês (seg-sex) p/ validar pontualidade. loja_id '' = vale p/ todas.
function getHorario(emp, { ano, mes, lojaId } = {}) {
  const q = (lj) => db.prepare('SELECT * FROM caixa_horario_mes WHERE empresa_id=? AND ano=? AND mes=? AND loja_id=?').get(emp, Number(ano), Number(mes), lj);
  return q(lojaId || '') || (lojaId ? q('') : null); // tenta a da loja; cai no global
}
function setHorario(emp, { ano, mes, lojaId, entrada, saida_almoco, volta_almoco, saida, tolerancia_min }) {
  const lj = lojaId || '';
  const ex = db.prepare('SELECT id FROM caixa_horario_mes WHERE empresa_id=? AND ano=? AND mes=? AND loja_id=?').get(emp, Number(ano), Number(mes), lj);
  if (ex) db.prepare('UPDATE caixa_horario_mes SET entrada=?, saida_almoco=?, volta_almoco=?, saida=?, tolerancia_min=?, atualizado_em=datetime(\'now\') WHERE id=?')
    .run(entrada || null, saida_almoco || null, volta_almoco || null, saida || null, Number(tolerancia_min) || 5, ex.id);
  else db.prepare('INSERT INTO caixa_horario_mes (id, empresa_id, ano, mes, loja_id, entrada, saida_almoco, volta_almoco, saida, tolerancia_min) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(), emp, Number(ano), Number(mes), lj, entrada || null, saida_almoco || null, volta_almoco || null, saida || null, Number(tolerancia_min) || 5);
  return { ok: true };
}
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
  const hoje = new Date();
  ano = Number(ano) || hoje.getFullYear();
  tri = Number(tri) || (Math.floor(hoje.getMonth() / 3) + 1);
  const { ini, fim } = trimestreRange(ano, tri);
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

  // 5) PONTUALIDADE — 1ª batida do Tangerino vs o horário padrão do mês (atraso). Desclassifica acima de 30 min.
  try {
    const usaPont = ativo('pontual_1015') || ativo('pontual_1630') || ativo('pontual_mais30');
    if (usaPont && tang.habilitado()) {
      // mapa tangerino_id -> nome do colaborador
      const tgNome = {};
      db.prepare("SELECT nome, tangerino_id FROM colaboradores WHERE tangerino_id IS NOT NULL AND tangerino_id<>''").all()
        .forEach(c => { tgNome[String(c.tangerino_id)] = c.nome; });
      // horário de cada mês do trimestre
      const m0 = (Number(tri) - 1) * 3 + 1;
      const hor = {}; [m0, m0 + 1, m0 + 2].forEach(mm => { hor[mm] = getHorario(emp, { ano, mes: mm, lojaId: lojaId || '' }); });
      const bat = await tang.todasBatidas({ startDate: ini, endDate: fim });
      const primeira = {}; // employeeId|dia -> ts mínimo
      for (const b of bat) {
        if (!b.dateIn) continue; const ts = Number(b.dateIn); const dia = new Date(ts).toISOString().slice(0, 10);
        const k = String(b.employeeId) + '|' + dia; if (!(k in primeira) || ts < primeira[k]) primeira[k] = ts;
      }
      for (const [k, ts] of Object.entries(primeira)) {
        const [eid, dia] = k.split('|'); const nome = tgNome[eid]; if (!nome) continue;
        const dow = new Date(dia + 'T12:00:00').getDay(); if (dow === 0 || dow === 6) continue; // só seg-sex
        const h = hor[Number(dia.slice(5, 7))]; if (!h || !h.entrada) continue;
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

  return { ok: true, ano, tri, periodo: { ini, fim }, minimo: min, ranking };
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
  const hoje = new Date();
  const { ini, fim } = trimestreRange(Number(ano) || hoje.getFullYear(), Number(tri) || (Math.floor(hoje.getMonth() / 3) + 1));
  const rows = db.prepare('SELECT * FROM caixa_pontos_lancamento WHERE empresa_id=? AND data>=? AND data<=? ORDER BY data DESC, criado_em DESC').all(emp, ini, fim);
  return { ok: true, lancamentos: rows };
}
function removerLancamento(emp, id) {
  db.prepare('DELETE FROM caixa_pontos_lancamento WHERE empresa_id=? AND id=?').run(emp, id);
  return { ok: true };
}

module.exports = { rankingPontos, lancar, listarLancamentos, removerLancamento, trimestreRange, getHorario, setHorario, pontoMes };
