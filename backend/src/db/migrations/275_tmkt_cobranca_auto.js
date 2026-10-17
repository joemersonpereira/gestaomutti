// 275_tmkt_cobranca_auto.js — cobrança por e-mail automática (Joe 2026-10-16):
// tmkt_parcelas.cobranca_em = quando mandamos a última cobrança daquela parcela (evita spam diário).
// A automação é OPT-IN: configuracoes.tmkt_cobranca_auto ('1' liga) + tmkt_cobranca_dias (reenvio).
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_parcelas ADD COLUMN cobranca_em TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
// garante a tabela de configurações (chave/valor por empresa) — já existe no sistema
console.log('✅ migration 275: tmkt_parcelas.cobranca_em (cobrança automática opt-in)');
