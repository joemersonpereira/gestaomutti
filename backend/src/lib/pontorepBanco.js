// pontorepBanco.js — Banco de horas com vencimento FIFO + acréscimos e limite mensal.
// Saldos diários (trabalhado - previsto). Créditos recebem ACRÉSCIMO por tipo de dia
// (útil/sábado/domingo/feriado, % da regra do colaborador) e um TETO mensal opcional.
// Crédito vira lote com vencimento (validade); débito consome os lotes mais antigos (FIFO);
// lote vencido com saldo vira hora extra a pagar (sai do banco).
const db = require('../db/connection');
const R = require('./pontorepRegra');
const P = require('./pontorep');

const addMeses = (comp, n) => { let [y, m] = comp.split('-').map(Number); m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1; return `${y}-${String(m).padStart(2, '0')}`; };

function bancoHoras(emp, colabId) {
  const dias = db.prepare(`SELECT data, saldo_min FROM pontorep_apuracao_dia WHERE empresa_id=? AND colaborador_id=? ORDER BY data`).all(emp, colabId);
  const hoje = new Date().toISOString().slice(0, 10);
  let banco = { validade_meses: 12 };
  try { const rg = R.regraVigenteColab(emp, colabId, hoje); if (rg?.banco) banco = { ...banco, ...rg.banco }; } catch (e) { /* usa default */ }
  const validade = Number(banco.validade_meses) || 12;
  const acr = { util: Number(banco.acr_util) || 0, sabado: Number(banco.acr_sabado) || 0, domingo: Number(banco.acr_domingo) || 0, feriado: Number(banco.acr_feriado) || 0 };
  const limiteMes = Number(banco.limite_mensal_min) || 0;

  // agrega por mês, aplicando acréscimo por dia nos CRÉDITOS
  const porMes = {};
  for (const d of dias) {
    const comp = d.data.slice(0, 7); (porMes[comp] = porMes[comp] || { credito: 0, debito: 0, bruto: 0 });
    const s = Math.round(d.saldo_min || 0); porMes[comp].bruto += s;
    if (s > 0) {
      const fer = P.ehFeriado(emp, null, d.data);
      const dow = new Date(d.data + 'T00:00:00').getDay();
      const tipo = fer ? 'feriado' : dow === 0 ? 'domingo' : dow === 6 ? 'sabado' : 'util';
      porMes[comp].credito += Math.round(s * (1 + (acr[tipo] || 0) / 100));
    } else if (s < 0) porMes[comp].debito += s;
  }
  const meses = Object.keys(porMes).sort();
  const lotes = []; const historico = [];
  for (const comp of meses) {
    let credito = porMes[comp].credito; if (limiteMes > 0) credito = Math.min(credito, limiteMes);
    const net = credito + porMes[comp].debito; // debito é negativo
    historico.push({ comp, saldo: Math.round(porMes[comp].bruto), creditado: credito });
    if (net > 0) lotes.push({ comp, restante: net, venc: addMeses(comp, validade) });
    else if (net < 0) { let deb = -net; for (const l of lotes) { if (deb <= 0) break; if (l.restante <= 0) continue; const usa = Math.min(l.restante, deb); l.restante -= usa; deb -= usa; } if (deb > 0) lotes.push({ comp, restante: -deb, venc: null }); }
  }
  const hojeComp = hoje.slice(0, 7);
  let vencidoTotal = 0; const vigentes = [];
  for (const l of lotes) {
    if (l.restante === 0) continue;
    if (l.restante > 0 && l.venc && l.venc <= hojeComp) vencidoTotal += l.restante;
    else vigentes.push(l);
  }
  const saldoAtual = vigentes.reduce((a, l) => a + l.restante, 0);
  const aVencer = vigentes.filter(l => l.restante > 0 && l.venc).map(l => ({ comp: l.comp, restante: l.restante, venc: l.venc })).sort((a, b) => a.venc.localeCompare(b.venc));
  return { validade, acrescimos: acr, limiteMensal: limiteMes, saldoAtual, vencidoTotal, aVencer, lotes: vigentes, historico };
}

module.exports = { bancoHoras };
