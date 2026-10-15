// 206_estagio_ciclo.js — Estágios fases 4/5/8: modelo de contrato, avaliação mensal e renovação.
const db = require('../connection');
const EMP = 'empresa-mutti-001';

// Config do módulo (modelo de contrato etc.)
db.exec(`CREATE TABLE IF NOT EXISTS estagio_config (
  empresa_id TEXT NOT NULL, chave TEXT NOT NULL, valor TEXT, atualizado_em TEXT,
  PRIMARY KEY (empresa_id, chave)
)`);

// Avaliação mensal do estagiário (pelo supervisor) — alimenta o índice de aprovação
db.exec(`CREATE TABLE IF NOT EXISTS estagio_avaliacao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, ficha_id TEXT NOT NULL,
  competencia TEXT NOT NULL,            -- 'YYYY-MM'
  nota REAL,                            -- 0 a 100
  supervisor TEXT, comentario TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, ficha_id, competencia)
)`);

// Renovação (fim do contrato) — fluxo por índice de aprovação
db.exec(`CREATE TABLE IF NOT EXISTS estagio_renovacao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, ficha_id TEXT NOT NULL,
  indice REAL,
  status TEXT DEFAULT 'pendente',       -- pendente_gerente | pendente_rh | aprovada | recusada
  rh_parecer TEXT, decidido_por TEXT, decidido_em TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, ficha_id)
)`);

// Modelo de contrato padrão (placeholders {{campo}})
const MODELO = `TERMO DE COMPROMISSO DE ESTÁGIO

Pelo presente instrumento, a empresa concedente {{empresa_atuacao}}, com registro em {{empresa_registro}}, e o(a) estagiário(a) {{nome}}, CPF {{cpf}}, estudante da instituição {{escola}} (curso {{curso}}, {{serie}}), representado(a) por {{resp_nome}} (CPF {{resp_cpf}}, {{resp_parentesco}}) quando menor, firmam o presente Termo de Compromisso de Estágio, nos termos da Lei nº 11.788/2008.

1. O estágio será realizado na loja/unidade {{loja}}, com início em {{data_inicio}} e término previsto em {{data_fim}}.
2. O(a) estagiário(a) receberá bolsa-auxílio no valor de {{valor_bolsa}} e auxílio-transporte de {{vale_transporte}}. Benefícios: {{beneficios}}.
3. Em cumprimento ao art. 9º da Lei 11.788/2008, fica contratado seguro contra acidentes pessoais: {{seguro}}.
4. A jornada e as demais condições seguem a legislação de estágio vigente.

{{cidade_data}}

_____________________________________     _____________________________________
Estagiário(a) / Responsável                Empresa concedente`;
db.prepare(`INSERT OR IGNORE INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))`).run(EMP, 'modelo_contrato', MODELO);

console.log('✅ migration 206: estagio_config + avaliacao + renovacao (modelo de contrato semeado)');
