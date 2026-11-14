// precificacaoCadernos.js — Precificação Fase 2 (Joe 2026-11-14): TAGS de produto (formador de
// tráfego/opinião etc) + CADERNOS de oferta com frequência de conferência + validador de execução.
const db = require('../db/connection');

// Tags sugeridas (o Joe pode criar outras digitando). formador de tráfego/opinião são as principais.
const TAGS_PADRAO = ['Formador de tráfego', 'Formador de opinião', 'Sensível ao preço', 'Alta margem', 'Sazonal'];

function tagsSugeridas(emp) {
  const usadas = db.prepare('SELECT DISTINCT tag FROM produto_tag WHERE empresa_id=? ORDER BY tag').all(emp).map(r => r.tag);
  return [...new Set([...TAGS_PADRAO, ...usadas])];
}
// Mapa produto_id -> [tags] para um conjunto de produtos.
function tagsDeProdutos(emp, produtoIds) {
  const out = {};
  if (!produtoIds || !produtoIds.length) return out;
  const ph = produtoIds.map(() => '?').join(',');
  db.prepare(`SELECT produto_id, tag FROM produto_tag WHERE empresa_id=? AND produto_id IN (${ph})`).all(emp, ...produtoIds.map(Number))
    .forEach(r => { (out[r.produto_id] = out[r.produto_id] || []).push(r.tag); });
  return out;
}
function setTag(emp, { produto_id, tag, on } = {}) {
  const t = String(tag || '').trim(); if (!produto_id || !t) throw new Error('Produto e tag obrigatórios.');
  if (on === false) db.prepare('DELETE FROM produto_tag WHERE empresa_id=? AND produto_id=? AND tag=?').run(emp, Number(produto_id), t);
  else db.prepare(`INSERT INTO produto_tag (empresa_id, produto_id, tag, criado_em) VALUES (?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, produto_id, tag) DO NOTHING`).run(emp, Number(produto_id), t);
  return { ok: true };
}
// Produtos que têm uma tag (p/ filtrar a seleção da pesquisa por "formador de tráfego" etc).
function produtosComTag(emp, tag) {
  return db.prepare('SELECT produto_id FROM produto_tag WHERE empresa_id=? AND tag=?').all(emp, tag).map(r => Number(r.produto_id));
}

// ── Cadernos de oferta: frequência + conferência ──────────────────────────────────────────────────
const hojeISO = () => new Date().toISOString().slice(0, 10);
function listarCadernos(emp) {
  const cs = db.prepare('SELECT * FROM precificacao_caderno WHERE empresa_id=? ORDER BY ativo DESC, proxima_conferencia').all(emp);
  const hoje = hojeISO();
  return cs.map(c => {
    const ultima = db.prepare('SELECT data, por_nome, ok FROM precificacao_caderno_exec WHERE caderno_id=? ORDER BY data DESC, id DESC LIMIT 1').get(c.id);
    const atrasado = c.ativo && c.proxima_conferencia && c.proxima_conferencia < hoje;
    const diasRest = c.proxima_conferencia ? Math.round((new Date(c.proxima_conferencia) - new Date(hoje)) / 864e5) : null;
    return { ...c, ativo: c.ativo !== 0, ultima: ultima || null, atrasado: !!atrasado, diasRestantes: diasRest,
      status: !c.ativo ? 'inativo' : atrasado ? 'atrasado' : diasRest != null && diasRest <= 3 ? 'proximo' : 'em_dia' };
  });
}
function salvarCaderno(emp, c = {}) {
  const freq = c.frequencia_dias != null && c.frequencia_dias !== '' ? Number(c.frequencia_dias) : null;
  const prox = c.proxima_conferencia || (freq ? new Date(Date.now() + freq * 864e5).toISOString().slice(0, 10) : null);
  if (c.id) {
    db.prepare(`UPDATE precificacao_caderno SET nome=?, frequencia_dias=?, responsavel_tipo=?, responsavel_id=?, responsavel_nome=?, proxima_conferencia=?, ativo=? WHERE id=? AND empresa_id=?`)
      .run(c.nome || '', freq, c.responsavel_tipo || null, c.responsavel_id || null, c.responsavel_nome || null, prox, c.ativo === false ? 0 : 1, Number(c.id), emp);
    return { ok: true, id: Number(c.id) };
  }
  const info = db.prepare(`INSERT INTO precificacao_caderno (empresa_id, nome, frequencia_dias, responsavel_tipo, responsavel_id, responsavel_nome, proxima_conferencia, ativo, criado_em)
    VALUES (?,?,?,?,?,?,?,1, datetime('now'))`).run(emp, c.nome || '', freq, c.responsavel_tipo || null, c.responsavel_id || null, c.responsavel_nome || null, prox);
  return { ok: true, id: info.lastInsertRowid };
}
function removerCaderno(emp, id) {
  db.prepare('DELETE FROM precificacao_caderno_exec WHERE caderno_id=?').run(Number(id));
  db.prepare('DELETE FROM precificacao_caderno WHERE id=? AND empresa_id=?').run(Number(id), emp);
  return { ok: true };
}
// Marca o caderno como conferido/executado HOJE e avança a próxima conferência pela frequência.
function registrarExec(emp, { caderno_id, ok = true, obs = '' } = {}, usuario) {
  const c = db.prepare('SELECT * FROM precificacao_caderno WHERE id=? AND empresa_id=?').get(Number(caderno_id), emp);
  if (!c) throw new Error('Caderno não encontrado.');
  db.prepare(`INSERT INTO precificacao_caderno_exec (caderno_id, data, por_nome, ok, obs, criado_em) VALUES (?,?,?,?,?, datetime('now'))`)
    .run(c.id, hojeISO(), usuario?.nome || null, ok ? 1 : 0, String(obs || '').slice(0, 500));
  if (c.frequencia_dias) db.prepare('UPDATE precificacao_caderno SET proxima_conferencia=? WHERE id=?')
    .run(new Date(Date.now() + c.frequencia_dias * 864e5).toISOString().slice(0, 10), c.id);
  return { ok: true };
}
function execsDoCaderno(emp, id) {
  return db.prepare('SELECT data, por_nome, ok, obs FROM precificacao_caderno_exec WHERE caderno_id=? ORDER BY data DESC, id DESC LIMIT 50').all(Number(id));
}
// Resumo p/ indicador: % de cadernos ativos em dia (não atrasados).
function resumoCadernos(emp) {
  const cs = listarCadernos(emp).filter(c => c.ativo);
  const total = cs.length, atrasados = cs.filter(c => c.atrasado).length;
  return { total, atrasados, emDia: total - atrasados, pctEmDia: total ? Math.round((total - atrasados) / total * 1000) / 10 : null };
}

// Resumo de cadernos de um RESPONSÁVEL (por nome) — p/ virar indicador no Meu Setor do comprador.
function resumoPorResponsavel(emp, nome) {
  if (!nome) return { total: 0, emDia: 0, pctEmDia: null };
  const cs = listarCadernos(emp).filter(c => c.ativo && (c.responsavel_nome || '').trim().toLowerCase() === String(nome).trim().toLowerCase());
  const total = cs.length, atrasados = cs.filter(c => c.atrasado).length;
  return { total, emDia: total - atrasados, atrasados, pctEmDia: total ? Math.round((total - atrasados) / total * 1000) / 10 : null };
}

module.exports = { tagsSugeridas, tagsDeProdutos, setTag, produtosComTag, TAGS_PADRAO,
  listarCadernos, salvarCaderno, removerCaderno, registrarExec, execsDoCaderno, resumoCadernos, resumoPorResponsavel };
