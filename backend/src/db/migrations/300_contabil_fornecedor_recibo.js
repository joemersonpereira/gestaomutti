// 300_contabil_fornecedor_recibo.js — recibo/boleto (comprovante) do fornecedor que NÃO emite NF
// tradicional mas informa dados fiscais no boleto (contas de consumo: Luz, Água, Telefone…).
// Um recibo por fornecedor + competência (mês). Idempotente.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS contabil_fornecedor_recibo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id  TEXT NOT NULL,
  pessoa_id   TEXT NOT NULL,
  competencia TEXT NOT NULL,          -- 'AAAA-MM'
  nome        TEXT,
  tipo_mime   TEXT,
  dados       TEXT,                   -- base64
  tamanho     INTEGER,
  usuario_id  TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fornrecibo ON contabil_fornecedor_recibo (empresa_id, pessoa_id, competencia);
`);
console.log('✅ migration 300: contabil_fornecedor_recibo');
