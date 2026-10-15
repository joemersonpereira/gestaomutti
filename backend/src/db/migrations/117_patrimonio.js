// 117_patrimonio.js — controle de patrimônio da loja + reserva/empréstimo com período e fila.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS patrimonio (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  origem TEXT DEFAULT 'manual',       -- manual | nf | mercado
  nf_ref TEXT,
  tombamento TEXT,                    -- nº patrimônio
  valor REAL,
  status TEXT NOT NULL DEFAULT 'disponivel', -- disponivel | reservado | emprestado | manutencao | baixado
  reserva_atual_id TEXT,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS patrimonio_reserva (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  patrimonio_id TEXT NOT NULL,
  colaborador_id TEXT,
  colaborador_nome TEXT,
  finalidade TEXT,
  data_ini TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa',  -- ativa | concluida | cancelada
  tarefa_id TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  devolvido_em TEXT
);
CREATE TABLE IF NOT EXISTS patrimonio_fila (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  patrimonio_id TEXT NOT NULL,
  colaborador_id TEXT,
  colaborador_nome TEXT,
  desde_ini TEXT, desde_fim TEXT,       -- período desejado
  ordem INTEGER,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patr ON patrimonio(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_patr_res ON patrimonio_reserva(empresa_id, patrimonio_id, status);
`);
console.log('✅ migration 117: patrimonio + reserva + fila criadas');
