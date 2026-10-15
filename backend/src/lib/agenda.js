// Agenda de execução de um checklist.
// Formato (JSON em configuracoes.valor):
//   { "mode": "semana", "dias": [1,2,3,4,5] }   // 0=domingo ... 6=sábado
//   { "mode": "cada_n", "n": 3, "base": "2026-06-01" }  // a cada N dias a partir de 'base'
// Default: todos os dias.

function parseAgenda(valor) {
  if (!valor) return { mode: 'semana', dias: [0, 1, 2, 3, 4, 5, 6] };
  try {
    const a = typeof valor === 'string' ? JSON.parse(valor) : valor;
    if (a && a.mode === 'cada_n' && Number(a.n) > 0) return { mode: 'cada_n', n: Number(a.n), base: a.base || null };
    if (a && Array.isArray(a.dias)) return { mode: 'semana', dias: a.dias.map(Number) };
  } catch (e) { /* valor inválido → default */ }
  return { mode: 'semana', dias: [0, 1, 2, 3, 4, 5, 6] };
}

// Lê a agenda de uma chave de configuração
function getAgenda(db, empresaId, chave) {
  const row = db.prepare(`SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?`).get(empresaId, chave);
  return parseAgenda(row?.valor);
}

// O checklist roda no dia informado (YYYY-MM-DD)?
function rodaHoje(agenda, hojeStr) {
  const a = parseAgenda(agenda);
  if (a.mode === 'cada_n') {
    const base = a.base || hojeStr;
    const d0 = new Date(base + 'T00:00:00');
    const d1 = new Date(hojeStr + 'T00:00:00');
    const diff = Math.round((d1 - d0) / 86400000);
    return diff >= 0 && diff % a.n === 0;
  }
  const dow = new Date(hojeStr + 'T00:00:00').getDay();
  return a.dias.includes(dow);
}

module.exports = { parseAgenda, getAgenda, rodaHoje };
