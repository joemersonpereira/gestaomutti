// Diretoria — Fechamento do setor (MENSAL): premiação do mês por pessoa + 5 requisitos de validação.
// Cada requisito NÃO validado desconta 10% do prêmio (os 5 = a metade em risco; a outra metade é garantida).
// Piso = 50%. Também: RANKING TRIMESTRAL de Desenvolvimento — quem tiver mais desenvolvimento no trimestre
// ganha um prêmio (valor configurável).
const db = require('./../db/connection');
const metas = require('./tesourariaMetas');
const meuSetorArea = require('./meuSetorArea');
const cache = require('./erpCache');

const GATES = ['pontualidade', 'conduta', 'sla_pulsy', 'desenvolvimento', 'avaliacao_pulsy'];
const GATE_LABEL = { pontualidade: 'Pontualidade', conduta: 'Conduta', sla_pulsy: 'SLA Pulsy', desenvolvimento: 'Desenvolvimento', avaliacao_pulsy: 'Avaliação Pulsy' };
const PESO_REQ = 0.10;   // cada requisito não validado desconta 10% do prêmio
const PISO = 0.50;       // nunca desconta além de 50% (a metade é garantida)
const SETORES = [{ id: 'tesouraria', nome: 'Tesouraria' }, { id: 'retail', nome: 'Retail' }, { id: 'compras', nome: 'Compras' }, { id: 'online', nome: 'Online' }, { id: 'suporte', nome: 'Suporte Loja' }];
const MESNOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const ymK = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`;

// ── Meses disponíveis (fechamento é MENSAL) ────────────────────────────────
function meses(n = 12) {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = 0; i < n; i++) {
    const ano = d.getFullYear(), mes = d.getMonth() + 1;
    const ini = `${ymK(ano, mes)}-01`;
    const fimD = new Date(ano, mes, 0).getDate();
    out.push({ ano, mes, ini, fim: `${ymK(ano, mes)}-${String(fimD).padStart(2, '0')}`, label: `${MESNOME[mes - 1]}/${ano}`, atual: i === 0 });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
function mesRange(ano, mes) { const fimD = new Date(ano, mes, 0).getDate(); return { ini: `${ymK(ano, mes)}-01`, fim: `${ymK(ano, mes)}-${String(fimD).padStart(2, '0')}` }; }

// ── Premiação do Retail por vendedor no mês (espaços × faixa, só contrato assinado) ──
const PREM_FAIXAS_PADRAO = [{ ate: 10, pct: 1 }, { ate: null, pct: 2 }];
function premFaixasRetail(emp) {
  try { const r = db.prepare('SELECT faixas_json FROM tmkt_prem_vend_regra WHERE empresa_id=?').get(emp); if (r && r.faixas_json) { const f = JSON.parse(r.faixas_json); if (Array.isArray(f) && f.length) return f; } } catch (e) { /* */ }
  return PREM_FAIXAS_PADRAO;
}
function pctPorEspacos(faixas, qtd) {
  const ord = [...faixas].sort((a, b) => (a.ate == null ? 1e9 : a.ate) - (b.ate == null ? 1e9 : b.ate));
  for (const f of ord) { if (f.ate == null || qtd <= Number(f.ate)) return Number(f.pct) || 0; }
  return ord.length ? Number(ord[ord.length - 1].pct) || 0 : 0;
}
function retailPremiacaoMes(emp, ano, mes) {
  const faixas = premFaixasRetail(emp);
  const rows = db.prepare(`SELECT v.criado_por cid, col.nome nome, COUNT(ve.id) espacos, COALESCE(SUM(ve.valor),0) valor
      FROM tmkt_vendas v JOIN tmkt_venda_espacos ve ON ve.venda_id=v.id
      LEFT JOIN colaboradores col ON col.id=v.criado_por
      WHERE v.empresa_id=? AND EXISTS (SELECT 1 FROM tmkt_contrato ct WHERE ct.venda_id=v.id AND ct.status='assinado')
        AND COALESCE(v.uso_interno,0)=0 AND COALESCE(v.nao_ocupa,0)=0 AND COALESCE(v.nao_premia,0)=0
        AND v.criado_por IS NOT NULL AND strftime('%Y-%m', v.criado_em)=?
      GROUP BY v.criado_por, col.nome ORDER BY valor DESC`).all(emp, ymK(ano, mes));
  return rows.map(r => ({ colaborador_id: r.cid, nome: (r.nome || '(sem nome)').trim(), fator: 1, premioBruto: r2(Math.round(r.valor * pctPorEspacos(faixas, r.espacos)) / 100) }));
}
// TODOS do setor Retail (quem tem Meu Setor = time de trade), não só quem teve premiação no mês.
// Assim todo mundo é validado todo mês e entra no ranking de desenvolvimento (premiação 0 quando não houver).
function retailPessoasMes(emp, ano, mes) {
  const prem = new Map(retailPremiacaoMes(emp, ano, mes).map(p => [p.colaborador_id, p]));
  const membros = db.prepare("SELECT id, nome FROM colaboradores WHERE empresa_id=? AND COALESCE(ativo,1)=1 AND COALESCE(trade,0)=1 AND nome IS NOT NULL AND nome<>'' ORDER BY nome").all(emp);
  const out = []; const seen = new Set();
  membros.forEach(m => { seen.add(m.id); out.push(prem.get(m.id) || { colaborador_id: m.id, nome: (m.nome || '').trim(), fator: 1, premioBruto: 0 }); });
  prem.forEach((p, id) => { if (!seen.has(id)) { seen.add(id); out.push(p); } }); // premiado que não está marcado como trade
  return out.sort((a, b) => b.premioBruto - a.premioBruto || a.nome.localeCompare(b.nome));
}

// ── Premiação BRUTA por pessoa no setor/mês (cacheada; recalcula no máx. 1x/dia) ──
const RECALC_HORAS = 24;
async function premioBrutoPessoas(emp, setor, ano, mes, forcar) {
  const { ini, fim } = mesRange(ano, mes);
  const q = { setor, ano, mes };
  const hit = cache.ler('dir:bruto', emp, q);
  if (!forcar && hit && hit.payload) {
    const ageH = (Date.now() - new Date(String(hit.atualizado_em).replace(' ', 'T') + 'Z').getTime()) / 3600000;
    if (ageH < RECALC_HORAS) return { ...hit.payload, _cache: { atualizado_em: hit.atualizado_em } };
  }
  let out = { pessoas: [], notaGeral: null };
  if (setor === 'tesouraria') {
    const ap = await metas.apurar(emp, { ini, fim });
    out = { pessoas: (ap.pessoas || []).map(p => ({ colaborador_id: p.colaborador_id, nome: (p.nome || '').trim(), fator: p.fator, premioBruto: r2(p.premioTotal) })), notaGeral: ap.notaGeral };
  } else if (setor === 'retail') {
    out = { pessoas: retailPessoasMes(emp, ano, mes), notaGeral: null };
  } else if (setor === 'compras') {
    // Agrega o prêmio por COMPRADOR (Meu Setor de Compras) × as pessoas vinculadas (por fator).
    const cms = require('./comprasMeuSetor');
    const compradores = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
      WHERE c.empresa_id=? AND c.ativo=1 AND f.nome LIKE 'Comprador%'`).all(emp);
    const byPessoa = {}; const notas = [];
    for (const cp of compradores) {
      try {
        const ap = await cms.apurar(emp, cp.id, { ano, mes });
        if (ap && ap.notaGeral != null) notas.push(ap.notaGeral);
        (ap && ap.pessoas || []).forEach(p => {
          const k = p.colaborador_id; if (!k) return;
          (byPessoa[k] = byPessoa[k] || { colaborador_id: k, nome: (p.nome || '').trim(), fator: p.fator, premioBruto: 0 });
          byPessoa[k].premioBruto = r2(byPessoa[k].premioBruto + (Number(p.premio) || 0));
        });
      } catch (e) { /* comprador sem vínculo/ERP indisponível — ignora */ }
    }
    out = { pessoas: Object.values(byPessoa).sort((a, b) => b.premioBruto - a.premioBruto), notaGeral: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null };
  } else if (setor === 'online' || setor === 'suporte') {
    // Meu Setor por ÁREA (Online / Suporte Loja): prêmio do mês × pessoas vinculadas (por fator).
    const ap = await meuSetorArea.apurar(emp, setor, { ini, fim });
    out = { pessoas: (ap.pessoas || []).map(p => ({ colaborador_id: p.colaborador_id, nome: (p.nome || '').trim(), fator: p.fator, premioBruto: r2(p.premioTotal) })), notaGeral: ap.notaGeral };
  }
  const at = cache.gravar('dir:bruto', emp, q, out);
  return { ...out, _cache: { atualizado_em: at } };
}

