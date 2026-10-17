// 267_tmkt_limites_rede.js — limite de veiculação das redes (Joe 2026-10-16):
// as redes são limitadas — ex.: X posts por DIA e Y por MÊS. A gestão cadastra os dois.
//   limite_dia = máximo de inserções por dia (0/NULL = sem limite diário)
//   limite_mes = máximo de inserções no mês (usa 'quantidade' como padrão se nulo)
// Idempotente.
const db = require('../connection');
for (const c of ['limite_dia', 'limite_mes']) {
  try { db.exec(`ALTER TABLE tmkt_espaco_loja ADD COLUMN ${c} INTEGER`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
// padrão: limite_mes = quantidade atual nas redes sociais (o estoque já cadastrado é mensal)
const EMP = 'empresa-mutti-001';
db.prepare(`UPDATE tmkt_espaco_loja SET limite_mes=quantidade WHERE empresa_id=? AND segmento='social' AND limite_mes IS NULL`).run(EMP);
console.log('✅ migration 267: tmkt_espaco_loja.limite_dia + limite_mes (limite das redes)');
