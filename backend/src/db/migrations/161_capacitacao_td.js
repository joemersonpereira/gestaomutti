// 161 — Capacitação / T&D: cursos, avaliação trimestral (gerente→colaborador) e PDCA/PDI.
const db = require('../connection');
db.exec(`
-- Catálogo de cursos / trilhas
CREATE TABLE IF NOT EXISTS cursos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  link TEXT,
  carga_horaria REAL,
  obrigatorio INTEGER DEFAULT 0,
  funcoes TEXT,                 -- JSON de funcao_ids (vazio/null = todos)
  pontos INTEGER DEFAULT 0,     -- pontos ao concluir (gamificação)
  ativo INTEGER DEFAULT 1,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS curso_conclusoes (
  id TEXT PRIMARY KEY,
  curso_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  status TEXT DEFAULT 'concluido',   -- 'concluido'
  nota REAL,
  certificado_id TEXT,
  concluido_em TEXT DEFAULT (datetime('now')),
  UNIQUE(curso_id, colaborador_id)
);
CREATE INDEX IF NOT EXISTS idx_curso_concl ON curso_conclusoes(colaborador_id);

-- Competências avaliadas (configuráveis) + avaliação trimestral do colaborador pelo gerente/RH
CREATE TABLE IF NOT EXISTS td_competencias (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS td_avaliacao (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  trimestre INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  avaliador_id TEXT,
  avaliador_nome TEXT,
  status TEXT DEFAULT 'rascunho',    -- 'rascunho' | 'concluida'
  pontos_fortes TEXT,
  a_desenvolver TEXT,
  comentario TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT,
  UNIQUE(colaborador_id, trimestre, ano)
);
CREATE TABLE IF NOT EXISTS td_avaliacao_item (
  id TEXT PRIMARY KEY,
  avaliacao_id TEXT NOT NULL,
  competencia_id TEXT NOT NULL,
  nota INTEGER,                      -- 1..5
  UNIQUE(avaliacao_id, competencia_id)
);

-- PDCA / Plano de Desenvolvimento Individual
CREATE TABLE IF NOT EXISTS td_pdi (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  tema TEXT NOT NULL,
  objetivo TEXT,                     -- PLAN: o que se quer desenvolver / meta
  acao TEXT,                         -- PLAN: ação planejada
  status TEXT DEFAULT 'planejado',   -- DO: 'planejado' | 'em_andamento' | 'concluido' | 'cancelado'
  resultado TEXT,                    -- CHECK: o que aconteceu
  ajuste TEXT,                       -- ACT: o que ajustar / próximo passo
  responsavel_id TEXT,
  prazo TEXT,
  origem TEXT DEFAULT 'manual',      -- 'avaliacao' | 'sugestao' | 'manual'
  sugerido_por TEXT,                 -- quem sugeriu (gerente/colaborador) qdo origem='sugestao'
  avaliacao_id TEXT,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_pdi_colab ON td_pdi(empresa_id, colaborador_id);
`);
console.log('✅ migration 161: capacitação/T&D (cursos, competências, avaliação trimestral, PDCA/PDI)');
