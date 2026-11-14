// 389 — Chamados do HopToDesk (Joe 2026-11-14): puxar os chamados da ferramenta de acesso remoto pra
// dentro do Suporte Loja (acompanhar) e virar indicador de conclusão. Alimentado por WEBHOOK (push, em
// produção) e/ou por PULL da API (getTickets) quando a HOPTODESK_API_KEY estiver no .env.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE hoptodesk_ticket (id text PRIMARY KEY, numero text, titulo text, status text, prioridade text,
//   cliente text, cliente_email text, empresa text, device_id text, device_nome text, origem text,
//   criado_em timestamptz, atualizado_em timestamptz, resolvido_em timestamptz, sla_due timestamptz, raw jsonb);
// CREATE INDEX ix_hd_ticket_status ON hoptodesk_ticket (status);
const db = require('../connection');
console.log('▶ Migração 389 — hoptodesk_ticket (chamados do HopToDesk)');
db.exec(`CREATE TABLE IF NOT EXISTS hoptodesk_ticket (
  id TEXT PRIMARY KEY, numero TEXT, titulo TEXT, status TEXT, prioridade TEXT,
  cliente TEXT, cliente_email TEXT, empresa TEXT, device_id TEXT, device_nome TEXT, origem TEXT,
  criado_em TEXT, atualizado_em TEXT, resolvido_em TEXT, sla_due TEXT, raw TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS ix_hd_ticket_status ON hoptodesk_ticket (status)');
console.log('✓ Migração 389 concluída');
