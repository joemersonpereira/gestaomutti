// 303_contabil_centralizador.js — "centralizador" de credores: agrupa fornecedores pela DESCRIÇÃO/NOME
// (ex.: FAMPESA LIMPEZA, FAMPESA ESCRITORIO) somando os títulos de todos que batem no filtro — inclusive
// de lojas diferentes — e tratando o conjunto como UM fornecedor (classificação + recibo). Pros credores
// sem CNPJ/sem NF no ERP (terceirizados de serviço: limpeza, entrega…), que hoje caem como "sem nota".
// filtros = um por linha; casa por "nome do credor CONTÉM o filtro" (case-insensitive). Idempotente.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS contabil_centralizador (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id  TEXT NOT NULL,
  nome        TEXT NOT NULL,
  filtros     TEXT,                 -- um filtro de nome por linha
  emite_nf    INTEGER DEFAULT 1,
  consumo     INTEGER DEFAULT 0,
  motivo      TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_centralizador_emp ON contabil_centralizador (empresa_id);
`);
console.log('✅ migration 303: contabil_centralizador');
