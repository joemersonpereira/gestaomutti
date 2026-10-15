// 080 — Comunidade (intranet social / mural estilo feed).
// Feed de posts: comunicados oficiais, posts livres (bom dia/interação), enquetes e
// conquistas. Curtidas, comentários, confirmação de leitura de comunicado e votos de enquete.
const db = require('../connection');
console.log('▶ Migração 080 — Comunidade (mural)');
db.exec(`
CREATE TABLE IF NOT EXISTS mural_posts (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  autor_id TEXT,                      -- colaborador (null = sistema, ex.: conquista)
  autor_nome TEXT,
  tipo TEXT NOT NULL DEFAULT 'post',  -- 'post' | 'comunicado' | 'enquete' | 'conquista'
  titulo TEXT,
  texto TEXT,
  imagem TEXT,                        -- base64 (opcional)
  loja_id TEXT,                       -- null = rede toda; senão só a loja
  fixado INTEGER DEFAULT 0,           -- comunicado fixado no topo
  exige_leitura INTEGER DEFAULT 0,    -- comunicado que pede "confirmar leitura"
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mural_curtidas (
  post_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, colaborador_id)
);
CREATE TABLE IF NOT EXISTS mural_comentarios (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  autor_id TEXT NOT NULL,
  autor_nome TEXT,
  texto TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mural_leituras (
  post_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, colaborador_id)
);
CREATE TABLE IF NOT EXISTS mural_enquete_opcoes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  texto TEXT NOT NULL,
  ordem INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mural_enquete_votos (
  post_id TEXT NOT NULL,
  opcao_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, colaborador_id)
);
CREATE INDEX IF NOT EXISTS idx_mural_feed ON mural_posts(empresa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_mural_coment ON mural_comentarios(post_id, criado_em);
`);
console.log('  + mural_posts, mural_curtidas, mural_comentarios, mural_leituras, mural_enquete_opcoes/votos');
console.log('✓ Migração 080 concluída.');
