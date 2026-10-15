// 194_pontorep_feriado_necessidade.js — bases da Escala Inteligente:
//  • pontorep_feriado — feriados por loja (p/ a falta ser considerada e p/ regra de férias)
//  • pontorep_necessidade — quantos colaboradores cada loja precisa por turno/faixa
// Idempotente. Semeia feriados nacionais + 2 de Julho (Independência da Bahia).
const db = require('../connection');
const { v4: uuid } = require('uuid');
const EMP = 'empresa-mutti-001';

db.exec(`CREATE TABLE IF NOT EXISTS pontorep_feriado (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id    TEXT,                    -- NULL = vale para todas as lojas
  data       TEXT NOT NULL,           -- 'YYYY-MM-DD'
  nome       TEXT NOT NULL,
  tipo       TEXT,                    -- nacional | estadual | municipal | ponto_facultativo
  recorrente INTEGER DEFAULT 1,       -- repete todo ano (mesmo dia/mês)
  trabalha   INTEGER DEFAULT 0,       -- 0 = loja fecha; 1 = abre (trabalho gera dobro/folga)
  ativo      INTEGER DEFAULT 1,
  criado_em  TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, loja_id, data, nome)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS pontorep_necessidade (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id    TEXT NOT NULL,
  turno      TEXT NOT NULL,           -- ex.: Manhã, Tarde, Noite
  faixa_ini  TEXT,                    -- HH:MM
  faixa_fim  TEXT,                    -- HH:MM
  modelo_id  TEXT,                    -- modelo de escala sugerido p/ esse turno (opcional)
  dia_semana INTEGER,                 -- 0=dom … 6=sáb; NULL = todos os dias
  qtd_min    INTEGER DEFAULT 1,       -- colaboradores necessários
  funcao     TEXT,                    -- opcional: exigir função (ex.: Farmacêutico)
  ativo      INTEGER DEFAULT 1,
  criado_em  TEXT DEFAULT (datetime('now'))
)`);

// Feriados nacionais fixos + Bahia (recorrentes; ano base 2026)
const FERIADOS = [
  ['2026-01-01', 'Confraternização Universal', 'nacional'],
  ['2026-04-21', 'Tiradentes', 'nacional'],
  ['2026-05-01', 'Dia do Trabalho', 'nacional'],
  ['2026-07-02', 'Independência da Bahia', 'estadual'],
  ['2026-09-07', 'Independência do Brasil', 'nacional'],
  ['2026-10-12', 'Nossa Senhora Aparecida', 'nacional'],
  ['2026-11-02', 'Finados', 'nacional'],
  ['2026-11-15', 'Proclamação da República', 'nacional'],
  ['2026-11-20', 'Dia da Consciência Negra', 'nacional'],
  ['2026-12-25', 'Natal', 'nacional'],
];
const ins = db.prepare(`INSERT OR IGNORE INTO pontorep_feriado (id,empresa_id,loja_id,data,nome,tipo,recorrente,trabalha,ativo)
  VALUES (?,?,NULL,?,?,?,1,0,1)`);
FERIADOS.forEach(f => ins.run(uuid(), EMP, f[0], f[1], f[2]));

console.log('✅ migration 194: feriados/necessidade —',
  db.prepare(`SELECT COUNT(*) n FROM pontorep_feriado`).get().n, 'feriados semeados');