function validacoesDo(emp, setor, ciclo) {
  const val = {};
  db.prepare('SELECT * FROM setor_fechamento_validacao WHERE empresa_id=? AND setor=? AND ciclo=?').all(emp, setor, ciclo).forEach(v => { val[v.colaborador_id] = v; });
  return val;
}
function montarLinha(p, v) {
  const gates = {}; let falhos = 0;
  GATES.forEach(g => { const ok = (v || {})[g] === 1; gates[g] = ok; if (!ok) falhos++; });
  const descontoPorReq = r2(p.premioBruto * PESO_REQ);
  const desconto = r2(Math.min(GATES.length, falhos) * descontoPorReq);
  const premioFinal = r2(Math.max(p.premioBruto * PISO, p.premioBruto - desconto));
  return { ...p, gates, falhos, garantido: r2(p.premioBruto * PISO), descontoPorReq, desconto, premioFinal };
}

async function fechamento(emp, setor, { ano, mes, forcar } = {}) {
  if (!SETORES.find(s => s.id === setor)) setor = 'tesouraria';
  const hoje = new Date();
  ano = Number(ano) || hoje.getFullYear(); mes = Number(mes) || (hoje.getMonth() + 1);
  const ciclo = ymK(ano, mes);
  const { pessoas, notaGeral, _cache } = await premioBrutoPessoas(emp, setor, ano, mes, forcar);
  const val = validacoesDo(emp, setor, ciclo);
  const linhas = pessoas.map(p => montarLinha(p, val[p.colaborador_id]));
  return {
    setor, setores: SETORES, ano, mes, ciclo, label: `${MESNOME[mes - 1]}/${ano}`, notaGeral,
    gates: GATES, gateLabels: GATE_LABEL, pesoReq: PESO_REQ, piso: PISO, meses: meses(),
    linhas, totalBruto: r2(linhas.reduce((s, l) => s + l.premioBruto, 0)), totalFinal: r2(linhas.reduce((s, l) => s + l.premioFinal, 0)),
    cache: _cache,
  };
}

