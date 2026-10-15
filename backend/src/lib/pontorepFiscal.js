// pontorepFiscal.js — Arquivos fiscais do REP-P: AFD (Arquivo Fonte de Dados) e
// AEJ (Arquivo Eletrônico de Jornada), Portaria MTP 671.
// OBS: leiaute BASE (tipos de registro e ordem dos campos conforme a 671); a largura fixa
// exata de cada campo deve ser conferida no ato da HOMOLOGAÇÃO/certificação do REP-P.
const db = require('../db/connection');

const so = v => String(v == null ? '' : v).replace(/\D/g, '');
const padL = (v, n, ch = '0') => so(v).padStart(n, ch).slice(-n);
const padR = (v, n) => String(v == null ? '' : v).padEnd(n, ' ').slice(0, n);
const ddmmaaaa = iso => iso ? iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4) : '';
const hhmm = dh => String(dh).slice(11, 16).replace(':', '');
const dhFmt = dh => ddmmaaaa(String(dh).slice(0, 10)) + hhmm(dh); // ddmmaaaaHHMM
const hojeISO = () => new Date().toISOString().slice(0, 10);

function estabDaLoja(emp, lojaId) {
  return db.prepare(`SELECT * FROM pontorep_estabelecimento WHERE empresa_id=? AND loja_id=?`).get(emp, lojaId);
}

// ───────── AFD — todas as marcações ORIGINAIS no período ─────────
function gerarAFD(emp, { lojaId, ini, fim }) {
  const estab = estabDaLoja(emp, lojaId);
  if (!estab) return { erro: 'Estabelecimento não encontrado para a loja.' };
  if (!ini || !fim) return { erro: 'Informe o período.' };
  const marc = db.prepare(`
    SELECT m.nsr, m.data_hora, c.cpf FROM pontorep_marcacao m
    LEFT JOIN colaboradores c ON c.id=m.colaborador_id
    WHERE m.empresa_id=? AND m.estabelecimento_id=? AND date(m.data_hora) BETWEEN ? AND ?
    ORDER BY m.nsr`).all(emp, estab.id, ini, fim);
  const L = [];
  // Tipo 1 — cabeçalho: NSR(9) tipo(1) idEmpregador(1=CNPJ) CNPJ(14) CEI(12) razão(150) dtIni(8) dtFim(8) dtGer(8) hrGer(4)
  L.push(padL(0, 9) + '1' + '1' + padL(estab.cnpj, 14) + padL('', 12) + padR(estab.razao_social, 150)
    + ddmmaaaa(ini) + ddmmaaaa(fim) + ddmmaaaa(hojeISO()) + hhmm(new Date().toISOString()));
  // Tipo 3 — marcação: NSR(9) tipo(3) dataHora(ddmmaaaaHHMM) CPF(12)
  for (const m of marc) L.push(padL(m.nsr, 9) + '3' + dhFmt(m.data_hora) + padL(m.cpf, 12));
  // Tipo 9 — trailer: qtd de marcações tipo 3
  L.push(padL(marc.length, 9) + '9' + padL(marc.length, 9));
  return { nome: `AFD_${lojaId}_${ini}_a_${fim}.txt`, registros: marc.length, conteudo: L.join('\r\n') };
}

