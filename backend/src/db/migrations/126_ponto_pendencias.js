// 126_ponto_pendencias.js — controle de pendências de ponto (tarefa ao colaborador + penalidade em pontos).
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS ponto_pendencias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  data TEXT NOT NULL,                 -- dia da pendência
  tipo TEXT DEFAULT 'incompleto',     -- incompleto (marcação em aberto)
  tarefa_id TEXT,                     -- tarefa gerada p/ o colaborador corrigir
  resolvido INTEGER DEFAULT 0, resolvido_em TEXT,
  pontos_descontados INTEGER DEFAULT 0, ultimo_desconto_em TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ponto_pend_uniq ON ponto_pendencias(empresa_id, colaborador_id, data);
`);
console.log('✅ migration 126: ponto_pendencias');
