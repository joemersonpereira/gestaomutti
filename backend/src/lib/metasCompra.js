// metasCompra.js — metas sugeridas (defaults) + overrides editáveis por empresa.
const db = require('../db/connection');

// Metas sugeridas por indicador. label/unidade/dica ajudam o front a montar os editores.
const SUGERIDO = {
  termometro_nota:     { valor: 80,     label: 'Nota mínima do fornecedor (verde)', un: 'pts', tela: 'termometro' },
  entrega_atraso_max:  { valor: 15,     label: 'Atraso de entrega máximo', un: '%', tela: 'termometro' },
  visita_faixa:        { valor: 500000, label: 'Compra acumulada p/ sugerir visita', un: 'R$', tela: 'visitas' },
  transf_dias:         { valor: 7,      label: 'Dias p/ transferência ser "atrasada"', un: 'dias', tela: 'remanejamento' },
  ruptura_max:         { valor: 5,      label: 'Ruptura máxima aceitável', un: '%', tela: 'estoque' },
  vencido_perda_max:   { valor: 5,      label: 'Perda por vencimento máxima', un: '%', tela: 'vencidos' },
  remanejar_meta:      { valor: 80,     label: 'Meta de remanejar itens vencendo', un: '%', tela: 'vencidos' },
  falta_dias_atender:  { valor: 3,      label: 'Prazo p/ atender uma falta', un: 'dias', tela: 'faltas' },
  falta_atendimento_meta: { valor: 90,  label: 'Meta de faltas atendidas', un: '%', tela: 'faltas' },
  cobertura_min:       { valor: 30,     label: 'Cobertura de estoque mínima', un: 'dias', tela: 'estoque' },
  cobertura_max:       { valor: 45,     label: 'Cobertura de estoque máxima', un: 'dias', tela: 'estoque' },
  cmv_meta:            { valor: null,   label: 'Meta de CMV (vazio = usa o real)', un: '%', tela: 'orcamento' },
  crescimento_meta:    { valor: null,   label: 'Crescimento anual desejado', un: '%', tela: 'orcamento' },
  conversao_novos_janela: { valor: 90,  label: 'Janela p/ avaliar produto novo (maturidade)', un: 'dias', tela: 'estoque' },
  conversao_novos_meta:   { valor: 70,  label: 'Meta de conversão de produtos novos (vendem)', un: '%', tela: 'estoque' },
};

// Metas resolvidas — 3 níveis: comprador (compras_metas_comprador) → geral (compras_metas) → sugerida (código).
// getMetas devolve por chave: { sugerido, geral(override geral|null), valor(override do NÍVEL editado|null), usado }.
function getMetas(empresaId, compradorId = null) {
  const geral = {};
  for (const r of db.prepare('SELECT chave, valor FROM compras_metas WHERE empresa_id=?').all(empresaId)) geral[r.chave] = r.valor;
  const comp = {};
  if (compradorId) for (const r of db.prepare('SELECT chave, valor FROM compras_metas_comprador WHERE empresa_id=? AND comprador_id=?').all(empresaId, Number(compradorId))) comp[r.chave] = r.valor;
  const out = {};
  for (const [k, def] of Object.entries(SUGERIDO)) {
    const cTem = Object.prototype.hasOwnProperty.call(comp, k) && comp[k] != null;
    const gTem = Object.prototype.hasOwnProperty.call(geral, k) && geral[k] != null;
    const usado = cTem ? comp[k] : (gTem ? geral[k] : def.valor);
    const valor = compradorId ? (cTem ? comp[k] : null) : (gTem ? geral[k] : null); // override do nível sendo editado
    out[k] = { ...def, sugerido: def.valor, geral: gTem ? geral[k] : null, valor, usado, porComprador: !!compradorId };
  }
  return out;
}

// Só os valores "usados" (comprador → geral → sugerido) — para os cálculos.
function metaVals(empresaId, compradorId = null) {
  const m = getMetas(empresaId, compradorId);
  const out = {};
  for (const k of Object.keys(m)) out[k] = m[k].usado;
  return out;
}

// Grava a meta: se compradorId → override do comprador (compras_metas_comprador); senão → meta geral (compras_metas).
function setMeta(empresaId, chave, valor, compradorId = null) {
  if (!SUGERIDO[chave]) return false;
  const v = valor === '' || valor == null ? null : Number(valor);
  if (compradorId) {
    const cid = Number(compradorId);
    if (v == null) db.prepare('DELETE FROM compras_metas_comprador WHERE empresa_id=? AND comprador_id=? AND chave=?').run(empresaId, cid, chave);
    else db.prepare(`INSERT INTO compras_metas_comprador (empresa_id,comprador_id,chave,valor,atualizado_em) VALUES (?,?,?,?,datetime('now'))
      ON CONFLICT(empresa_id,comprador_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`).run(empresaId, cid, chave, v);
  } else {
    if (v == null) db.prepare('DELETE FROM compras_metas WHERE empresa_id=? AND chave=?').run(empresaId, chave);
    else db.prepare(`INSERT INTO compras_metas (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
      ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`).run(empresaId, chave, v);
  }
  return true;
}

module.exports = { SUGERIDO, getMetas, metaVals, setMeta };
