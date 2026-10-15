// 099 — Dependentes do colaborador: filhos e pets (cachorro/gato/outro). Guarda nome,
// apelido, nascimento e foto — para datas comemorativas e post de aniversário automático.
const db = require('../connection');
console.log('▶ Migração 099 — Dependentes (filhos e pets)');
db.exec(`
CREATE TABLE IF NOT EXISTS dependentes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  tipo TEXT NOT NULL,            -- filho | pet
  especie TEXT,                 -- pet: cachorro | gato | outro
  nome TEXT NOT NULL,
  apelido TEXT,
  nascimento TEXT,              -- YYYY-MM-DD
  foto TEXT,                    -- data URL (base64)
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dep_colab ON dependentes(empresa_id, colaborador_id);
`);
// Consentimento LGPD (compartilhar dados pessoais/dependentes p/ datas comemorativas e Comunidade).
const cols = db.prepare("PRAGMA table_info(colaboradores)").all().map(c => c.name);
if (!cols.includes('lgpd_consentido')) { db.exec("ALTER TABLE colaboradores ADD COLUMN lgpd_consentido INTEGER DEFAULT 0"); console.log('  + colaboradores.lgpd_consentido'); }
if (!cols.includes('lgpd_consentido_em')) { db.exec("ALTER TABLE colaboradores ADD COLUMN lgpd_consentido_em TEXT"); console.log('  + colaboradores.lgpd_consentido_em'); }
console.log('✓ Migração 099 concluída.');
