// 262_tmkt_plano_lojas.js — veiculação do plano comercial nas lojas (Joe 2026-10-16):
//   lojas_json = lista de lojas (ids do app) onde o plano roda. Posições físicas já têm loja;
//   isto é a veiculação EXPLÍCITA que o Joe pediu ("ter veiculação do plano comercial nas lojas").
// Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_plano ADD COLUMN lojas_json TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 262: tmkt_plano.lojas_json (veiculação nas lojas)');
