// 157 — Avaliação do atendimento farmacêutico pelo paciente (via QR/link público).
// Uma avaliação por serviço; alimenta o resumo de satisfação do Cuidado Farmacêutico.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS farmac_avaliacoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,
  servico_id TEXT NOT NULL UNIQUE,
  paciente_id TEXT,
  colaborador_id TEXT,
  nota INTEGER NOT NULL,
  comentario TEXT,
  ip TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_farmac_aval_emp ON farmac_avaliacoes(empresa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_farmac_aval_colab ON farmac_avaliacoes(colaborador_id);
`);
console.log('✅ migration 157: tabela farmac_avaliacoes (avaliação do atendimento pelo paciente)');
