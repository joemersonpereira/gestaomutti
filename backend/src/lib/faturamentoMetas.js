// faturamentoMetas.js — metas da tela de Faturamento por ESCOPO (rede/loja/vendedor), COMPETÊNCIA (mês) e indicador.
// escopo ∈ {rede, loja, vendedor}; alvo = '' (rede) | loja_id | usuario_id. competencia = 'YYYY-MM' ou '' (padrão).
const db = require('../db/connection');

const CATALOGO = [
  { chave: 'venda', nome: 'Venda — meta (R$)', unidade: 'R$', direcao: 'maior' },
  { chave: 'venda_super', nome: 'Venda — SUPER meta (R$)', unidade: 'R$', direcao: 'maior', base: 'venda' },
  { chave: 'ticket', nome: 'Ticket médio (R$)', unidade: 'R$', direcao: 'maior' },
  { chave: 'cmv', nome: 'CMV (%)', unidade: '%', direcao: 'menor' },
  { chave: 'unidades', nome: 'Unidades vendidas', unidade: 'un', direcao: 'maior' },
  { chave: 'clientes_identif', nome: 'Clientes identificados (%)', unidade: '%', direcao: 'maior' },
  { chave: 'vitaminas', nome: 'Vitaminas (R$)', unidade: 'R$', direcao: 'maior' },
  // SÓ no Online (canal=entrega) — tempos do atendimento online (Iqnus BotVendas):
  { chave: 'tempo_resposta', nome: 'Tempo de 1ª resposta (min)', unidade: 'min', direcao: 'menor', soOnline: true },
  { chave: 'tempo_atendimento', nome: 'Tempo de atendimento (min)', unidade: 'min', direcao: 'menor', soOnline: true },
];
const CHAVES = new Set(CATALOGO.map(c => c.chave));
// Catálogo conforme o canal: Faturamento (todos) não mostra os tempos (são do Online); o Online
// não mostra "Vendas na entrega" porque a venda dele JÁ é a venda online (Joe 2026-11-13).
function catalogo(canal) {
  const online = canal === 'entrega';
  return CATALOGO.filter(c => online ? c.chave !== 'vitaminas' : !c.soOnline);
}
const ESCOPOS = new Set(['rede', 'loja', 'vendedor']);
const normEsc = e => ESCOPOS.has(e) ? e : 'rede';

const normCanal = c => c === 'entrega' ? 'entrega' : 'todos';
// lista as metas de um canal/escopo/alvo (todas as competências)
function listar(empresaId, { canal = 'todos', escopo = 'rede', alvo = '' } = {}) {
  return db.prepare('SELECT canal, escopo, alvo, competencia, indicador, meta, atualizado_por, atualizado_em FROM faturamento_meta WHERE empresa_id=? AND canal=? AND escopo=? AND alvo=? ORDER BY competencia, indicador')
    .all(empresaId, normCanal(canal), normEsc(escopo), alvo || '');
}
function setMeta(empresaId, { canal = 'todos', escopo = 'rede', alvo = '', competencia = '', indicador, meta } = {}, usuario) {
  if (!CHAVES.has(indicador)) throw new Error('Indicador desconhecido.');
  const comp = /^\d{4}-\d{2}$/.test(competencia) ? competencia : '';
  const v = (meta === '' || meta == null) ? null : Number(meta);
  db.prepare(`INSERT INTO faturamento_meta (empresa_id, canal, escopo, alvo, competencia, indicador, meta, atualizado_por, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, canal, escopo, alvo, competencia, indicador) DO UPDATE SET meta=excluded.meta, atualizado_por=excluded.atualizado_por, atualizado_em=excluded.atualizado_em`)
    .run(empresaId, normCanal(canal), normEsc(escopo), alvo || '', comp, indicador, v, usuario?.nome || null);
  return { ok: true };
}
// grava várias de uma vez (replicar mês→frente, puxar histórico). itens = [{escopo,alvo,competencia,indicador,meta}]
function setLote(empresaId, itens = [], usuario) {
  const tx = db.transaction(list => list.forEach(it => setMeta(empresaId, it, usuario)));
  tx(Array.isArray(itens) ? itens : []);
  return { ok: true, gravadas: (itens || []).length };
}
function remover(empresaId, { canal = 'todos', escopo = 'rede', alvo = '', competencia = '', indicador } = {}) {
  db.prepare('DELETE FROM faturamento_meta WHERE empresa_id=? AND canal=? AND escopo=? AND alvo=? AND competencia=? AND indicador=?')
    .run(empresaId, normCanal(canal), normEsc(escopo), alvo || '', competencia || '', indicador);
  return { ok: true };
}
// Efetiva: comp-específica → padrão (comp='') do mesmo canal/escopo/alvo.
function metaEfetiva(empresaId, { canal = 'todos', escopo = 'rede', alvo = '', competencia = '', indicador } = {}) {
  const q = c => db.prepare('SELECT meta FROM faturamento_meta WHERE empresa_id=? AND canal=? AND escopo=? AND alvo=? AND competencia=? AND indicador=?')
    .get(empresaId, normCanal(canal), normEsc(escopo), alvo || '', c || '', indicador);
  for (const c of [competencia, '']) { const r = q(c); if (r && r.meta != null) return r.meta; }
  return null;
}

module.exports = { CATALOGO, catalogo, listar, setMeta, setLote, remover, metaEfetiva };
