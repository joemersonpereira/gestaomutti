// 014_checklist_gerente.js — checklist único do gerente (abre de manhã, fecha no fim do dia)
const db = require('../connection');
console.log('▶ Migração 014 — checklist do gerente (único)');
db.exec(`CREATE TABLE IF NOT EXISTS gerente_checklist (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  secao TEXT NOT NULL, item TEXT NOT NULL, avaliacao TEXT,
  UNIQUE(empresa_id, loja_id, data, secao, item)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS gerente_checklist_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  aberto_em TEXT, fechado_em TEXT, fechado INTEGER DEFAULT 0,
  limpeza_status TEXT, limpeza_motivo TEXT,
  UNIQUE(empresa_id, loja_id, data)
);`);
console.log('✓ Migração 014 concluída');
