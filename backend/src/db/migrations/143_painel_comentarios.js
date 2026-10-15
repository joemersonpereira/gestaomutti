// 143 — Comentários por painel: quem tem acesso a um painel/bloco pode comentar nele (deixar
// informações, notas, contexto) — uma "comunidade da gestão" em cima dos indicadores.
// painel_key identifica o painel/bloco (ex.: 'diretoria:financeiro', 'compras:orcamento').
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS painel_comentarios (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  painel_key TEXT NOT NULL,
  autor_id TEXT,
  autor_nome TEXT,
  autor_funcao TEXT,
  texto TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_painel_com ON painel_comentarios(empresa_id, painel_key, criado_em);
`);
console.log('✅ migration 143: painel_comentarios');
