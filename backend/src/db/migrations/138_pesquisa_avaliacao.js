// 138 — Pesquisas de avaliação interna: colaboradores avaliam SETORES e a GERÊNCIA.
// Admin cadastra período + pontos que quem responde ganha. Resposta é anônima (nota por alvo);
// a participação é registrada à parte (evita 2x e credita os pontos ao respondente).
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS pesquisa_avaliacao (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  inicio TEXT NOT NULL,            -- 'yyyy-MM-dd'
  fim TEXT NOT NULL,              -- 'yyyy-MM-dd'
  pontos_resposta INTEGER DEFAULT 0,
  status TEXT DEFAULT 'aberta',    -- aberta | encerrada
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  encerrada_em TEXT
);
CREATE TABLE IF NOT EXISTS pesquisa_avaliacao_alvo (
  id TEXT PRIMARY KEY,
  pesquisa_id TEXT NOT NULL,
  tipo TEXT NOT NULL,             -- setor | gerencia
  nome TEXT NOT NULL,
  ref_id TEXT,                    -- colaborador_id do gerente (quando tipo=gerencia); NULL p/ setor
  ordem INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pesquisa_avaliacao_resposta (
  id TEXT PRIMARY KEY,
  pesquisa_id TEXT NOT NULL,
  alvo_id TEXT NOT NULL,
  nota INTEGER,                   -- 1..5
  comentario TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pesquisa_avaliacao_participou (
  pesquisa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (pesquisa_id, colaborador_id)
);
CREATE INDEX IF NOT EXISTS idx_pav_emp ON pesquisa_avaliacao(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_pav_alvo ON pesquisa_avaliacao_alvo(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_pav_resp ON pesquisa_avaliacao_resposta(pesquisa_id, alvo_id);
`);
console.log('✅ migration 138: pesquisa_avaliacao (setores & gerência)');
