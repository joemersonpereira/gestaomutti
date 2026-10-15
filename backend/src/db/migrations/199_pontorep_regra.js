// 199_pontorep_regra.js — REGRAS DE PONTO (N regras nomeadas, uma padrão, colaboradores
// vinculados por vigência) — como o Sólides/Tangerino. Idempotente.
const db = require('../connection');
const { v4: uuid } = require('uuid');
const EMP = 'empresa-mutti-001';

db.exec(`CREATE TABLE IF NOT EXISTS pontorep_regra (
  id               TEXT PRIMARY KEY,
  empresa_id       TEXT NOT NULL,
  nome             TEXT NOT NULL,
  descricao        TEXT,
  padrao           INTEGER DEFAULT 0,
  tipo_controle    TEXT DEFAULT 'banco',      -- banco | extra
  controle_atraso  TEXT DEFAULT 'flexivel',   -- flexivel | rigido
  tolerancia_min   INTEGER DEFAULT 10,
  dia_fechamento   INTEGER DEFAULT 25,
  codigo_externo   TEXT,
  noturno_ini      TEXT DEFAULT '22:00',
  noturno_fim      TEXT DEFAULT '05:00',
  noturno_tipo     TEXT DEFAULT 'padrao',
  noturno_estendida INTEGER DEFAULT 0,
  he_json          TEXT,                       -- percentuais/fases de hora extra
  banco_json       TEXT,                       -- config do banco de horas
  ativo            INTEGER DEFAULT 1,
  criado_em        TEXT DEFAULT (datetime('now')),
  atualizado_em    TEXT,
  UNIQUE(empresa_id, nome)
)`);

// Vínculo colaborador ↔ regra, VERSIONADO por vigência (nunca apaga o histórico)
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_regra_colaborador (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  regra_id       TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  vigencia_ini   TEXT NOT NULL,
  vigencia_fim   TEXT,
  criado_em      TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_pontorep_regra_colab ON pontorep_regra_colaborador (empresa_id, colaborador_id, vigencia_ini)`);

// Semeia uma regra padrão inicial se não houver nenhuma
const n = db.prepare(`SELECT COUNT(*) n FROM pontorep_regra WHERE empresa_id=?`).get(EMP).n;
if (!n) {
  const he = JSON.stringify({ tipo1_pct: 50, tipo2_pct: 100, tipo3_pct: 0, tipo4_pct: 0 });
  const banco = JSON.stringify({ validade_meses: 12, descontar_faltas: 1, calcular_vencimento: 'competencia' });
  db.prepare(`INSERT INTO pontorep_regra (id,empresa_id,nome,descricao,padrao,tipo_controle,controle_atraso,tolerancia_min,dia_fechamento,he_json,banco_json)
    VALUES (?,?,?,?,1,'banco','flexivel',10,25,?,?)`).run(uuid(), EMP, 'Regra Padrão', 'Regra de ponto padrão do grupo', he, banco);
  console.log('✅ migration 199: pontorep_regra + vínculo criados (1 regra padrão semeada)');
} else {
  console.log('✅ migration 199: pontorep_regra + vínculo criados (já havia', n, 'regras)');
}
