// mktAcoes.js — criação de AÇÃO de marketing fora da rota /mkt (reuso pelo Trade) + sync do calendário.
// Regra do Joe: todo espaço marcado "uso interno" (ocupado pela PRÓPRIA LOJA) gera automaticamente uma
// ação de "enviar para execução" pro Marketing — com material e prazo — e ela entra no calendário padrão.
// Desmarcar o uso interno (ou cancelar a venda) cancela essa ação automática. Idempotente.
const { v4: uuid } = require('uuid');
const db = require('../db/connection');

// Mesmo sync que o mkt.js usa: ação de marketing vira evento no calendário PADRÃO (agenda_evento, origem='marketing').
function syncEventoAgenda(emp, acaoId) {
  const a = db.prepare('SELECT id, titulo, tipo, data_ini, data_fim, hora FROM mkt_agenda WHERE id=? AND empresa_id=?').get(acaoId, emp);
  if (!a || !a.data_ini) { db.prepare("DELETE FROM agenda_evento WHERE empresa_id=? AND origem='marketing' AND ref_id=?").run(emp, acaoId); return; }
  const ex = db.prepare("SELECT id FROM agenda_evento WHERE empresa_id=? AND origem='marketing' AND ref_id=?").get(emp, acaoId);
  const titulo = '📣 ' + a.titulo;
  if (ex) db.prepare('UPDATE agenda_evento SET titulo=?, data=?, hora=?, fim=? WHERE id=?').run(titulo, a.data_ini, a.hora || null, a.data_fim || null, ex.id);
  else db.prepare(`INSERT INTO agenda_evento (id,empresa_id,titulo,descricao,data,hora,fim,local,cor,visibilidade,dono_id,origem,ref_id,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,'empresa',NULL,'marketing',?,?)`).run(uuid(), emp, titulo, 'Ação de marketing (' + (a.tipo || '') + ')', a.data_ini, a.hora || null, a.data_fim || null, null, '#E8730C', acaoId, 'sistema');
}
function removerEventoAgenda(emp, acaoId) { db.prepare("DELETE FROM agenda_evento WHERE empresa_id=? AND origem='marketing' AND (ref_id=? OR ref_id LIKE ?)").run(emp, acaoId, acaoId + ':%'); }

