// 096 — Config dos pontos automáticos (#EuSouGrupoMutti). A Gente & Gestão define
// quantos pontos vale cada regra (super meta, caixa, produtividade, post social…).
const db = require('../connection');
console.log('▶ Migração 096 — Config de pontos');
db.exec(`
CREATE TABLE IF NOT EXISTS pontos_config (
  empresa_id TEXT NOT NULL,
  chave TEXT NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  atualizado_em TEXT,
  atualizado_por TEXT,
  PRIMARY KEY (empresa_id, chave)
);
`);
console.log('✓ Migração 096 concluída.');
