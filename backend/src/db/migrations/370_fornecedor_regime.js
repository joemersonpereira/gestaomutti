// 370 — Regime tributário dos fornecedores (Joe 2026-11-12).
// Classifica cada CNPJ em Simples/MEI/Lucro Presumido/Lucro Real consultando a BrasilAPI (pública).
// Cache por CNPJ pra não reconsultar (API tem limite de requisições). ⚠️ consultar ENVIA o CNPJ à API externa.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE fornecedor_regime (empresa_id text, cnpj text, razao_social text, regime text,
//   opcao_simples boolean, opcao_mei boolean, ult_ano int, bruto jsonb, consultado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, cnpj));
const db = require('../connection');
console.log('▶ Migração 370 — fornecedor_regime (regime tributário via BrasilAPI)');
db.exec(`CREATE TABLE IF NOT EXISTS fornecedor_regime (
  empresa_id TEXT NOT NULL, cnpj TEXT NOT NULL, razao_social TEXT, regime TEXT,
  opcao_simples INTEGER, opcao_mei INTEGER, ult_ano INTEGER, erro TEXT,
  consultado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, cnpj)
)`);
console.log('✓ Migração 370 concluída (fornecedor_regime)');
