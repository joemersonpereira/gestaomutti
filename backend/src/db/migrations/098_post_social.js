// 098 — Post social #EuSouGrupoMutti: colaborador envia o print da publicação,
// abre uma tarefa de aprovação; aprovado, os pontos caem (autoral 15 / repost 5).
const db = require('../connection');
console.log('▶ Migração 098 — Post social (comprovante → tarefa → pontos)');
db.exec(`
CREATE TABLE IF NOT EXISTS post_social (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  colaborador_nome TEXT,
  loja_id TEXT,
  tipo TEXT NOT NULL,            -- autoral | repost
  rede TEXT,                     -- instagram | tiktok | linkedin | facebook | x
  link TEXT,
  imagem TEXT,                   -- print (data URL base64)
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | aprovado | rejeitado
  competencia TEXT,             -- 'YYYY-MM' (limite de 2/mês)
  tarefa_id TEXT,
  avaliado_por TEXT,
  motivo_rejeicao TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  avaliado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_psocial ON post_social(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_psocial_colab ON post_social(empresa_id, colaborador_id, competencia);
`);
console.log('✓ Migração 098 concluída.');