function diasAntes(emp) { try { const r = db.prepare('SELECT dias_antes FROM mkt_material_config WHERE empresa_id=?').get(emp); return r && Number.isFinite(r.dias_antes) ? r.dias_antes : 2; } catch (e) { return 2; } }
function menosDias(dataISO, n) { const d = new Date(dataISO + 'T00:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// meses (YYYY-MM) de ini..fim, no máx. 24 (evita loop em vigência aberta/errada).
function mesesDaVigencia(ini, fim) {
  const hoje = new Date().toISOString().slice(0, 7);
  let s = (ini && String(ini).slice(0, 7)) || hoje;
  let e = (fim && String(fim).slice(0, 7)) || s;
  if (e < s) e = s;
  const out = []; let d = new Date(s + '-01T00:00:00'); const end = new Date(e + '-01T00:00:00'); let cap = 0;
  while (d <= end && cap < 24) { out.push(d.toISOString().slice(0, 7)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); cap++; }
  return out;
}
// Para a ação de EXECUÇÃO (uso interno): mostra CADA MÊS no calendário, na data do prazo do material
// daquele mês (ref_id = acaoId:YYYY-MM). Substitui o evento único. Cancelada → remove todos.
function syncEventosExecucao(emp, acaoId) {
  removerEventoAgenda(emp, acaoId);
  const a = db.prepare('SELECT status FROM mkt_agenda WHERE id=? AND empresa_id=?').get(acaoId, emp);
  if (!a || a.status === 'cancelado') return;
  const mats = db.prepare("SELECT obs, prazo FROM mkt_material WHERE agenda_id=? AND tipo='execucao' AND obs IS NOT NULL AND prazo IS NOT NULL ORDER BY obs").all(acaoId);
  const ins = db.prepare(`INSERT INTO agenda_evento (id,empresa_id,titulo,descricao,data,hora,fim,local,cor,visibilidade,dono_id,origem,ref_id,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,'empresa',NULL,'marketing',?,?)`);
  for (const m of mats) {
    const [y, mm] = m.obs.split('-'); const rotulo = MESES_PT[Number(mm) - 1] + '/' + y;
    ins.run(uuid(), emp, '📣 Material p/ execução — ' + rotulo, 'Prazo do material do espaço (uso interno).', m.prazo, null, null, null, '#E8730C', acaoId + ':' + m.obs, 'sistema');
  }
}
// Garante 1 material "enviar p/ execução" por MÊS da vigência (prazo = 1º dia do mês − N). Idempotente:
// identifica o material do mês por obs='YYYY-MM'. Mês novo entra; meses que saíram da vigência e ainda
// estão intocados (a_fazer, sem comprovação) são removidos; os já trabalhados ficam.
function gerarMateriaisMensais(emp, agendaId, ini, fim, criadoPorId) {
  const meses = mesesDaVigencia(ini, fim);
  const n = diasAntes(emp);
  const existentes = db.prepare("SELECT id, obs, status, comprovacao FROM mkt_material WHERE agenda_id=? AND tipo='execucao'").all(agendaId);
  const porMes = {}; existentes.forEach(m => { if (m.obs) porMes[m.obs] = m; });
  const ins = db.prepare(`INSERT INTO mkt_material (id,empresa_id,agenda_id,tipo,descricao,prazo,status,obs,criado_por)
    VALUES (?,?,?,'execucao',?,?, 'a_fazer', ?, ?)`);
  for (const ym of meses) {
    if (porMes[ym]) continue;
    const [a, mm] = ym.split('-'); const rotulo = MESES_PT[Number(mm) - 1] + '/' + a;
    ins.run(uuid(), emp, agendaId, 'Material do espaço (uso interno) — enviar p/ execução · ' + rotulo, menosDias(ym + '-01', n), ym, criadoPorId || 'sistema');
  }
  // remove meses fora da vigência que estão intocados
  const setMeses = new Set(meses);
  for (const m of existentes) {
    if (m.obs && !setMeses.has(m.obs) && m.status === 'a_fazer' && !m.comprovacao) db.prepare('DELETE FROM mkt_material WHERE id=?').run(m.id);
  }
}

// Reaplica o estado de uma venda do Trade: uso_interno ligado => garante a AÇÃO de execução (+ material
// "enviar p/ execução" com prazo N dias antes); desligado/cancelado => cancela a ação automática.
// A ação automática é reconhecida por venda + tipo='execucao' (não mexe em ações manuais da mesma venda).
function sincronizarExecucaoUsoInterno(emp, vendaId, criadoPorId) {
  const v = db.prepare('SELECT id, codigo, tema_desc, vigencia_ini, vigencia_fim, uso_interno, status FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(vendaId, emp);
  if (!v) return null;
  const auto = db.prepare("SELECT id, status FROM mkt_agenda WHERE empresa_id=? AND tmkt_venda_id=? AND tipo='execucao' ORDER BY criado_em LIMIT 1").get(emp, vendaId);
  const cancelada = ['cancelado', 'recusado', 'perdido'].includes(v.status);
  const precisa = !!v.uso_interno && !cancelada;
  if (!precisa) {
    if (auto && auto.status !== 'cancelado') {
      db.prepare("UPDATE mkt_agenda SET status='cancelado', atualizado_em=datetime('now') WHERE id=?").run(auto.id);
      removerEventoAgenda(emp, auto.id);
    }
    return auto ? auto.id : null;
  }
  const dataAcao = (v.vigencia_ini && String(v.vigencia_ini).slice(0, 10)) || new Date().toISOString().slice(0, 10);
  const titulo = 'Enviar p/ execução — ' + (v.tema_desc || ('espaço ' + (v.codigo || 'uso interno')));
  if (auto) {
    db.prepare("UPDATE mkt_agenda SET status=CASE WHEN status='cancelado' THEN 'planejado' ELSE status END, titulo=?, data_ini=?, atualizado_em=datetime('now') WHERE id=?").run(titulo, dataAcao, auto.id);
    gerarMateriaisMensais(emp, auto.id, v.vigencia_ini, v.vigencia_fim, criadoPorId);
    syncEventosExecucao(emp, auto.id);
    return auto.id;
  }
  const id = uuid();
  db.prepare(`INSERT INTO mkt_agenda (id,empresa_id,titulo,tipo,canal,data_ini,status,descricao,envolvido_tipo,envolvido_nome,tmkt_venda_id,criado_por,criado_em)
    VALUES (?,?,?,'execucao',?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, emp, titulo, 'uso-interno', dataAcao, 'planejado',
      'Espaço ocupado pela própria loja (uso interno) — produzir e enviar o material para execução (mensal durante a vigência).',
      'loja', 'Própria loja', vendaId, criadoPorId || 'sistema');
  // 1 material "enviar p/ execução" por mês da vigência (prazo N dias antes do início de cada mês).
  gerarMateriaisMensais(emp, id, v.vigencia_ini, v.vigencia_fim, criadoPorId);
  syncEventosExecucao(emp, id);
  return id;
}

module.exports = { syncEventoAgenda, removerEventoAgenda, sincronizarExecucaoUsoInterno };
