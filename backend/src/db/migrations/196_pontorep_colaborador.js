// 196_pontorep_colaborador.js — configuração por colaborador (travar hora extra) e
// REGRA DE PONTO por colaborador com VIGÊNCIA versionada (trocar sem apagar o histórico;
// a nova regra só passa a valer a partir da data informada). Idempotente.
const db = require('../connection');

// Config por colaborador
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_colaborador_config (
  empresa_id      TEXT NOT NULL,
  colaborador_id  TEXT NOT NULL,
  bloqueia_he     INTEGER DEFAULT 0,    -- 1 = não aceita hora extra (escala/apuração alertam)
  tol_encerrar_min INTEGER,             -- override da tolerância p/ alerta "encerrar o ponto" (min além da jornada)
  observacao      TEXT,
  atualizado_em   TEXT,
  PRIMARY KEY (empresa_id, colaborador_id)
)`);

// Regra de ponto por colaborador — VERSIONADA por vigência (nunca sobrescreve a anterior)
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_colaborador_regra (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  modelo_id     TEXT NOT NULL,          -- aponta p/ pontorep_escala_modelo (a "regra de ponto")
  vigencia_ini  TEXT NOT NULL,          -- 'YYYY-MM-DD' — começa a valer nesta data
  vigencia_fim  TEXT,                   -- NULL = vigente; preenchido quando uma nova regra assume
  criado_por_id TEXT,
  criado_em     TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_pontorep_colab_regra ON pontorep_colaborador_regra (empresa_id, colaborador_id, vigencia_ini)`);

console.log('✅ migration 196: pontorep_colaborador_config + pontorep_colaborador_regra (vigência) criados');
