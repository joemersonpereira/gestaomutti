// Regras do checklist operacional adiável.
// Diária: não adia (faz no dia). Semanal: adiável até sexta. Mensal: adiável até dia 30.
// "Trava última semana": nos últimos 7 dias do mês, não pode mais adiar (tem que fazer).

function ymd(d) { return d.toISOString().slice(0, 10); }

// Sexta-feira da semana da data informada
function sextaDaSemana(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = dt.getDay(); // 0=dom ... 6=sáb
  dt.setDate(dt.getDate() + (5 - dow));
  return dt;
}

// Até quando pode ser adiado
function limiteAdiamento(periodicidade, hojeStr) {
  const d = new Date(hojeStr + 'T00:00:00');
  if (periodicidade === 'semanal') return ymd(sextaDaSemana(d));
  if (periodicidade === 'mensal') return ymd(new Date(d.getFullYear(), d.getMonth(), 30));
  return hojeStr; // diária
}

// Está nos últimos 7 dias do mês?
function emUltimaSemana(hojeStr) {
  const d = new Date(hojeStr + 'T00:00:00');
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() > ultimoDia - 7;
}

// Pode adiar hoje?
function podeAdiar(periodicidade, hojeStr) {
  if (periodicidade === 'diaria') return false;
  if (emUltimaSemana(hojeStr)) return false; // trava última semana
  return hojeStr < limiteAdiamento(periodicidade, hojeStr);
}

// Próxima data ao adiar (1 dia útil à frente, sem passar do limite)
function proximoAdiamento(periodicidade, hojeStr) {
  const lim = limiteAdiamento(periodicidade, hojeStr);
  const d = new Date(hojeStr + 'T00:00:00');
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0); // pula domingo
  const prox = ymd(d);
  return prox > lim ? lim : prox;
}

// Referência do período atual conforme a periodicidade
function periodoRef(periodicidade, hojeStr) {
  if (periodicidade === 'mensal') return hojeStr.slice(0, 7); // YYYY-MM
  if (periodicidade === 'semanal') {
    const d = new Date(hojeStr + 'T00:00:00'); const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // segunda
    return d.toISOString().slice(0, 10);
  }
  return hojeStr; // diária
}

module.exports = { limiteAdiamento, emUltimaSemana, podeAdiar, proximoAdiamento, periodoRef };
