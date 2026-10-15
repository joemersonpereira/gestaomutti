// 077 — Documentos pessoais do colaborador (holerite / informe de rendimento).
// O RH sobe um PDF (individual ou lote); o sistema divide por página, reconhece o CPF
// e distribui SÓ as páginas de cada pessoa. O colaborador vê o dele e marca ciência.
// CRÍTICO: dado individual e sigiloso — casamento sempre por CPF exato.
const db = require('../connection');
console.log('▶ Migração 077 — documentos pessoais (holerite/informe)');

db.exec(`
CREATE TABLE IF NOT EXISTS documento_lotes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tipo TEXT NOT NULL,                 -- 'holerite' | 'informe'
  competencia TEXT NOT NULL,          -- holerite: 'AAAA-MM' | informe: 'AAAA'
  arquivo_nome TEXT,
  total_paginas INTEGER DEFAULT 0,
  total_pessoas INTEGER DEFAULT 0,    -- CPFs distintos encontrados no PDF
  distribuidos INTEGER DEFAULT 0,     -- casados com colaborador
  nao_encontrados INTEGER DEFAULT 0,  -- CPF não bate com colaborador
  ambiguos INTEGER DEFAULT 0,         -- CPF casou com +1 colaborador OU página ambígua
  status TEXT NOT NULL DEFAULT 'previa', -- 'previa' | 'distribuido' | 'cancelado'
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  distribuido_em TEXT
);
CREATE TABLE IF NOT EXISTS documentos_pessoais (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  lote_id TEXT,
  colaborador_id TEXT NOT NULL,
  cpf TEXT NOT NULL,                  -- CPF (11 dígitos) do documento — reconferido na entrega
  tipo TEXT NOT NULL,                 -- 'holerite' | 'informe'
  competencia TEXT NOT NULL,
  titulo TEXT,
  arquivo_nome TEXT,
  mime TEXT DEFAULT 'application/pdf',
  dados TEXT NOT NULL,               -- PDF em base64 (só as páginas dessa pessoa)
  paginas INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'rascunho', -- 'rascunho' | 'pendente' | 'ciente' | 'cancelado'
  ciente_em TEXT,
  ciente_ip TEXT,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docpes_colab ON documentos_pessoais(colaborador_id, status);
CREATE INDEX IF NOT EXISTS idx_docpes_lote ON documentos_pessoais(lote_id);
CREATE INDEX IF NOT EXISTS idx_docpes_dedup ON documentos_pessoais(colaborador_id, tipo, competencia);
`);
console.log('  + tabelas documento_lotes, documentos_pessoais');
console.log('✓ Migração 077 concluída.');
