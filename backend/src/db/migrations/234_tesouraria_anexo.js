// 234_tesouraria_anexo.js — anexos do fechamento de caixa do dia por loja (depósitos e despesas).
// Depósito: PDF/foto do comprovante. Despesa: foto (câmera) ou puxada da pasta da nuvem do gerente.
// Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tesouraria_anexo (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT NOT NULL,
  data TEXT NOT NULL,              -- YYYY-MM-DD do caixa
  tipo TEXT NOT NULL,             -- deposito | despesa
  descricao TEXT,
  valor REAL,
  nome TEXT,
  tipo_mime TEXT,
  dados TEXT,                      -- base64 (data URL)
  origem TEXT,                     -- anexo | foto | pasta
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tesouraria_anexo_dia ON tesouraria_anexo (empresa_id, loja_id, data)`);
console.log('✅ migration 234: tesouraria_anexo');
