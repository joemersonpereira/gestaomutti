// pontorepColeta.js — COLETA de batidas (imutável, NSR por estabelecimento, hash encadeado)
// e APURAÇÃO diária (batida × escala prevista → atraso/HE/noturno/falta/saldo).
const db = require('../db/connection');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const P = require('./pontorep');

const addDias = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (ini, fim) => { const o = []; let d = ini; while (d <= fim) { o.push(d); d = addDias(d, 1); } return o; };
const minDoDia = (dh) => { const t = String(dh).slice(11, 16).split(':').map(Number); return (t[0] || 0) * 60 + (t[1] || 0); };
// overlap de um intervalo [a,b] (min do dia) com a janela noturna 22h–5h
const noturnoOverlap = (a, b) => { let n = 0; for (const [x, y] of [[1320, 1440], [0, 300]]) n += Math.max(0, Math.min(b, y) - Math.max(a, x)); return n; };

// ───────── Bater ponto: grava batida ORIGINAL imutável ─────────
function baterPonto(emp, { colaboradorId, lojaId, tipoIdent = 'P', origem = 'W', latitude, longitude, facialOk = true, gpsOff = false, fakeGps = false }) {
  if (!colaboradorId || !lojaId) return { erro: 'Informe colaborador e loja.' };
  const estab = db.prepare(`SELECT id FROM pontorep_estabelecimento WHERE empresa_id=? AND loja_id=?`).get(emp, lojaId);
  if (!estab) return { erro: 'Estabelecimento não encontrado para a loja.' };
  // sinais de suspeita → marca a batida como PENDENTE (para revisão do RH); a batida entra assim mesmo (671)
  const motivos = [];
  if (!facialOk) motivos.push('reconhecimento facial falhou');
  if (gpsOff) motivos.push('GPS desativado');
  if (fakeGps) motivos.push('suspeita de Fake GPS');
  const pendente = motivos.length ? 1 : 0;
  const tx = db.transaction(() => {
    const ult = db.prepare(`SELECT nsr, hash FROM pontorep_marcacao WHERE estabelecimento_id=? ORDER BY nsr DESC LIMIT 1`).get(estab.id);
    const nsr = (ult?.nsr || 0) + 1;
    const dh = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const base = JSON.stringify({ e: estab.id, nsr, c: colaboradorId, dh, t: tipoIdent, o: origem });
    const hash = crypto.createHash('sha256').update(base + (ult?.hash || '')).digest('hex');
    const id = uuid();
    db.prepare(`INSERT INTO pontorep_marcacao (id,empresa_id,estabelecimento_id,nsr,colaborador_id,data_hora,tipo_ident,origem,latitude,longitude,hash,hash_anterior,facial_ok,pendente,motivo_pendencia,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(id, emp, estab.id, nsr, colaboradorId, dh, tipoIdent, origem, latitude || null, longitude || null, hash, ult?.hash || null, facialOk ? 1 : 0, pendente, motivos.join('; ') || null);
    return { id, nsr, dh, hash: hash.slice(0, 12), pendente };
  });
  const r = tx();
  return { ok: true, ...r };
}

// batidas PENDENTES (suspeitas) para revisão do RH — com o status da revisão (se houver)
function batidasPendentes(emp, { pendentesSo = true } = {}) {
  return db.prepare(`SELECT m.id, m.data_hora, m.motivo_pendencia, m.facial_ok, c.nome colaborador_nome, es.loja_id,
      rv.status revisao_status, rv.motivo revisao_motivo, rv.revisado_em
    FROM pontorep_marcacao m
    LEFT JOIN colaboradores c ON c.id=m.colaborador_id
    LEFT JOIN pontorep_estabelecimento es ON es.id=m.estabelecimento_id
    LEFT JOIN pontorep_marcacao_revisao rv ON rv.marcacao_id=m.id
    WHERE m.empresa_id=? ${pendentesSo ? 'AND m.pendente=1' : ''}
    ORDER BY (rv.status IS NOT NULL), m.data_hora DESC LIMIT 300`).all(emp);
}
// RH revisa a batida suspeita (NÃO altera a batida — grava na tabela de revisão)
function revisarMarcacao(emp, marcacaoId, { status, motivo }, usuario) {
  if (!['aprovada', 'rejeitada'].includes(status)) return { erro: 'Status inválido.' };
  db.prepare(`INSERT INTO pontorep_marcacao_revisao (id,empresa_id,marcacao_id,status,motivo,revisado_por_id,revisado_em)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,marcacao_id) DO UPDATE SET status=excluded.status, motivo=excluded.motivo, revisado_por_id=excluded.revisado_por_id, revisado_em=excluded.revisado_em`)
    .run(uuid(), emp, marcacaoId, status, motivo || null, usuario?.id || null);
  return { ok: true };
}

const batidasDia = (emp, colabId, data) => db.prepare(
  `SELECT id, nsr, data_hora, tipo_ident, origem FROM pontorep_marcacao WHERE empresa_id=? AND colaborador_id=? AND date(data_hora)=? ORDER BY data_hora`
).all(emp, colabId, data);

// escala prevista do colaborador naquele dia (a mais recente que cobre a data)
function previstoDia(emp, colabId, data) {
  return db.prepare(`SELECT ed.folga, ed.entrada, ed.saida, ed.intervalo_min, ed.jornada_min
    FROM pontorep_escala_dia ed JOIN pontorep_escala e ON e.id=ed.escala_id
    WHERE e.empresa_id=? AND e.colaborador_id=? AND ed.data=? ORDER BY e.criado_em DESC LIMIT 1`).get(emp, colabId, data) || null;
}

// batidas EFETIVAS do dia: usa o TRATAMENTO do RH quando existe (camada por cima), senão a original
function batidasEfetivas(emp, colabId, data) {
  const trat = db.prepare(`SELECT horarios_json FROM pontorep_tratamento WHERE empresa_id=? AND colaborador_id=? AND data=?`).get(emp, colabId, data);
  if (trat) {
    let hs = []; try { hs = JSON.parse(trat.horarios_json || '[]'); } catch { hs = []; }
    const mins = hs.map(h => { const [H, M] = String(h).split(':').map(Number); return (H || 0) * 60 + (M || 0); }).filter(n => n >= 0).sort((a, b) => a - b);
    return { mins, manual: true };
  }
  const bat = batidasDia(emp, colabId, data);
  return { mins: bat.map(b => minDoDia(b.data_hora)).sort((a, b) => a - b), manual: false };
}

// ───────── Apura um dia (batida × previsto) ─────────
function apurarDia(emp, colabId, data) {
  const prev = previstoDia(emp, colabId, data);
  const tol = Number(P.param(emp, 'tolerancia_dia_min', 10));
  const previstoMin = prev && !prev.folga ? Number(prev.jornada_min) || 0 : 0;
  const folga = prev && prev.folga ? 1 : 0;

  // pares entrada/saída (efetivas — respeita o tratamento do RH)
  const { mins } = batidasEfetivas(emp, colabId, data);
  let trabalhado = 0, noturno = 0;
  for (let i = 0; i + 1 < mins.length; i += 2) { trabalhado += mins[i + 1] - mins[i]; noturno += noturnoOverlap(mins[i], mins[i + 1]); }
  const incompleto = mins.length % 2 === 1;

  let atraso = 0;
  if (prev && !prev.folga && prev.entrada && mins.length) {
    const entPrev = (Number(prev.entrada.slice(0, 2)) * 60) + Number(prev.entrada.slice(3, 5));
    atraso = Math.max(0, mins[0] - entPrev - tol);
  }
  const extra = previstoMin > 0 ? Math.max(0, trabalhado - previstoMin - tol) : (folga ? trabalhado : 0);
  const falta = previstoMin > 0 && mins.length === 0 ? 1 : 0;
  const saldo = trabalhado - previstoMin;
  const status = folga ? (trabalhado > 0 ? 'extra' : 'folga')
    : falta ? 'falta' : incompleto ? 'incompleto' : atraso > 0 ? 'atraso' : extra > 0 ? 'extra' : 'ok';

  // Motor de INCONSISTÊNCIAS (só as habilitadas em Configurações)
  const inc = [];
  const on = k => Number(P.cfg(emp, k, 1)) === 1;
  const limiteDia = Number(P.param(emp, 'jornada_diaria_max_min', 480));
  const heMax = Number(P.param(emp, 'he_max_dia_min', 120));
  if (!folga) {
    if (on('inc.ponto_aberto') && incompleto) inc.push('Ponto em aberto');
    if (on('inc.falta') && falta) inc.push('Falta');
    if (on('inc.he_2h_dia') && extra > heMax) inc.push('Hora extra acima de 2h');
    if (on('inc.jornada_max') && trabalhado > limiteDia + heMax) inc.push('Jornada acima do limite');
    if (on('inc.saldo_negativo') && saldo < -Number(P.cfg(emp, 'inc.saldo_negativo_min', 600))) inc.push('Saldo negativo elevado');
  }
  const incJson = inc.length ? JSON.stringify(inc) : null;

  db.prepare(`INSERT INTO pontorep_apuracao_dia (id,empresa_id,colaborador_id,data,previsto_min,trabalhado_min,atraso_min,extra_min,noturno_min,saldo_min,falta,folga,batidas,status,inconsistencias,apurado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,colaborador_id,data) DO UPDATE SET previsto_min=excluded.previsto_min, trabalhado_min=excluded.trabalhado_min,
      atraso_min=excluded.atraso_min, extra_min=excluded.extra_min, noturno_min=excluded.noturno_min, saldo_min=excluded.saldo_min,
      falta=excluded.falta, folga=excluded.folga, batidas=excluded.batidas, status=excluded.status, inconsistencias=excluded.inconsistencias, apurado_em=excluded.apurado_em`)
    .run(uuid(), emp, colabId, data, previstoMin, trabalhado, atraso, extra, noturno, saldo, falta, folga, mins.length, status, incJson);

  return { data, previstoMin, trabalhado, atraso, extra, noturno, saldo, falta, folga, batidas: mins.length, incompleto, status, inconsistencias: inc };
}

// Apura um período (todos os colaboradores que têm escala ou batida no intervalo)
function apurarPeriodo(emp, { dataIni, dataFim, colaboradorId }) {
  const dias = diasEntre(dataIni, dataFim);
  let colabs;
  if (colaboradorId) colabs = [{ id: colaboradorId }];
  else colabs = db.prepare(`
    SELECT DISTINCT colaborador_id id FROM (
      SELECT e.colaborador_id FROM pontorep_escala e JOIN pontorep_escala_dia ed ON ed.escala_id=e.id
        WHERE e.empresa_id=? AND ed.data BETWEEN ? AND ?
      UNION
      SELECT colaborador_id FROM pontorep_marcacao WHERE empresa_id=? AND date(data_hora) BETWEEN ? AND ?)`
  ).all(emp, dataIni, dataFim, emp, dataIni, dataFim);
  let n = 0;
  for (const c of colabs) { for (const d of dias) { apurarDia(emp, c.id, d); n++; } passeMultiDia(emp, c.id, dataIni, dataFim); }
  return { ok: true, colaboradores: colabs.length, diasApurados: n };
}

// Passe pós-apuração: inconsistências que precisam de contexto de VÁRIOS dias
function passeMultiDia(emp, colabId, ini, fim) {
  const on = k => Number(P.cfg(emp, k, 1)) === 1;
  if (!on('inc.interjornada_11h') && !on('inc.he_10h_semana') && !on('inc.dias_sem_folga')) return;
  const interMin = Number(P.param(emp, 'interjornada_min_min', 660));
  const consecMax = Number(P.param(emp, 'dias_consecutivos_max', 6));
  const rows = db.prepare(`SELECT data, extra_min, folga, batidas FROM pontorep_apuracao_dia WHERE empresa_id=? AND colaborador_id=? AND data BETWEEN ? AND ? ORDER BY data`).all(emp, colabId, ini, fim);
  const addFlag = {};
  const push = (d, f) => { (addFlag[d] = addFlag[d] || []).push(f); };
  if (on('inc.interjornada_11h')) {
    for (let i = 1; i < rows.length; i++) {
      if ((new Date(rows[i].data) - new Date(rows[i - 1].data)) / 864e5 !== 1) continue;
      const { mins: pm } = batidasEfetivas(emp, colabId, rows[i - 1].data);
      const { mins: cm } = batidasEfetivas(emp, colabId, rows[i].data);
      if (!pm.length || !cm.length) continue;
      const gap = (1440 - Math.max(...pm)) + Math.min(...cm);
      if (gap < interMin) push(rows[i].data, `Interjornada < ${interMin / 60}h`);
    }
  }
  if (on('inc.dias_sem_folga')) {
    let streak = 0;
    for (const r of rows) { if (r.folga) { streak = 0; continue; } streak++; if (streak > consecMax) push(r.data, `${streak} dias sem folga`); }
  }
  if (on('inc.he_10h_semana')) {
    for (let i = 0; i < rows.length; i += 7) {
      const jan = rows.slice(i, i + 7); const soma = jan.reduce((a, d) => a + (d.extra_min || 0), 0);
      if (soma > 600 && jan.length) push(jan[jan.length - 1].data, 'HE acima de 10h na semana');
    }
  }
  for (const [data, flags] of Object.entries(addFlag)) {
    const cur = db.prepare(`SELECT inconsistencias FROM pontorep_apuracao_dia WHERE empresa_id=? AND colaborador_id=? AND data=?`).get(emp, colabId, data);
    let arr = []; try { arr = JSON.parse(cur?.inconsistencias || '[]'); } catch { arr = []; }
    for (const f of flags) if (!arr.includes(f)) arr.push(f);
    db.prepare(`UPDATE pontorep_apuracao_dia SET inconsistencias=? WHERE empresa_id=? AND colaborador_id=? AND data=?`).run(JSON.stringify(arr), emp, colabId, data);
  }
}

const apuracaoPeriodo = (emp, colabId, ini, fim) => db.prepare(
  `SELECT * FROM pontorep_apuracao_dia WHERE empresa_id=? AND colaborador_id=? AND data BETWEEN ? AND ? ORDER BY data`
).all(emp, colabId, ini, fim);

// Espelho de ponto (apuração + batidas) de um colaborador num período — no layout Folha de Ponto
function espelho(emp, colabId, ini, fim) {
  const ap = apuracaoPeriodo(emp, colabId, ini, fim);
  const bat = db.prepare(`SELECT date(data_hora) dia, group_concat(substr(data_hora,12,5),' ') horas
    FROM pontorep_marcacao WHERE empresa_id=? AND colaborador_id=? AND date(data_hora) BETWEEN ? AND ? GROUP BY date(data_hora)`).all(emp, colabId, ini, fim);
  const batMap = Object.fromEntries(bat.map(b => [b.dia, b.horas]));
  // dias com tratamento manual do RH → marca "(m)" e usa os horários tratados
  const trats = db.prepare(`SELECT data, horarios_json FROM pontorep_tratamento WHERE empresa_id=? AND colaborador_id=? AND data BETWEEN ? AND ?`).all(emp, colabId, ini, fim);
  for (const t of trats) { let hs = []; try { hs = JSON.parse(t.horarios_json || '[]'); } catch { hs = []; } batMap[t.data] = '(m) ' + hs.join(' '); }
  const tot = ap.reduce((a, d) => ({ prev: a.prev + d.previsto_min, trab: a.trab + d.trabalhado_min, atraso: a.atraso + d.atraso_min, extra: a.extra + d.extra_min, noturno: a.noturno + d.noturno_min, saldo: a.saldo + d.saldo_min, faltas: a.faltas + d.falta }), { prev: 0, trab: 0, atraso: 0, extra: 0, noturno: 0, saldo: 0, faltas: 0 });
  // cabeçalho: colaborador + empregador (estabelecimento da loja dele)
  const col = db.prepare(`SELECT c.nome, c.cpf, c.admissao, c.loja_id, c.email, f.nome cargo
    FROM colaboradores c LEFT JOIN funcoes f ON f.id=c.funcao_id WHERE c.id=?`).get(colabId) || {};
  const est = col.loja_id ? db.prepare(`SELECT razao_social, cnpj, loja_id FROM pontorep_estabelecimento WHERE empresa_id=? AND loja_id=?`).get(emp, col.loja_id) : null;
  return {
    periodo: { ini, fim },
    colaborador: { nome: col.nome || '', cpf: col.cpf || '', admissao: col.admissao || '', cargo: col.cargo || '', loja: col.loja_id || '', email: col.email || '' },
    empregador: { razao_social: est?.razao_social || (col.loja_id || ''), cnpj: est?.cnpj || '', local: col.loja_id || '' },
    dias: ap.map(d => ({ ...d, batidas_horas: batMap[d.data] || '' })),
    totais: tot,
  };
}

// ───────── Apropriação de Horas (RH ajusta correções via tratamento) ─────────
const diasEntreP = (ini, fim) => diasEntre(ini, fim);
function apropriacao(emp, colabId, ini, fim) {
  const dias = diasEntreP(ini, fim);
  return dias.map(data => {
    const orig = batidasDia(emp, colabId, data).map(b => String(b.data_hora).slice(11, 16));
    const trat = db.prepare(`SELECT horarios_json, motivo, tipo FROM pontorep_tratamento WHERE empresa_id=? AND colaborador_id=? AND data=?`).get(emp, colabId, data);
    let horarios = orig; let manual = false; let motivo = '';
    if (trat) { try { horarios = JSON.parse(trat.horarios_json || '[]'); } catch { horarios = []; } manual = true; motivo = trat.motivo || ''; }
    const prev = previstoDia(emp, colabId, data);
    const ap = db.prepare(`SELECT trabalhado_min, previsto_min, saldo_min, status, folga, inconsistencias FROM pontorep_apuracao_dia WHERE empresa_id=? AND colaborador_id=? AND data=?`).get(emp, colabId, data) || {};
    let inc = []; try { inc = JSON.parse(ap.inconsistencias || '[]'); } catch { inc = []; }
    return { data, originais: orig, horarios, manual, motivo, folga: prev?.folga ? 1 : 0, previstoEntrada: prev?.entrada || '', previstoSaida: prev?.saida || '',
      trabalhado_min: ap.trabalhado_min || 0, previsto_min: ap.previsto_min || 0, saldo_min: ap.saldo_min || 0, status: ap.status || '', inconsistencias: inc };
  });
}
function salvarTratamento(emp, { colaboradorId, data, horarios, tipo, motivo }, usuario) {
  if (!colaboradorId || !data) return { erro: 'Informe colaborador e data.' };
  const hs = (Array.isArray(horarios) ? horarios : String(horarios || '').split(/[\s,;]+/)).map(h => h.trim()).filter(h => /^\d{1,2}:\d{2}$/.test(h));
  db.prepare(`INSERT INTO pontorep_tratamento (id,empresa_id,colaborador_id,data,horarios_json,tipo,motivo,autor_id,criado_em)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,colaborador_id,data) DO UPDATE SET horarios_json=excluded.horarios_json, tipo=excluded.tipo, motivo=excluded.motivo, autor_id=excluded.autor_id, atualizado_em=datetime('now')`)
    .run(require('uuid').v4(), emp, colaboradorId, data, JSON.stringify(hs), tipo || 'ajuste', motivo || null, usuario?.id || null);
  const r = apurarDia(emp, colaboradorId, data); // re-apura o dia com o tratamento
  return { ok: true, horarios: hs, apuracao: r };
}
function removerTratamento(emp, colabId, data) {
  db.prepare(`DELETE FROM pontorep_tratamento WHERE empresa_id=? AND colaborador_id=? AND data=?`).run(emp, colabId, data);
  const r = apurarDia(emp, colabId, data); // volta a apurar com a batida original
  return { ok: true, apuracao: r };
}

// ───────── Relatório de Folha de Ponto (consolidado por filtro) ─────────
function relatorioConsolidado(emp, { lojaId, funcaoId, ini, fim, apurar = true }) {
  let q = `SELECT id, nome FROM colaboradores WHERE empresa_id=? AND ativo=1`; const args = [emp];
  if (lojaId) { q += ' AND loja_id=?'; args.push(lojaId); }
  if (funcaoId) { q += ' AND funcao_id=?'; args.push(funcaoId); }
  const colabs = db.prepare(q + ' ORDER BY nome').all(...args);
  const linhas = colabs.map(c => {
    if (apurar) apurarPeriodo(emp, { dataIni: ini, dataFim: fim, colaboradorId: c.id });
    const t = db.prepare(`SELECT COALESCE(SUM(trabalhado_min),0) trab, COALESCE(SUM(previsto_min),0) prev,
      COALESCE(SUM(atraso_min),0) atraso, COALESCE(SUM(extra_min),0) extra, COALESCE(SUM(saldo_min),0) saldo, COALESCE(SUM(falta),0) faltas
      FROM pontorep_apuracao_dia WHERE empresa_id=? AND colaborador_id=? AND data BETWEEN ? AND ?`).get(emp, c.id, ini, fim);
    return { id: c.id, nome: c.nome, ...t };
  });
  return { periodo: { ini, fim }, linhas };
}

module.exports = { baterPonto, batidasDia, batidasEfetivas, apurarDia, apurarPeriodo, apuracaoPeriodo, espelho, apropriacao, salvarTratamento, removerTratamento, batidasPendentes, revisarMarcacao, relatorioConsolidado };
