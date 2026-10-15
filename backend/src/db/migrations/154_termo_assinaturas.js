// 154 — Assinatura online de termos (responsabilidade/LGPD): o farmacêutico gera um link/QR,
// o paciente abre no celular, lê o termo e assina (nome + CPF + assinatura desenhada). Fica registrado.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS termo_assinaturas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  paciente_id TEXT, paciente_nome TEXT, tipo TEXT, termo_texto TEXT NOT NULL,
  servico_id TEXT, loja_nome TEXT,
  status TEXT DEFAULT 'pendente',
  assinante_nome TEXT, assinante_cpf TEXT, assinatura TEXT,
  assinado_em TEXT, assinado_ip TEXT,
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_termoass ON termo_assinaturas(empresa_id, paciente_id, criado_em);
`);
console.log('✅ migration 154: termo_assinaturas (assinatura online)');
