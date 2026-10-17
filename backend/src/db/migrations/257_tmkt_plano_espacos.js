// 257_tmkt_plano_espacos.js — amarração PLANO COMERCIAL ↔ POSIÇÕES (Joe 2026-10-16).
// Um plano comercial é um PACOTE que inclui posições reais (espaço de loja, tabloide, e-commerce,
// rede social, rádio, CRM). Ao COMPRAR o plano, essas posições viram venda_espacos e TRAVAM a vaga
// (entram no vagasLivres por período, igual a uma compra avulsa). Aqui guardamos quais posições e
// quantas vagas de cada o plano consome. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_plano_espacos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  plano_id   TEXT NOT NULL,
  espaco_id  TEXT NOT NULL,          -- aponta p/ tmkt_espaco_loja (qualquer segmento)
  quantidade INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_plano_esp ON tmkt_plano_espacos (empresa_id, plano_id)`);
// marca que a venda veio de um plano comercial (p/ rastrear o pacote)
try { db.exec(`ALTER TABLE tmkt_vendas ADD COLUMN plano_id TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 257: tmkt_plano_espacos (plano ↔ posições) + tmkt_vendas.plano_id');
