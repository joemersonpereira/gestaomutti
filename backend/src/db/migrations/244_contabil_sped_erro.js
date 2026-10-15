// 244_contabil_sped_erro.js — "banco de correção" do SPED: os erros que a contabilidade devolve
// (pendências pra corrigir) ficam guardados, classificados por categoria/registro, por competência
// e loja. Com o tempo vira histórico — dá pra ver o que mais se repete e atacar a causa. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_sped_erro (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id TEXT NOT NULL,
  competencia TEXT NOT NULL,            -- 'YYYY-MM'
  tipo TEXT DEFAULT 'fiscal',           -- fiscal | contribuicoes
  loja_id TEXT,
  categoria TEXT,                       -- classificação (NF não lançada, Cadastro fornecedor (IE)…)
  registro TEXT,                        -- registro SPED relacionado (C100, 0150, C170, H010…)
  descricao TEXT NOT NULL,              -- o texto do erro como a contabilidade mandou
  referencia TEXT,                      -- nº da NF / chave / item, se der pra extrair
  status TEXT NOT NULL DEFAULT 'aberto',-- aberto | corrigido | ignorado
  origem TEXT DEFAULT 'contabilidade',  -- contabilidade | sistema | manual
  sped_id INTEGER,                      -- arquivo de retorno que originou (contabil_sped.id)
  obs TEXT,
  usuario_id TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  corrigido_em TEXT
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_sped_erro_comp ON contabil_sped_erro (empresa_id, competencia)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_sped_erro_cat ON contabil_sped_erro (empresa_id, categoria)`);
console.log('✅ migration 244: contabil_sped_erro (banco de correção)');
