// 104 — Desligamentos + pesquisa de desligamento (exit survey). O RH registra o
// desligamento e envia um link de pesquisa; as respostas alimentam indicadores p/ gestão.
const db = require('../connection');
console.log('▶ Migração 104 — Desligamentos + pesquisa de desligamento');
db.exec(`
CREATE TABLE IF NOT EXISTS desligamentos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT,
  colaborador_nome TEXT,
  loja_id TEXT,
  funcao TEXT,
  tipo TEXT,                    -- voluntario | involuntario | fim_contrato | outro
  data_desligamento TEXT,
  motivo_rh TEXT,               -- motivo registrado pelo RH
  obs_rh TEXT,
  registrado_por TEXT,
  token TEXT,                   -- link público da pesquisa
  pesquisa_status TEXT DEFAULT 'pendente', -- pendente | respondida
  -- Respostas da pesquisa (exit survey)
  motivo_saida TEXT,            -- categoria informada pelo colaborador
  s_geral INTEGER, s_lideranca INTEGER, s_ambiente INTEGER, s_remuneracao INTEGER,
  s_crescimento INTEGER, s_reconhecimento INTEGER, s_carga INTEGER, s_ferramentas INTEGER,
  enps INTEGER,                 -- 0..10 (recomendaria a empresa)
  voltaria TEXT,                -- sim | talvez | nao
  comentario TEXT,
  sugestoes TEXT,
  respondida_em TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deslig ON desligamentos(empresa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_deslig_token ON desligamentos(token);
`);
console.log('✓ Migração 104 concluída.');
