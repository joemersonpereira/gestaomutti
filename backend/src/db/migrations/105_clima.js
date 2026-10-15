// 105 — Pesquisa de clima (eNPS interno). Campanhas periódicas, respostas ANÔNIMAS
// (sem colaborador_id) e participação registrada à parte (para evitar duplicidade e medir adesão).
const db = require('../connection');
console.log('▶ Migração 105 — Pesquisa de clima');
db.exec(`
CREATE TABLE IF NOT EXISTS clima_campanhas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  titulo TEXT,
  status TEXT NOT NULL DEFAULT 'aberta', -- aberta | encerrada
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  encerrada_em TEXT
);
CREATE TABLE IF NOT EXISTS clima_respostas (
  id TEXT PRIMARY KEY,
  campanha_id TEXT NOT NULL,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,                 -- p/ segmentação (só agregada, N>=3)
  s_geral INTEGER, s_lideranca INTEGER, s_ambiente INTEGER, s_remuneracao INTEGER,
  s_crescimento INTEGER, s_reconhecimento INTEGER, s_carga INTEGER, s_ferramentas INTEGER,
  enps INTEGER,                 -- 0..10 (recomendaria a empresa)
  comentario TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clima_participou (
  campanha_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campanha_id, colaborador_id)
);
CREATE INDEX IF NOT EXISTS idx_clima_resp ON clima_respostas(campanha_id);
`);
console.log('✓ Migração 105 concluída.');
