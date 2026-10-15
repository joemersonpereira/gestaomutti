// 162 — Múltiplos envolvidos numa ação de marketing (antes era 1 só, nos campos
// envolvido_* de mkt_agenda; agora N via mkt_envolvidos). Os campos legados seguem
// preenchidos com o 1º envolvido p/ compatibilidade das telas antigas.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS mkt_envolvidos (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL,
  tipo TEXT,
  ref_id TEXT,
  nome TEXT,
  contato TEXT,
  email TEXT,
  ordem INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mkt_env ON mkt_envolvidos(agenda_id);
`);
console.log('✅ migration 162: mkt_envolvidos (múltiplos envolvidos por ação)');
