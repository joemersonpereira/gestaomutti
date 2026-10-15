// 086 — Posts programados (agendamento) + Canal de escuta (ouvidoria).
const db = require('../connection');
console.log('▶ Migração 086 — agendamento + ouvidoria');

// Agendamento: publicar_em nulo = já publicado; futuro = aparece só na hora.
const cols = db.prepare('PRAGMA table_info(mural_posts)').all().map(c => c.name);
if (!cols.includes('publicar_em')) { db.exec('ALTER TABLE mural_posts ADD COLUMN publicar_em TEXT'); console.log('  + mural_posts.publicar_em'); }
else console.log('  = mural_posts.publicar_em já existe');

// Canal de escuta: denúncia / sugestão / reclamação (pode ser anônimo).
db.exec(`
CREATE TABLE IF NOT EXISTS ouvidoria (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tipo TEXT NOT NULL,            -- 'denuncia' | 'sugestao' | 'reclamacao' | 'elogio'
  texto TEXT NOT NULL,
  anonimo INTEGER DEFAULT 0,
  colaborador_id TEXT,           -- null quando anônimo
  colaborador_nome TEXT,
  loja_id TEXT,
  status TEXT DEFAULT 'aberto',  -- 'aberto' | 'em_analise' | 'resolvido'
  resposta TEXT,
  respondido_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_ouvidoria ON ouvidoria(empresa_id, status, criado_em);
`);
console.log('  + tabela ouvidoria');
console.log('✓ Migração 086 concluída.');
