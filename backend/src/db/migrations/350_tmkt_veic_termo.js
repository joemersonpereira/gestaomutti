// 350 — Termo de AUTORIZAÇÃO DE VEICULAÇÃO (assinatura eletrônica no Briefing) — Joe 2026-11-11.
// Além do CONTRATO (migr 348/349), o fornecedor assina um TERMO autorizando a veiculação da campanha
// de acordo com a comprovação de execução. Mesma estrutura de assinatura do contrato (selfie + foto do
// documento + assinatura na tela + aceite da MP + CPF que bate com o representante). Ao assinar, a
// negociação vai para 'vigente' (Em veiculação) e gera alerta. Idempotente (CREATE TABLE IF NOT EXISTS).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS tmkt_veic_termo (
//   id uuid PRIMARY KEY, empresa_id text NOT NULL,
//   venda_id uuid NOT NULL UNIQUE REFERENCES tmkt_vendas(id) ON DELETE CASCADE,
//   corpo text, status text NOT NULL DEFAULT 'rascunho',   -- rascunho | aguardando | assinado
//   token text, representante_nome text, representante_cpf text,
//   assinante_nome text, assinante_doc text,
//   assinatura_img text, selfie_img text, documento_img text, ip text, user_agent text,
//   aceite_mp int NOT NULL DEFAULT 0, solicitado_em timestamptz, assinado_em timestamptz,
//   criado_em timestamptz DEFAULT now());
// CREATE INDEX IF NOT EXISTS idx_tmkt_veic_token ON tmkt_veic_termo(token);
const db = require('../connection');
console.log('▶ Migração 350 — tmkt_veic_termo (termo de autorização de veiculação)');
db.exec(`
CREATE TABLE IF NOT EXISTS tmkt_veic_termo (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  venda_id TEXT NOT NULL UNIQUE,
  corpo TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  token TEXT,
  representante_nome TEXT,
  representante_cpf TEXT,
  assinante_nome TEXT,
  assinante_doc TEXT,
  assinatura_img TEXT,
  selfie_img TEXT,
  documento_img TEXT,
  ip TEXT,
  user_agent TEXT,
  aceite_mp INTEGER NOT NULL DEFAULT 0,
  pdf_b64 TEXT,
  solicitado_em TEXT,
  assinado_em TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tmkt_veic_token ON tmkt_veic_termo(token);
`);
console.log('✓ Migração 350 concluída (tmkt_veic_termo)');
