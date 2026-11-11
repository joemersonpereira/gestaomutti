// caixaPontos.js — Caixa Destaque por PONTOS (Joe 2026-11-11).
// Ranking TRIMESTRAL por operador, somando os critérios (valores configuráveis em caixa_pontos_regra):
//  AUTO (saem do ERP): diferença de caixa por faixa (-1/-5/-30), erro de sangria (-2, quebra origem 'sangria'),
//      modalidade errada (-1, "troca de forma" na conciliação de cartão).
//  AVULSO (lançado pela gestão): qualquer critério manual + ponto/diferença avulsos (caixa_pontos_lancamento).
// Cada contribuição guarda o CRITÉRIO que gerou (transparência). "Perdoar sem pontos" (apuração da diferença)
// tira a diferença do cálculo. Ganha quem alcança o mínimo (default 30). Pontualidade (Tangerino) e
// acerto/streaks ficam p/ a próxima fatia (precisam da escala de horário).
const db = require('../db/connection');
const t = require('./tesourariaErp');
const cc = require('./conciliacaoCartao');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const pad = n => String(n).padStart(2, '0');

function trimestreRange(ano, tri) {
  const m0 = (Number(tri) - 1) * 3 + 1;            // 1,4,7,10
  const ini = `${ano}-${pad(m0)}-01`;
  const mEnd = m0 + 2;                              // 3,6,9,12
  const lastDay = new Date(Number(ano), mEnd, 0).getDate();
  const fim = `${ano}-${pad(mEnd)}-${pad(lastDay)}`;
  return { ini, fim };
}

function regrasMapa(emp) {
  const m = {};
  db.prepare('SELECT chave, label, pontos, tipo, desclassifica, ativo FROM caixa_pontos_regra WHERE empresa_id=?').all(emp)
    .forEach(r => { m[r.chave] = r; });
  return m;
}
function minimo(emp) {
  try { const r = db.prepare("SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave='pontos_minimo_premiacao'").get(emp); return r ? (Number(r.valor) || 0) : 30; } catch (e) { return 30; }
}
function faixaDiferenca(valorAbs) {
  if (valorAbs <= 30) return 'dif_ate30';
  if (valorAbs <= 100) return 'dif_30a100';
  return 'dif_acima100';
}

