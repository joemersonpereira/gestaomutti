// 348 — Contrato de trade por negociação + assinatura eletrônica — Joe 2026-11-11.
// Aba "Contrato" dentro da negociação: gera o contrato (template padrão), com OBJETO editável por
// negociação, e solicita assinatura via link público. O assinante envia SELFIE + FOTO DO DOCUMENTO
// + ASSINATURA NA TELA (canvas); o servidor grava o IP e o user-agent da máquina que assinou.
// Idempotente (CREATE TABLE IF NOT EXISTS). Imagens em data-URL (base64) em colunas TEXT, servidas
// por rota dedicada — mesmo padrão das artes/comprovantes do trade.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS tmkt_contrato (
//   id uuid PRIMARY KEY, empresa_id text NOT NULL,
//   venda_id uuid NOT NULL UNIQUE REFERENCES tmkt_vendas(id) ON DELETE CASCADE,
//   objeto text, corpo text,
//   status text NOT NULL DEFAULT 'rascunho',       -- rascunho | aguardando | assinado
//   token text, assinante_nome text, assinante_doc text,
//   assinatura_img text, selfie_img text, documento_img text,  -- data-URL base64
//   ip text, user_agent text,
//   solicitado_em timestamptz, assinado_em timestamptz,
//   criado_em timestamptz DEFAULT now());
// CREATE INDEX IF NOT EXISTS idx_tmkt_contrato_token ON tmkt_contrato(token);
const db = require('../connection');
console.log('▶ Migração 348 — tmkt_contrato (contrato + assinatura eletrônica)');
db.exec(`
CREATE TABLE IF NOT EXISTS tmkt_contrato (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  venda_id TEXT NOT NULL UNIQUE,
  objeto TEXT,
  corpo TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  token TEXT,
  assinante_nome TEXT,
  assinante_doc TEXT,
  assinatura_img TEXT,
  selfie_img TEXT,
  documento_img TEXT,
  ip TEXT,
  user_agent TEXT,
  solicitado_em TEXT,
  assinado_em TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tmkt_contrato_token ON tmkt_contrato(token);
`);
console.log('✓ Migração 348 concluída (tmkt_contrato)');
