// 144 — Chat interno da gestão (escritório): sala única onde o pessoal do escritório conversa entre si.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS gestao_chat (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  autor_id TEXT,
  autor_nome TEXT,
  autor_funcao TEXT,
  texto TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gestao_chat ON gestao_chat(empresa_id, criado_em);
`);
console.log('✅ migration 144: gestao_chat');
