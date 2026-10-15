// afastamentoSync.js — ao lançar afastamento/férias/atestado no Mutti, empurra o abono para o Tangerino.
const db = require('../db/connection');
const tang = require('./tangerino');

// tipo (Mutti) → id do motivo de ajuste (Tangerino). Ver /adjustment-reason/find-all.
const MOTIVO = {
  ferias: 1, férias: 1,
  atestado: 5, 'atestado medico': 5, 'atestado médico': 5,
  afastamento: 2, inss: 9, 'afastamento inss': 9,
  maternidade: 10, 'licenca maternidade': 10, paternidade: 11, 'licenca paternidade': 11,
  obito: 23, óbito: 23, luto: 23, acompanhamento: 24,
};
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Empurra um afastamento para o Tangerino (não bloqueia; ignora se sem token/vínculo).
async function push(empresaId, colaboradorId, tipo, dataIni, dataFim) {
  if (!tang.habilitado()) return { skip: 'sem token' };
  const c = db.prepare('SELECT tangerino_id FROM colaboradores WHERE id=?').get(colaboradorId);
  if (!c || !c.tangerino_id) return { skip: 'sem vínculo Tangerino' };
  const reasonId = MOTIVO[norm(tipo)] || 2; // default AFASTAMENTO
  try {
    await tang.lancarAjuste({ employeeId: c.tangerino_id, dataIni: String(dataIni).slice(0, 10), dataFim: String(dataFim || dataIni).slice(0, 10), reasonId, status: 'APROVADO' });
    return { ok: true, reasonId };
  } catch (e) { return { erro: e.message }; }
}

module.exports = { push, MOTIVO };
