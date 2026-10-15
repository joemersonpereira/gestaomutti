// 152 — Cuidado farmacêutico (fase 1): catálogo de serviços cadastráveis, base de pacientes
// (anamnese que persiste entre visitas) e vínculo do serviço ao paciente + termo aceito + comentário.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS servico_farmac_tipos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
  valor_padrao REAL DEFAULT 0, exige_termo INTEGER DEFAULT 0, termo_texto TEXT,
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS pacientes_farmac (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL, cpf TEXT, telefone TEXT, nascimento TEXT,
  alergias TEXT, medicamentos TEXT, condicoes TEXT, obs TEXT,
  consent_lgpd INTEGER DEFAULT 0, consent_em TEXT,
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pacfarm ON pacientes_farmac(empresa_id, nome);
`);
for (const [col, tipo] of [['paciente_id', 'TEXT'], ['comentario', 'TEXT'], ['termo_aceito', 'INTEGER DEFAULT 0'], ['termo_aceito_em', 'TEXT']]) {
  try { db.exec(`ALTER TABLE servicos_farmaceuticos ADD COLUMN ${col} ${tipo}`); } catch { /* já existe */ }
}
console.log('✅ migration 152: cuidado farmacêutico (tipos, pacientes, vínculo)');
