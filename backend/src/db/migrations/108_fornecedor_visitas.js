// 108_fornecedor_visitas.js — Agenda de visitas de fornecedor (gatilho a cada R$500k acumulado).
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS fornecedor_visitas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  fornecedor_id INTEGER NOT NULL,
  fornecedor_nome TEXT,
  status TEXT NOT NULL DEFAULT 'sugerida',   -- sugerida | agendada | realizada | dispensada
  origem TEXT NOT NULL DEFAULT 'gatilho',     -- gatilho | manual
  gatilho_ano INTEGER,                        -- ano do acúmulo que disparou
  gatilho_faixa INTEGER,                      -- múltiplo de 500k (1=500k, 2=1M, ...)
  compra_acumulada REAL,                      -- compra acumulada no momento do gatilho
  data_visita TEXT,                           -- YYYY-MM-DD agendada/realizada
  hora_visita TEXT,                           -- HH:MM opcional
  responsavel_id TEXT,                        -- colaborador anfitrião
  responsavel_nome TEXT,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_fvisitas_emp ON fornecedor_visitas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_fvisitas_forn ON fornecedor_visitas(empresa_id, fornecedor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fvisitas_gatilho ON fornecedor_visitas(empresa_id, fornecedor_id, gatilho_ano, gatilho_faixa) WHERE origem='gatilho';
`);

console.log('✅ migration 108: fornecedor_visitas criada');
