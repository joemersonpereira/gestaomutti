// 017_ocorrencias.js — cadastro de motivos + lançamentos de ocorrência (impacto em indicador)
const db = require('../connection');
const { v4: uuidv4 } = require('uuid');
console.log('▶ Migração 017 — ocorrências');
db.exec(`CREATE TABLE IF NOT EXISTS ocorrencia_motivos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, categoria TEXT NOT NULL,
  motivo TEXT NOT NULL, deducao REAL DEFAULT 0, zera INTEGER DEFAULT 0,
  indicador_alvo TEXT NOT NULL, ativo INTEGER DEFAULT 1
);`);
db.exec(`CREATE TABLE IF NOT EXISTS ocorrencias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT, colaborador_id TEXT NOT NULL,
  motivo_id TEXT, motivo TEXT, deducao REAL DEFAULT 0, zera INTEGER DEFAULT 0,
  categoria TEXT, indicador_alvo TEXT, obs TEXT,
  status TEXT DEFAULT 'ativa', data TEXT, criado_por TEXT, criado_em TEXT DEFAULT (datetime('now'))
);`);
console.log('✓ Migração 017 concluída');
