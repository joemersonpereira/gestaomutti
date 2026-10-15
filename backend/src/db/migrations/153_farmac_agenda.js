// 153 — Cuidado farmacêutico (fase 2): intercorrência/alerta no atendimento + agenda de
// atendimentos (marcar/retorno) com lembrete.
const db = require('../connection');
try { db.exec('ALTER TABLE servicos_farmaceuticos ADD COLUMN intercorrencia TEXT'); } catch { /* já existe */ }
db.exec(`
CREATE TABLE IF NOT EXISTS agendamentos_farmac (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT, loja_nome TEXT,
  paciente_id TEXT, paciente_nome TEXT, colaborador_id TEXT,
  tipo TEXT, data TEXT NOT NULL, hora TEXT, obs TEXT,
  status TEXT DEFAULT 'agendado',
  servico_origem_id TEXT,
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agfarm ON agendamentos_farmac(empresa_id, data, status);
`);
console.log('✅ migration 153: intercorrência + agenda farmacêutica');
