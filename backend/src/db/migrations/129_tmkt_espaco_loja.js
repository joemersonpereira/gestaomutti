// 129 — espaço por loja (quantidade + preço), replicando o "AreasEEspacosDaLoja" do TradeMkt.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS tmkt_espaco_loja (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  loja_id TEXT, loja_nome TEXT NOT NULL,
  area TEXT NOT NULL, espaco TEXT NOT NULL,
  quantidade INTEGER DEFAULT 1, preco_unit REAL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tmkt_el_loja ON tmkt_espaco_loja(empresa_id, loja_nome);
`);
console.log('✅ migration 129: tmkt_espaco_loja');
