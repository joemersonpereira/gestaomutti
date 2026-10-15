// 088 — Auto-cadastro do colaborador por link (ele preenche dados + anexa documentos).
const db = require('../connection');
console.log('▶ Migração 088 — auto-cadastro');
db.exec(`
CREATE TABLE IF NOT EXISTS autocadastro (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'aguardando', -- aguardando | preenchido | aprovado | rejeitado
  funcao_id TEXT,          -- RH pode sugerir função/loja (define na aprovação)
  loja_id TEXT,
  convite_nome TEXT,       -- nome de referência que o RH deu ao convite
  -- dados preenchidos pelo colaborador:
  nome TEXT, cpf TEXT, rg TEXT, nascimento TEXT, telefone TEXT, email TEXT, endereco TEXT, dados_extra TEXT,
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now')),
  preenchido_em TEXT, aprovado_por TEXT, aprovado_em TEXT, colaborador_id TEXT, obs TEXT
);
CREATE TABLE IF NOT EXISTS autocadastro_docs (
  id TEXT PRIMARY KEY,
  autocadastro_id TEXT NOT NULL,
  nome TEXT, mime TEXT, dados TEXT, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_autocad ON autocadastro(empresa_id, status);
`);
console.log('  + autocadastro, autocadastro_docs');
console.log('✓ Migração 088 concluída.');
