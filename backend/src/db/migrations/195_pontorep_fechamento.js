// 195_pontorep_fechamento.js — Fechamento do ponto, janela de correção, espelho p/ assinatura,
// lançamento de afastamento e base do painel de acompanhamento. Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';

// Config de fechamento (singleton por empresa)
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_fechamento_config (
  empresa_id            TEXT PRIMARY KEY,
  dia_fechamento        INTEGER DEFAULT 25,     -- dia do mês em que o ponto fecha
  correcao_prazo_dias   INTEGER DEFAULT 1,      -- prazo p/ pedir correção após o dia do ponto
  correcao_hora_limite  TEXT DEFAULT '23:59',   -- hora limite no último dia do prazo
  atualizado_em         TEXT
)`);
db.prepare(`INSERT OR IGNORE INTO pontorep_fechamento_config (empresa_id,dia_fechamento,correcao_prazo_dias,correcao_hora_limite,atualizado_em)
  VALUES (?,25,1,'23:59',datetime('now'))`).run(EMP);

// Fechamento por competência (YYYY-MM)
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_fechamento (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT NOT NULL,
  competencia   TEXT NOT NULL,          -- 'YYYY-MM'
  status        TEXT DEFAULT 'aberto',  -- aberto | fechado
  fechado_por_id TEXT,
  fechado_em    TEXT,
  criado_em     TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, competencia)
)`);

// Espelho de ponto por colaborador/competência (fluxo de assinatura)
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_espelho (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT NOT NULL,
  competencia   TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  status        TEXT DEFAULT 'gerado',  -- gerado | enviado | assinado | contestado
  enviado_em    TEXT,
  assinado_em   TEXT,
  contestacao   TEXT,
  pdf_ref       TEXT,
  criado_em     TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, competencia, colaborador_id)
)`);

// Solicitação de correção do colaborador (só dentro da janela)
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_correcao (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  data_ref      TEXT NOT NULL,          -- dia do ponto a corrigir
  tipo          TEXT,                   -- esquecida | ajuste | abono
  descricao     TEXT,
  horario_sugerido TEXT,
  status        TEXT DEFAULT 'pendente',-- pendente | aprovada | recusada
  resposta      TEXT,
  resolvido_por_id TEXT,
  resolvido_em  TEXT,
  criado_em     TEXT DEFAULT (datetime('now'))
)`);

// Lançamento de afastamento (usa o catálogo de motivos; alimenta o painel de acompanhamento)
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_afastamento (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  motivo_id     TEXT,
  data_ini      TEXT NOT NULL,
  data_fim      TEXT,
  dias          INTEGER,
  documento_ref TEXT,
  observacao    TEXT,
  criado_por_id TEXT,
  criado_em     TEXT DEFAULT (datetime('now'))
)`);

console.log('✅ migration 195: fechamento/espelho/correção/afastamento criados');
