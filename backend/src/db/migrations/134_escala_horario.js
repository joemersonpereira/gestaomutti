// 134 — Escala de horário semanal/mensal por colaborador (horário previsto de entrada/saída).
// Serve para cruzar a CHEGADA (1ª batida do Tangerino) com o horário previsto − 5 min (orientação: chegar 5 min antes).
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS escala_horario (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,
  colaborador_id TEXT NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  dia_semana INTEGER,        -- 0=Dom .. 6=Sáb (padrão semanal recorrente no mês); NULL se for data específica
  data TEXT,                 -- 'yyyy-MM-dd' (exceção de um dia específico); NULL se semanal
  entrada TEXT,              -- 'HH:MM' (horário previsto de entrada)
  saida TEXT,                -- 'HH:MM' (opcional)
  folga INTEGER DEFAULT 0,   -- 1 = dia de folga (não cobra chegada)
  criado_por_id TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_escala_hor_uq
  ON escala_horario(empresa_id, colaborador_id, ano, mes, IFNULL(dia_semana,-1), IFNULL(data,''));
CREATE INDEX IF NOT EXISTS idx_escala_hor_lookup ON escala_horario(empresa_id, colaborador_id, ano, mes);
`);
console.log('✅ migration 134: escala_horario');
