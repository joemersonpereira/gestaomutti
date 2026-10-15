// 114_marketing_agenda.js — Calendário de Marketing (ações/postagens/eventos) + influenciadores.
const db = require('../connection');

db.exec(`
CREATE TABLE IF NOT EXISTS mkt_influenciadores (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  arroba TEXT,                 -- @handle
  rede TEXT,                   -- Instagram / TikTok / YouTube...
  seguidores INTEGER,
  contato TEXT,                -- telefone/whatsapp
  email TEXT,
  cachê REAL,
  observacao TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mkt_agenda (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'postagem',   -- postagem | acao | evento | campanha | acao_fornecedor
  canal TEXT,                              -- Instagram / WhatsApp / Loja / Rádio...
  data_ini TEXT NOT NULL,                  -- YYYY-MM-DD
  data_fim TEXT,
  hora TEXT,
  status TEXT NOT NULL DEFAULT 'ideia',    -- ideia | planejado | producao | agendado | publicado | concluido | cancelado
  responsavel_id TEXT,
  responsavel_nome TEXT,
  descricao TEXT,
  -- envolvido: influenciador, funcionário, fornecedor/laboratório
  envolvido_tipo TEXT,                     -- influencer | funcionario | fornecedor
  envolvido_id TEXT,
  envolvido_nome TEXT,
  envolvido_contato TEXT,                  -- telefone/whatsapp
  envolvido_email TEXT,
  -- evento/patrocínio
  verba REAL,                              -- verba de patrocínio/evento (liga ao orçamento do financeiro)
  patrocinador TEXT,
  tarefa_id TEXT,                          -- tarefa gerada (p/ fornecedor/responsável)
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_mktagenda ON mkt_agenda(empresa_id, data_ini);
`);
console.log('✅ migration 114: mkt_agenda + mkt_influenciadores criadas');
