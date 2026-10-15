// 200_pontorep_tratamento.js — Apropriação de Horas: CAMADA DE TRATAMENTO do RH por cima da
// batida ORIGINAL (que continua imutável, Portaria 671). A apuração usa o tratamento quando existe.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_tratamento (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  data           TEXT NOT NULL,          -- 'YYYY-MM-DD'
  horarios_json  TEXT,                   -- lista de 'HH:MM' que passa a valer no cálculo
  tipo           TEXT DEFAULT 'ajuste',  -- ajuste | inclusao | desconsideracao | abono
  motivo         TEXT,
  autor_id       TEXT,
  criado_em      TEXT DEFAULT (datetime('now')),
  atualizado_em  TEXT,
  UNIQUE(empresa_id, colaborador_id, data)
)`);
console.log('✅ migration 200: pontorep_tratamento criada');