async function rankingPontos(emp, { ano, tri, lojaId } = {}) {
  const hoje = new Date();
  ano = Number(ano) || hoje.getFullYear();
  tri = Number(tri) || (Math.floor(hoje.getMonth() / 3) + 1);
  const { ini, fim } = trimestreRange(ano, tri);
  const reg = regrasMapa(emp);
  const min = minimo(emp);
  const pts = ch => (reg[ch] && reg[ch].ativo !== 0 ? Number(reg[ch].pontos) || 0 : 0);
  const ativo = ch => reg[ch] && reg[ch].ativo !== 0;

  // acumulador por operador (nome)
  const ops = new Map();
  const get = nome => { const k = (nome || '—').trim() || '—'; if (!ops.has(k)) ops.set(k, { operador: k, total: 0, desclassificado: false, criterios: {} }); return ops.get(k); };
  const add = (nome, chave, pontos, n = 1) => {
    if (!pontos && !(reg[chave] && reg[chave].desclassifica)) { /* ainda registra o critério mesmo com 0? não */ }
    const o = get(nome);
    const c = o.criterios[chave] || { chave, label: (reg[chave] && reg[chave].label) || chave, pontos: 0, n: 0 };
    c.pontos += pontos; c.n += n; o.criterios[chave] = c; o.total += pontos;
    if (reg[chave] && reg[chave].desclassifica) o.desclassificado = true;
  };

  // 1) Diferenças de caixa + sangria (do ERP). Respeita "perdoar sem pontos".
  try {
    const q = await t.quebras(emp, { ini, fim, lojaId: lojaId || null });
    for (const d of (q.quebras || [])) {
      const perdoadoSemPontos = d.cobranca && d.cobranca.status === 'perdoado' && String(d.cobranca.observacao || '').startsWith('[sem pontos]');
      if (perdoadoSemPontos) continue;
      if (d.origem === 'sangria') { if (ativo('erro_sangria_dp')) add(d.operador, 'erro_sangria_dp', pts('erro_sangria_dp')); continue; }
      if (d.origem === 'correcao_cartao') continue; // modalidade errada entra pela conciliação (abaixo), não dobra
      const abs = Math.abs(Number(d.valor) || 0);
      if (abs <= 0) continue;
      const ch = faixaDiferenca(abs);
      if (ativo(ch)) add(d.operador, ch, pts(ch));
    }
  } catch (e) { /* ERP indisponível: segue sem diferença */ }

  // 2) Modalidade errada = "troca de forma" na conciliação de cartão, por operador.
  try {
    if (ativo('modalidade_errada')) {
      const corr = await cc.correcoes(emp, { ini, fim, lojaId: lojaId || null });
      for (const o of (corr.porOperador || [])) {
        if (!o.nome || o.nome === '—') continue;
        add(o.nome, 'modalidade_errada', pts('modalidade_errada') * (o.n || 0), o.n || 0);
      }
    }
  } catch (e) { /* conciliação indisponível */ }

  // 3) Lançamentos AVULSOS (pontos e critérios manuais) no período.
  try {
    const lanc = db.prepare(`SELECT operador_nome, regra_chave, SUM(pontos) pontos, COUNT(*) n
      FROM caixa_pontos_lancamento WHERE empresa_id=? AND data>=? AND data<=? GROUP BY operador_nome, regra_chave`).all(emp, ini, fim);
    for (const l of lanc) add(l.operador_nome, l.regra_chave || 'avulso', Number(l.pontos) || 0, Number(l.n) || 0);
  } catch (e) { /* sem lançamentos */ }

  const ranking = [...ops.values()].map(o => ({
    operador: o.operador, total: r2(o.total), desclassificado: o.desclassificado,
    elegivel: !o.desclassificado && o.total >= min,
    criterios: Object.values(o.criterios).sort((a, b) => a.pontos - b.pontos),
  })).sort((a, b) => (b.desclassificado ? -1 : 1) - (a.desclassificado ? -1 : 1) || b.total - a.total);

  return { ok: true, ano, tri, periodo: { ini, fim }, minimo: min, ranking };
}

// Lançamento avulso de pontos OU de diferença (a diferença avulsa também é só pontos aqui).
function lancar(emp, { operador_nome, colaborador_id, loja_id, data, regra_chave, pontos, obs, usuario }) {
  if (!operador_nome) throw new Error('Informe o operador.');
  const d = (data || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const id = uuid();
  db.prepare(`INSERT INTO caixa_pontos_lancamento (id, empresa_id, colaborador_id, operador_nome, loja_id, data, regra_chave, pontos, origem, obs, por)
    VALUES (?,?,?,?,?,?,?,?, 'avulso', ?, ?)`)
    .run(id, emp, colaborador_id || null, String(operador_nome).trim(), loja_id || null, d, regra_chave || 'avulso', Math.round(Number(pontos) || 0), obs || null, (usuario && (usuario.nome || usuario.id)) || null);
  return { ok: true, id };
}
function listarLancamentos(emp, { ano, tri } = {}) {
  const hoje = new Date();
  const { ini, fim } = trimestreRange(Number(ano) || hoje.getFullYear(), Number(tri) || (Math.floor(hoje.getMonth() / 3) + 1));
  const rows = db.prepare('SELECT * FROM caixa_pontos_lancamento WHERE empresa_id=? AND data>=? AND data<=? ORDER BY data DESC, criado_em DESC').all(emp, ini, fim);
  return { ok: true, lancamentos: rows };
}
function removerLancamento(emp, id) {
  db.prepare('DELETE FROM caixa_pontos_lancamento WHERE empresa_id=? AND id=?').run(emp, id);
  return { ok: true };
}

module.exports = { rankingPontos, lancar, listarLancamentos, removerLancamento, trimestreRange };
