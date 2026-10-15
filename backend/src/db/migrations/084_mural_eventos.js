// 084 — Agenda de eventos da Comunidade (a gestão/RH cadastra; todos veem).
const db = require('../connection');
console.log('▶ Migração 084 — agenda de eventos');
db.exec(`
CREATE TABLE IF NOT EXISTS mural_eventos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data TEXT NOT NULL,        -- AAAA-MM-DD
  hora TEXT,                 -- HH:MM (opcional)
  local TEXT,
  loja_id TEXT,              -- null = rede toda
  autor_id TEXT,
  autor_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eventos_data ON mural_eventos(empresa_id, data);
`);
console.log('  + mural_eventos');
console.log('✓ Migração 084 concluída.');
