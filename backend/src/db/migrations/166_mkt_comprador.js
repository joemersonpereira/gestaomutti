// 166 — Vincular comprador à ação de marketing: ele passa a lista de produtos em oferta
// dentro de um prazo (tarefa). Se não responder no prazo → impacta a premiação (indicador).
const db = require('../connection');
for (const [c, t] of [
  ['comprador_id', 'TEXT'], ['comprador_prazo', 'TEXT'], ['comprador_status', 'TEXT'],
  ['comprador_resposta', 'TEXT'], ['comprador_respondido_em', 'TEXT'], ['comprador_no_prazo', 'INTEGER'], ['comprador_tarefa_id', 'TEXT'],
]) { try { db.exec(`ALTER TABLE mkt_agenda ADD COLUMN ${c} ${t}`); } catch { /* já existe */ } }
console.log('✅ migration 166: mkt_agenda comprador vinculado (lista de ofertas + prazo + resposta)');
