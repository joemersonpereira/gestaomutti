// 204_estagios_docs.js — armazém genérico (doc por coleção) do módulo Estágios e Faturas
// (estagiários, pagamentos, cartões, compras, parcelas, fornecedores, notas, planos). Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS estagios_docs (
  empresa_id    TEXT NOT NULL,
  colecao       TEXT NOT NULL,
  doc_id        TEXT NOT NULL,
  data_json     TEXT,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, colecao, doc_id)
)`);
console.log('✅ migration 204: estagios_docs criada');
