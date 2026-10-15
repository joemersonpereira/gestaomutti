// lib/afastamento.js — utilitário para saber se um colaborador está afastado/em férias numa data.
const db = require('../db/connection');

// Retorna o afastamento ativo (ou null) do colaborador na data (YYYY-MM-DD). data_fim nula = aberto.
function afastamentoAtivo(empresaId, colaboradorId, dataISO) {
  const data = dataISO || new Date().toISOString().slice(0, 10);
  return db.prepare(`SELECT * FROM afastamentos
    WHERE empresa_id=? AND colaborador_id=? AND date(data_inicio)<=date(?)
      AND (data_fim IS NULL OR date(data_fim)>=date(?))
    ORDER BY data_inicio DESC LIMIT 1`).get(empresaId, colaboradorId, data, data);
}

function estaAfastado(empresaId, colaboradorId, dataISO) {
  return !!afastamentoAtivo(empresaId, colaboradorId, dataISO);
}

module.exports = { afastamentoAtivo, estaAfastado };
