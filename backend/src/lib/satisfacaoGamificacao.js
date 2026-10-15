// satisfacaoGamificacao.js — incentiva o vendedor a PEDIR que o cliente avalie: pontos por avaliação
// coletada (validada) + bônus para o campeão do mês. Vira brinde na loja de pontos.
const { v4: uuid } = require('uuid');
const db = require('../db/connection');

function getConfig(empresaId) {
  const g = (k, d) => { const r = db.prepare('SELECT valor FROM pontos_config WHERE empresa_id=? AND chave=?').get(empresaId, k); return r == null ? d : r.valor; };
  return {
    pontosPorAvaliacao: Number(g('satisf_pontos_por_avaliacao', 0)) || 0,
    pontosTop: Number(g('satisf_pontos_top', 0)) || 0,
    metaMes: Number(g('satisf_meta_mes', 0)) || 0,
  };
}
function setConfig(empresaId, { pontosPorAvaliacao, pontosTop, metaMes } = {}, usuarioId) {
  const up = (k, v) => db.prepare(`INSERT INTO pontos_config (empresa_id,chave,valor,atualizado_em,atualizado_por) VALUES (?,?,?,datetime('now'),?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=datetime('now'), atualizado_por=excluded.atualizado_por`).run(empresaId, k, String(v), usuarioId || null);
  if (pontosPorAvaliacao != null) up('satisf_pontos_por_avaliacao', Math.max(0, Number(pontosPorAvaliacao) || 0));
  if (pontosTop != null) up('satisf_pontos_top', Math.max(0, Number(pontosTop) || 0));
  if (metaMes != null) up('satisf_meta_mes', Math.max(0, Number(metaMes) || 0));
  return getConfig(empresaId);
}

// Ranking de vendedores por AVALIAÇÕES COLETADAS (validadas) no mês. lojaId opcional.
function ranking(empresaId, { ano, mes, lojaId } = {}) {
  const y = Number(ano) || new Date().getFullYear();
  const m = Number(mes) || (new Date().getMonth() + 1);
  const mm = String(m).padStart(2, '0');
  const rows = db.prepare(`SELECT c.id, c.nome, c.loja_id, l.nome loja,
      COUNT(sv.id) FILTER (WHERE sv.validado=1) n,
      AVG(sv.nota) FILTER (WHERE sv.validado=1) media
    FROM colaboradores c LEFT JOIN lojas l ON l.id=c.loja_id
    LEFT JOIN satisfacao_vendedor sv ON sv.vendedor_id=c.id AND strftime('%m',sv.criado_em)=? AND strftime('%Y',sv.criado_em)=?
    WHERE c.empresa_id=? AND c.ativo=1 AND (c.funcao_id='func-vendedor' OR c.conferente=1) ${lojaId ? 'AND c.loja_id=?' : ''}
    GROUP BY c.id, c.nome, c.loja_id, l.nome`).all(...(lojaId ? [mm, String(y), empresaId, lojaId] : [mm, String(y), empresaId]));
  const cfg = getConfig(empresaId);
  const vend = rows.map(r => ({
    id: r.id, nome: r.nome, loja: r.loja || '—', avaliacoes: r.n || 0,
    media: r.n ? Math.round(r.media * 10) / 10 : null,
    bateuMeta: cfg.metaMes ? (r.n || 0) >= cfg.metaMes : null,
    pontos: (r.n || 0) * cfg.pontosPorAvaliacao,
  })).filter(v => v.avaliacoes > 0).sort((a, b) => b.avaliacoes - a.avaliacoes || (b.media || 0) - (a.media || 0));
  const total = vend.reduce((a, v) => a + v.avaliacoes, 0);
  return { ok: true, ano: y, mes: m, total, vendedores: vend, config: cfg };
}

// Premia o mês: cada vendedor ganha avaliacoes×pontosPorAvaliacao; o campeão ganha o bônus. Idempotente.
function premiar(empresaId, { ano, mes, lojaId, usuarioId } = {}) {
  const cfg = getConfig(empresaId);
  if (!cfg.pontosPorAvaliacao && !cfg.pontosTop) return { ok: false, erro: 'Configure os pontos por avaliação (ou o bônus) antes de premiar.' };
  const r = ranking(empresaId, { ano, mes, lojaId });
  if (!r.vendedores.length) return { ok: false, erro: 'Nenhuma avaliação coletada no período.' };
  const y = r.ano, m = r.mes, comp = `${y}-${String(m).padStart(2, '0')}`;
  const ins = db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
    VALUES (?,?,?,?,?, 'premio', ?, ?, ?, 'satisfacao', ?, ?, datetime('now'))`);
  const jaExiste = ref => !!db.prepare('SELECT 1 FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').get(empresaId, ref);
  let premiados = 0, pontosTotal = 0;
  const tx = db.transaction(() => {
    for (const v of r.vendedores) {
      const pts = v.avaliacoes * cfg.pontosPorAvaliacao;
      if (pts > 0) { const ref = `satisf-aval:${comp}:${v.id}`; if (!jaExiste(ref)) { ins.run(uuid(), empresaId, v.id, v.nome, null, `${v.avaliacoes} avaliações coletadas em ${String(m).padStart(2, '0')}/${y} — +${pts} pontos`, pts, comp, ref, usuarioId || null); premiados++; pontosTotal += pts; } }
    }
    if (cfg.pontosTop > 0) { const top = r.vendedores[0]; const ref = `satisf-top:${comp}:${lojaId || 'rede'}`; if (top && !jaExiste(ref)) { ins.run(uuid(), empresaId, top.id, top.nome, null, `Campeão de avaliações em ${String(m).padStart(2, '0')}/${y} (${top.avaliacoes}) — +${cfg.pontosTop} pontos`, cfg.pontosTop, comp, ref, usuarioId || null); pontosTotal += cfg.pontosTop; } }
  });
  tx();
  return { ok: true, premiados, pontosTotal, campeao: r.vendedores[0] ? { nome: r.vendedores[0].nome, avaliacoes: r.vendedores[0].avaliacoes } : null };
}

module.exports = { getConfig, setConfig, ranking, premiar };
