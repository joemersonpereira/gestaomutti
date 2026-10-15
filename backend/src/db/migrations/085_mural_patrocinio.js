// 085 — Espaço patrocinado na Comunidade (marcas que pagam para aparecer).
const db = require('../connection');
console.log('▶ Migração 085 — patrocínio');
db.exec(`
CREATE TABLE IF NOT EXISTS mural_patrocinio (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  titulo TEXT,
  imagem TEXT,          -- logo/banner base64
  link TEXT,
  ativo INTEGER DEFAULT 1,
  ordem INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);
`);
console.log('  + mural_patrocinio');
console.log('✓ Migração 085 concluída.');
