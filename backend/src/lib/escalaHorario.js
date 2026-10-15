// escalaHorario.js — escala de horário previsto (semanal recorrente no mês + exceções por data).
// Usado p/ cruzar a chegada do colaborador (1ª batida) com o horário previsto − 5 min.
const { v4: uuid } = require('uuid');
const db = require('../db/connection');

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Grava o padrão SEMANAL de um colaborador para um mês (7 dias). dias = [{dia_semana, entrada, saida, folga}]
function salvarSemanal(empresaId, { lojaId, colaboradorId, ano, mes, dias, criadoPorId }) {
  const del = db.prepare('DELETE FROM escala_horario WHERE empresa_id=? AND colaborador_id=? AND ano=? AND mes=? AND dia_semana IS NOT NULL');
  const ins = db.prepare(`INSERT INTO escala_horario (id,empresa_id,loja_id,colaborador_id,ano,mes,dia_semana,data,entrada,saida,folga,criado_por_id)
    VALUES (?,?,?,?,?,?,?,NULL,?,?,?,?)`);
  const tx = db.transaction(() => {
    del.run(empresaId, colaboradorId, ano, mes);
    for (const d of dias || []) {
      if (d.dia_semana == null) continue;
      ins.run(uuid(), empresaId, lojaId || null, colaboradorId, ano, mes, Number(d.dia_semana),
        d.folga ? null : (d.entrada || null), d.folga ? null : (d.saida || null), d.folga ? 1 : 0, criadoPorId || null);
    }
  });
  tx();
  return { ok: true, dias: (dias || []).length };
}

// Exceção de um dia específico (override).
function salvarData(empresaId, { lojaId, colaboradorId, data, entrada, saida, folga, criadoPorId }) {
  const [ano, mes] = [Number(data.slice(0, 4)), Number(data.slice(5, 7))];
  db.prepare(`INSERT INTO escala_horario (id,empresa_id,loja_id,colaborador_id,ano,mes,dia_semana,data,entrada,saida,folga,criado_por_id)
    VALUES (?,?,?,?,?,?,NULL,?,?,?,?,?)
    ON CONFLICT(empresa_id,colaborador_id,ano,mes,IFNULL(dia_semana,-1),IFNULL(data,'')) DO UPDATE SET
      entrada=excluded.entrada, saida=excluded.saida, folga=excluded.folga`)
    .run(uuid(), empresaId, lojaId || null, colaboradorId, ano, mes, data, folga ? null : (entrada || null), folga ? null : (saida || null), folga ? 1 : 0, criadoPorId || null);
  return { ok: true };
}

// Escala de um colaborador num mês (padrão semanal + exceções).
function getEscala(empresaId, { colaboradorId, ano, mes }) {
  const rows = db.prepare(`SELECT dia_semana, data, entrada, saida, folga FROM escala_horario
    WHERE empresa_id=? AND colaborador_id=? AND ano=? AND mes=? ORDER BY dia_semana, data`).all(empresaId, colaboradorId, ano, mes);
  return {
    semanal: rows.filter(r => r.dia_semana != null),
    excecoes: rows.filter(r => r.data != null),
  };
}

// Horário previsto p/ um colaborador numa data: exceção do dia tem prioridade sobre o padrão semanal.
function horarioPrevisto(empresaId, colaboradorId, dataISO) {
  const d = new Date(dataISO + 'T12:00:00');
  const ano = d.getFullYear(), mes = d.getMonth() + 1, dow = d.getDay();
  const exc = db.prepare('SELECT entrada, saida, folga FROM escala_horario WHERE empresa_id=? AND colaborador_id=? AND data=?').get(empresaId, colaboradorId, dataISO);
  if (exc) return { entrada: exc.entrada, saida: exc.saida, folga: !!exc.folga, fonte: 'data' };
  const sem = db.prepare('SELECT entrada, saida, folga FROM escala_horario WHERE empresa_id=? AND colaborador_id=? AND ano=? AND mes=? AND dia_semana=?').get(empresaId, colaboradorId, ano, mes, dow);
  if (sem) return { entrada: sem.entrada, saida: sem.saida, folga: !!sem.folga, fonte: 'semanal' };
  return null; // sem escala lançada
}

// Colaboradores de uma loja que têm (ou não) escala no mês — p/ a tela de lançamento.
function colaboradoresLoja(empresaId, lojaId) {
  return db.prepare(`SELECT c.id, c.nome, f.nome funcao FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 ${lojaId ? 'AND c.loja_id=?' : ''} ORDER BY c.nome`).all(...(lojaId ? [empresaId, lojaId] : [empresaId]));
}

module.exports = { DIAS, salvarSemanal, salvarData, getEscala, horarioPrevisto, colaboradoresLoja };
