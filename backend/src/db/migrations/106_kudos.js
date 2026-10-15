// 106 — Kudos: reconhecimento entre colegas. Vira post na Comunidade e dá pontos ao
// colega reconhecido (com limite diário para o remetente, contra farm de pontos).
const db = require('../connection');
console.log('▶ Migração 106 — Kudos (reconhecimento entre colegas)');
db.exec(`
CREATE TABLE IF NOT EXISTS kudos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  de_id TEXT NOT NULL,
  de_nome TEXT,
  para_id TEXT NOT NULL,
  para_nome TEXT,
  categoria TEXT,
  mensagem TEXT,
  post_id TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kudos_para ON kudos(empresa_id, para_id);
CREATE INDEX IF NOT EXISTS idx_kudos_de ON kudos(empresa_id, de_id, criado_em);
`);
console.log('✓ Migração 106 concluída.');
