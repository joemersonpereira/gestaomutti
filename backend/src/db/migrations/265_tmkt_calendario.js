// 265_tmkt_calendario.js — Calendário de Trade (Joe 2026-10-16).
// Registra as AÇÕES da rede (ex.: "Mutti em Ação") p/ o patrocinador ver + comprovação da ação,
// e os DIAS TEMÁTICOS recorrentes (Segunda do Suplemento, Quarta do Bem-estar, Sexta da Beleza,
// Quinzena da Saúde) que viram oportunidade de patrocínio vinculada ao dia.
// O portal expande a recorrência por mês; o fornecedor clica no dia e vê a oportunidade.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_calendario (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT DEFAULT 'acao',            -- 'acao' (data cheia) | 'tematico' (dia recorrente) | 'campanha'
  categoria TEXT,                      -- suplemento | bem-estar | beleza | saude | geral…
  recorrencia TEXT DEFAULT 'unico',    -- 'unico' | 'semanal' | 'quinzenal' | 'mensal'
  dia_semana INTEGER,                  -- 0=domingo … 6=sábado (recorrência semanal/quinzenal)
  dia_mes INTEGER,                     -- dia do mês (recorrência mensal)
  data TEXT,                           -- data única (tipo 'acao'/'campanha')
  data_ini TEXT, data_fim TEXT,        -- janela de validade (recorrência) ou período da campanha
  descricao TEXT,
  cor TEXT,                            -- cor do selo no calendário
  patrocinavel INTEGER DEFAULT 1,      -- 1 = fornecedor pode patrocinar
  preco REAL,                          -- investimento sugerido do patrocínio do dia
  plano_id TEXT,                       -- vincula a um plano comercial (opcional)
  patrocinador_nome TEXT, patrocinador_cnpj TEXT, venda_id TEXT,  -- quem patrocinou
  comprov_foto TEXT, comprov_mime TEXT, comprov_em TEXT,          -- comprovação da ação
  status TEXT DEFAULT 'ativo',
  ordem INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_calendario ON tmkt_calendario(empresa_id, status)`);
// comprovações extras (várias fotos por ação), se precisar além da principal
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_calendario_fotos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, evento_id TEXT NOT NULL,
  foto TEXT, legenda TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);
console.log('✅ migration 265: tmkt_calendario (ações + dias temáticos recorrentes + comprovação)');