// ───────── AEJ — jornada contratual + marcações tratadas + ausências ─────────
function gerarAEJ(emp, { lojaId, ini, fim }) {
  const estab = estabDaLoja(emp, lojaId);
  if (!estab) return { erro: 'Estabelecimento não encontrado para a loja.' };
  if (!ini || !fim) return { erro: 'Informe o período.' };
  const L = [];
  L.push('AEJ|' + padL(estab.cnpj, 14) + '|' + (estab.razao_social || '') + '|' + ini + '|' + fim + '|GERADO ' + hojeISO());
  // Jornadas previstas (escala) do período, por colaborador
  const escala = db.prepare(`
    SELECT c.cpf, c.nome, ed.data, ed.folga, ed.entrada, ed.saida, ed.jornada_min
    FROM pontorep_escala e JOIN pontorep_escala_dia ed ON ed.escala_id=e.id
    LEFT JOIN colaboradores c ON c.id=e.colaborador_id
    WHERE e.empresa_id=? AND e.loja_id=? AND ed.data BETWEEN ? AND ?
    ORDER BY c.nome, ed.data`).all(emp, lojaId, ini, fim);
  for (const j of escala)
    L.push('JORNADA|' + padL(j.cpf, 12) + '|' + ddmmaaaa(j.data) + '|' + (j.folga ? 'FOLGA' : `${j.entrada || ''}-${j.saida || ''}|${j.jornada_min || 0}min`));
  // Marcações tratadas (originais aqui) por colaborador
  const marc = db.prepare(`
    SELECT c.cpf, m.data_hora FROM pontorep_marcacao m LEFT JOIN colaboradores c ON c.id=m.colaborador_id
    JOIN pontorep_estabelecimento es ON es.id=m.estabelecimento_id
    WHERE m.empresa_id=? AND es.loja_id=? AND date(m.data_hora) BETWEEN ? AND ? ORDER BY c.cpf, m.data_hora`).all(emp, lojaId, ini, fim);
  for (const m of marc) L.push('MARCACAO|' + padL(m.cpf, 12) + '|' + dhFmt(m.data_hora));
  // Ausências (afastamentos) no período
  const af = db.prepare(`
    SELECT c.cpf, a.data_ini, a.data_fim, mo.nome motivo FROM pontorep_afastamento a
    LEFT JOIN colaboradores c ON c.id=a.colaborador_id LEFT JOIN pontorep_afastamento_motivo mo ON mo.id=a.motivo_id
    WHERE a.empresa_id=? AND a.data_ini<=? AND COALESCE(a.data_fim,a.data_ini)>=?`).all(emp, fim, ini);
  for (const a of af) L.push('AUSENCIA|' + padL(a.cpf, 12) + '|' + ddmmaaaa(a.data_ini) + '|' + ddmmaaaa(a.data_fim || a.data_ini) + '|' + (a.motivo || ''));
  L.push('TRAILER|' + escala.length + '|' + marc.length + '|' + af.length);
  return { nome: `AEJ_${lojaId}_${ini}_a_${fim}.txt`, linhas: L.length, conteudo: L.join('\r\n') };
}

// HTML da Folha de Ponto (para envio por e-mail) — a partir do objeto do espelho
function folhaHtml(esp) {
  const hm = m => `${String(Math.floor(Math.abs(m || 0) / 60)).padStart(2, '0')}:${String(Math.abs(m || 0) % 60).padStart(2, '0')}`;
  const sS = m => (m < 0 ? '-' : '') + hm(m);
  const c = esp.colaborador || {}, e = esp.empregador || {};
  const linhas = esp.dias.map(d => `<tr><td>${d.data.slice(8, 10)}/${d.data.slice(5, 7)}</td><td>${d.folga ? '-' : (d.status === 'falta' ? 'FALTA' : (d.batidas_horas || '-'))}</td><td align=right>${d.folga ? '' : hm(d.trabalhado_min)}</td><td align=right>${d.folga ? '' : hm(d.previsto_min)}</td><td align=right>${d.folga ? '' : sS(d.saldo_min)}</td></tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;font-size:12px;color:#111">
    <h2>Folha de Ponto</h2><p>${esp.periodo.ini.split('-').reverse().join('/')} a ${esp.periodo.fim.split('-').reverse().join('/')}</p>
    <p><b>Empregador:</b> ${e.razao_social || '—'} — CNPJ ${e.cnpj || '—'}<br><b>Colaborador:</b> ${c.nome || '—'} — CPF ${c.cpf || '—'} — ${c.cargo || ''}</p>
    <table border=1 cellspacing=0 cellpadding=4 style="border-collapse:collapse;width:100%">
      <tr style="background:#f0f0f4"><th>Dia</th><th>Pontos</th><th>Trabalhadas</th><th>Previstas</th><th>Saldo</th></tr>${linhas}
      <tr style="background:#faf7ee;font-weight:bold"><td colspan=2>Total</td><td align=right>${hm(esp.totais.trab)}</td><td align=right>${hm(esp.totais.prev)}</td><td align=right>${sS(esp.totais.saldo)}</td></tr>
    </table>
    <p style="color:#555">HE totais: ${hm(esp.totais.extra)} · Atrasos: ${hm(esp.totais.atraso)} · Faltas: ${esp.totais.faltas}</p>
    <p>Reconheço a exatidão e confirmo a frequência constante deste cartão.</p></div>`;
}

module.exports = { gerarAFD, gerarAEJ, folhaHtml };