function setValidacao(emp, setor, { ano, mes, colaborador_id, gate, valor } = {}, usuario) {
  if (!GATES.includes(gate)) throw new Error('Requisito inválido.');
  if (!colaborador_id) throw new Error('Colaborador não informado.');
  const ciclo = ymK(Number(ano), Number(mes));
  const ex = db.prepare('SELECT 1 FROM setor_fechamento_validacao WHERE empresa_id=? AND setor=? AND ciclo=? AND colaborador_id=?').get(emp, setor, ciclo, colaborador_id);
  if (!ex) db.prepare('INSERT INTO setor_fechamento_validacao (empresa_id, setor, ciclo, colaborador_id) VALUES (?,?,?,?)').run(emp, setor, ciclo, colaborador_id);
  db.prepare(`UPDATE setor_fechamento_validacao SET ${gate}=?, por=?, atualizado_em=datetime('now') WHERE empresa_id=? AND setor=? AND ciclo=? AND colaborador_id=?`)
    .run(valor ? 1 : 0, usuario?.nome || null, emp, setor, ciclo, colaborador_id);
  return { ok: true };
}

// ── Prêmio do ranking trimestral (configurável, por setor) ─────────────────
function premioDevTri(emp, setor) {
  try { const r = db.prepare('SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave=?').get(emp, `rank_dev_premio_${setor}`); const v = Number(r && r.valor); return isFinite(v) && v >= 0 ? v : 0; } catch (e) { return 0; }
}
function setPremioDevTri(emp, setor, valor) {
  const chave = `rank_dev_premio_${setor}`; const v = String(Math.max(0, Number(valor) || 0));
  const ex = db.prepare('SELECT 1 FROM tesouraria_config WHERE empresa_id=? AND chave=?').get(emp, chave);
  if (ex) db.prepare('UPDATE tesouraria_config SET valor=? WHERE empresa_id=? AND chave=?').run(v, emp, chave);
  else db.prepare('INSERT INTO tesouraria_config (empresa_id, chave, valor) VALUES (?,?,?)').run(emp, chave, v);
  return { ok: true, premio: premioDevTri(emp, setor) };
}
function trimestres(n = 4) {
  const out = []; const d = new Date(); let ano = d.getFullYear(), tri = Math.floor(d.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) { out.push({ ano, tri, label: `${tri}º tri/${ano} (${MESNOME[(tri - 1) * 3].slice(0, 3)}–${MESNOME[(tri - 1) * 3 + 2].slice(0, 3)})`, atual: i === 0 }); tri -= 1; if (tri < 1) { tri = 4; ano -= 1; } }
  return out;
}
// Ranking do trimestre: por DESENVOLVIMENTO (quantos meses do trimestre tiveram o requisito validado).
async function rankTrimestral(emp, setor, { ano, tri } = {}) {
  if (!SETORES.find(s => s.id === setor)) setor = 'tesouraria';
  const d = new Date();
  ano = Number(ano) || d.getFullYear(); tri = Number(tri) || (Math.floor(d.getMonth() / 3) + 1);
  const mesesTri = [0, 1, 2].map(k => (tri - 1) * 3 + 1 + k); // ex.: tri 4 → [10,11,12]
  const agg = new Map(); // colaborador_id → { nome, devMeses, premioTri, mesesComPremio }
  for (const mes of mesesTri) {
    const { pessoas } = await premioBrutoPessoas(emp, setor, ano, mes);
    const val = validacoesDo(emp, setor, ymK(ano, mes));
    for (const p of pessoas) {
      const a = agg.get(p.colaborador_id) || { colaborador_id: p.colaborador_id, nome: p.nome, devMeses: 0, premioTri: 0 };
      if ((val[p.colaborador_id] || {}).desenvolvimento === 1) a.devMeses++;
      a.premioTri = r2(a.premioTri + montarLinha(p, val[p.colaborador_id]).premioFinal);
      a.nome = a.nome || p.nome; agg.set(p.colaborador_id, a);
    }
  }
  const linhas = [...agg.values()].sort((x, y) => y.devMeses - x.devMeses || y.premioTri - x.premioTri);
  const topDev = linhas.length ? linhas[0].devMeses : 0;
  linhas.forEach((l, i) => { l.pos = i + 1; l.vencedor = topDev > 0 && l.devMeses === topDev; });
  return { setor, setores: SETORES, ano, tri, label: `${tri}º trimestre/${ano}`, trimestres: trimestres(), meses: mesesTri.map(m => MESNOME[m - 1]), premio: premioDevTri(emp, setor), linhas };
}

module.exports = { fechamento, setValidacao, rankTrimestral, premioDevTri, setPremioDevTri, GATES, GATE_LABEL };
