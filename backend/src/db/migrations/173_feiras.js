// 173_feiras.js — Feiras de negócios (oportunidade de compra): cadastro + participantes + NFs marcadas.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS feiras (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  data_ini TEXT NOT NULL,
  data_fim TEXT,
  verba_planejada REAL,           -- compra planejada p/ concentrar na feira
  observacao TEXT,
  dias_aviso INTEGER NOT NULL DEFAULT 30,  -- gera tarefa X dias antes (segurar compra p/ feira)
  tarefa_gerada INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feiras_emp ON feiras(empresa_id);

CREATE TABLE IF NOT EXISTS feira_participantes (
  id TEXT PRIMARY KEY,
  feira_id TEXT NOT NULL,
  tipo TEXT NOT NULL,             -- 'fornecedor' | 'laboratorio'
  ref_id TEXT,                     -- id do ERP (fornecedor.id ou fabricante.id)
  nome TEXT
);
CREATE INDEX IF NOT EXISTS idx_feira_part ON feira_participantes(feira_id);

CREATE TABLE IF NOT EXISTS feira_nfs (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  feira_id TEXT NOT NULL,
  nf_id TEXT NOT NULL,            -- notafiscal.id do ERP
  nf_numero TEXT,
  fornecedor TEXT,
  valor REAL,
  data_entrada TEXT,
  marcado_por TEXT,
  marcado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(feira_id, nf_id)
);
CREATE INDEX IF NOT EXISTS idx_feira_nfs ON feira_nfs(empresa_id, feira_id);
`);

console.log('✅ migration 173: feiras + feira_participantes + feira_nfs criadas');
