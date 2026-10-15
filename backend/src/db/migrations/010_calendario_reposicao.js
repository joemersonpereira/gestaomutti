// 010_calendario_reposicao.js — calendário de vendas (supervisão) + reposição diária (disciplina)
const db = require('../connection');
console.log('▶ Migração 010 — calendário + reposição');
db.exec(`CREATE TABLE IF NOT EXISTS dias_nao_uteis (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  data TEXT NOT NULL, tipo TEXT DEFAULT 'feriado', UNIQUE(empresa_id, loja_id, data)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS reposicao_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL, data TEXT NOT NULL, fez INTEGER DEFAULT 1,
  UNIQUE(empresa_id, colaborador_id, data)
);`);
console.log('✓ Migração 010 concluída');
