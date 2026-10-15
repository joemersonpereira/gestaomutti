// 049 — escala de feriado/fim de semana (horário + turnos + equipe)
const db = require('../connection');
console.log('▶ Migração 049 — feriado_escala');
db.exec(`CREATE TABLE IF NOT EXISTS feriado_escala (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  tipo TEXT, modo TEXT, status TEXT,
  turnos_json TEXT, criado_por_id TEXT, gerente_id TEXT,
  gerente_obs TEXT, supervisor_obs TEXT,
  criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT,
  UNIQUE(empresa_id, loja_id, data)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS feriado_escala_equipe (
  id TEXT PRIMARY KEY, escala_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  turno_nome TEXT, horario_custom TEXT, incluido_por TEXT,
  ciencia INTEGER DEFAULT 0, ciencia_em TEXT, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(escala_id, colaborador_id)
);`);
console.log('✓ Migração 049 concluída');
