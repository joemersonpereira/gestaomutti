// 146 — Configuração de setor do Painel da Gestão: cada setor (= departamento do menu) tem um
// dono (responsável a cobrar) e uma meta/alvo definida pela direção. Usado na "sala de cobrança".
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS setor_config (
  empresa_id TEXT NOT NULL,
  setor_key TEXT NOT NULL,
  dono TEXT,
  meta TEXT,
  atualizado_por TEXT,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, setor_key)
);
`);
console.log('✅ migration 146: setor_config');
