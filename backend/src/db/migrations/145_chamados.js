// 145 — Suporte / Chamados: qualquer colaborador abre um chamado (dúvida, erro do sistema,
// solicitação); o time de Suporte/TI acompanha por status e responde. Departamento "Logística & Suporte".
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS chamados (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  aberto_por TEXT,
  aberto_nome TEXT,
  loja_id TEXT,
  loja_nome TEXT,
  categoria TEXT NOT NULL DEFAULT 'sistema',
  titulo TEXT NOT NULL,
  descricao TEXT,
  prioridade TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'aberto',
  responsavel_id TEXT,
  responsavel_nome TEXT,
  resposta TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT DEFAULT (datetime('now')),
  fechado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_chamados_emp ON chamados(empresa_id, status, criado_em);
`);
console.log('✅ migration 145: chamados');
