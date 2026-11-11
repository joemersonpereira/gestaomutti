// 356 — Horário padrão do mês p/ validar pontualidade (Joe 2026-11-11).
// Todo início de mês, ao ver os primeiros caixas, a gestão cadastra o horário PADRÃO (seg-sex):
// entrada, saída almoço, volta almoço, saída + tolerância. Vale pro mês; o ranking cruza com o
// Tangerino (1ª batida do dia) p/ classificar atraso (10-15min -3, 16-30 -10, >30 desclassifica).
// loja_id vazio = vale pra todas as lojas (padrão). Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE caixa_horario_mes (id text PRIMARY KEY, empresa_id text NOT NULL, ano int NOT NULL, mes int NOT NULL,
//   loja_id text NOT NULL DEFAULT '', entrada text, saida_almoco text, volta_almoco text, saida text,
//   tolerancia_min int NOT NULL DEFAULT 5, atualizado_em timestamptz DEFAULT now(),
//   UNIQUE(empresa_id, ano, mes, loja_id));
const db = require('../connection');
console.log('▶ Migração 356 — caixa_horario_mes');
db.exec(`CREATE TABLE IF NOT EXISTS caixa_horario_mes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, ano INTEGER NOT NULL, mes INTEGER NOT NULL,
  loja_id TEXT NOT NULL DEFAULT '', entrada TEXT, saida_almoco TEXT, volta_almoco TEXT, saida TEXT,
  tolerancia_min INTEGER NOT NULL DEFAULT 5, atualizado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_cx_horario_mes ON caixa_horario_mes(empresa_id, ano, mes, loja_id)`);
console.log('✓ Migração 356 concluída (caixa_horario_mes)');
