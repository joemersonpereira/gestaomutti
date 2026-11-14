// 378 — Portal do colaborador por CPF (Joe 2026-11-12): caixa vê pontos + diferenças dele; gerente anexa
// caixas/despesas da loja. Acesso público por CPF (sem login), cada um só o que lhe cabe. Sessão por token.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE portal_caixa_sessao (token text PRIMARY KEY, empresa_id text, colaborador_id text, cpf text,
//   nome text, papel text, loja_id text, erp_uid text, criado_em timestamptz DEFAULT now());
const db = require('../connection');
console.log('▶ Migração 378 — portal_caixa_sessao (portal do colaborador por CPF)');
db.exec(`CREATE TABLE IF NOT EXISTS portal_caixa_sessao (
  token TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT, cpf TEXT,
  nome TEXT, papel TEXT, loja_id TEXT, erp_uid TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);
console.log('✓ Migração 378 concluída (portal_caixa_sessao)');
