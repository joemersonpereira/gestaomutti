// 250_tmkt_custo.js — CUSTOS do trade (prestação de contas da empresa). Ex.: a vitrine foi vendida
// por R$100, mas a impressão do adesivo custou R$150 → a empresa teve custo. Lançar os custos aqui
// pra calcular o RESULTADO real do trade (valor recebido − custos). Controle interno. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_custo (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  venda_id TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,            -- impressao | material | montagem | frete | outro
  valor REAL NOT NULL DEFAULT 0,
  data TEXT,
  comprovante_foto TEXT,
  comprovante_mime TEXT,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_custo_venda ON tmkt_custo (empresa_id, venda_id)`);
console.log('✅ migration 250: tmkt_custo (custos / prestação de contas da empresa)');
