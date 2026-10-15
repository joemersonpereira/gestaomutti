// 119_rhia.js — Rhia (IA do sistema): base de conhecimento (fontes + trechos) e histórico.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS rhia_fontes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tipo TEXT NOT NULL,            -- pdf | texto | link
  titulo TEXT NOT NULL,
  url TEXT,
  chars INTEGER DEFAULT 0,
  trechos INTEGER DEFAULT 0,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rhia_chunks (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  fonte_id TEXT NOT NULL,
  ordem INTEGER,
  texto TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rhia_chunks ON rhia_chunks(empresa_id, fonte_id);
CREATE TABLE IF NOT EXISTS rhia_conversas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT,
  pergunta TEXT NOT NULL,
  resposta TEXT,
  fontes TEXT,                   -- JSON com as fontes citadas
  usou_ia INTEGER DEFAULT 0,
  util INTEGER,                  -- feedback: 1 útil / 0 não
  criado_em TEXT DEFAULT (datetime('now'))
);
`);
console.log('✅ migration 119: rhia_fontes + rhia_chunks + rhia_conversas');
