// 151 — Serviços farmacêuticos: registro dos atendimentos/serviços realizados (aplicação de
// injetável, aferição de pressão, glicemia, nebulização, etc.) por profissional. Dá controle
// por farmacêutico/vendedor e serve de fonte para o indicador de atendimento farmacêutico.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS servicos_farmaceuticos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,
  loja_nome TEXT,
  colaborador_id TEXT,
  colaborador_nome TEXT,
  tipo TEXT NOT NULL,
  cliente TEXT,
  valor REAL DEFAULT 0,
  obs TEXT,
  data TEXT NOT NULL,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_servfarm ON servicos_farmaceuticos(empresa_id, loja_id, data);
CREATE INDEX IF NOT EXISTS idx_servfarm_colab ON servicos_farmaceuticos(empresa_id, colaborador_id, data);
`);
console.log('✅ migration 151: servicos_farmaceuticos');
