// 181_botvendas.js — Monitoria de Atendimento (BotVendas WhatsApp).
// Guarda atendimentos e conversas trazidos da API, + estrutura da monitoria por IA (Fase 2).
const db = require('../connection');

db.exec(`CREATE TABLE IF NOT EXISTS botvendas_atendimentos (
  empresa_id      TEXT,
  order_id        INTEGER,
  cliente         TEXT,
  telefone        TEXT,
  canal           TEXT,
  vendedor_nome   TEXT,
  colaborador_id  TEXT,          -- casado por nome com colaboradores (quando possível)
  loja_id         TEXT,
  score           REAL,          -- CSAT (average_score)
  ta_seconds      INTEGER,       -- tempo de atendimento
  status          INTEGER,
  total           REAL,
  cancel_reason   TEXT,
  closed_at       TEXT,
  updated_at      TEXT,
  sincronizado_em TEXT,
  PRIMARY KEY (empresa_id, order_id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS botvendas_mensagens (
  empresa_id  TEXT,
  order_id    INTEGER,
  message_id  TEXT,
  direcao     TEXT,   -- sent | received | note
  tipo        TEXT,
  remetente   TEXT,
  texto       TEXT,
  enviado_em  TEXT,
  ordem       INTEGER,
  PRIMARY KEY (empresa_id, order_id, message_id)
)`);

// Critérios treináveis da monitoria (ex.: "cumprimentou com bom dia/boa tarde", "não usou gíria/palavra inadequada").
db.exec(`CREATE TABLE IF NOT EXISTS botvendas_criterios (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT,
  texto      TEXT,
  peso       INTEGER DEFAULT 1,
  ativo      INTEGER DEFAULT 1,
  ordem      INTEGER DEFAULT 0,
  criado_em  TEXT
)`);

// Resultado da avaliação por IA de cada atendimento.
db.exec(`CREATE TABLE IF NOT EXISTS botvendas_avaliacoes (
  empresa_id   TEXT,
  order_id     INTEGER,
  nota         REAL,          -- 0..10
  resumo       TEXT,
  itens_json   TEXT,          -- [{criterio, ok, obs}]
  pontos_fortes TEXT,
  pontos_fracos TEXT,
  modelo       TEXT,
  avaliado_em  TEXT,
  avaliado_por TEXT,
  PRIMARY KEY (empresa_id, order_id)
)`);

console.log('✅ migration 181: tabelas do BotVendas (atendimentos, mensagens, critérios, avaliações) criadas');
