// 201_pontorep_pendentes.js — Pontos suspeitos/pendentes: flags na batida (setadas na inclusão)
// + tabela de REVISÃO do RH (separada, pois a batida é imutável). Idempotente.
const db = require('../connection');
for (const col of ['facial_ok INTEGER DEFAULT 1', 'pendente INTEGER DEFAULT 0', 'motivo_pendencia TEXT']) {
  try { db.exec(`ALTER TABLE pontorep_marcacao ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
}
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_marcacao_revisao (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  marcacao_id    TEXT NOT NULL,
  status         TEXT,            -- aprovada | rejeitada
  motivo         TEXT,
  revisado_por_id TEXT,
  revisado_em    TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, marcacao_id)
)`);
console.log('✅ migration 201: flags de pendência na batida + pontorep_marcacao_revisao');
