// 358 — Convênio (menu Financeiro, Joe 2026-11-11).
// Empresas conveniadas: os funcionários compram fiado e a gente FATURA a empresa (emite NF) no fechamento.
// No ERP, cada convênio é um `crediario` (empresa) e os títulos são `crediarioreceber` dos clientes (cliente.crediarioid).
// Aqui a gente ALOCA quais crediários são empresas a faturar + a data de fechamento + o controle da NF por competência.
// Enviar a NF na data certa vira META do responsável.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE convenio_empresa (id text PRIMARY KEY, empresa_id text NOT NULL, erp_crediario_id text NOT NULL,
//   nome text, is_empresa boolean NOT NULL DEFAULT true, dia_fechamento int, cnpj text, email text, telefone text,
//   responsavel_colab_id text, ativo boolean NOT NULL DEFAULT true, criado_em timestamptz DEFAULT now(),
//   UNIQUE(empresa_id, erp_crediario_id));
// CREATE TABLE convenio_fechamento (id text PRIMARY KEY, empresa_id text NOT NULL, erp_crediario_id text NOT NULL,
//   competencia text NOT NULL, valor numeric, nf_numero text, nf_emitida_em date, enviada_em date, paga_em date,
//   prazo_data date, no_prazo boolean, nf_anexo text, nf_mime text, obs text, por text,
//   criado_em timestamptz DEFAULT now(), atualizado_em timestamptz DEFAULT now(),
//   UNIQUE(empresa_id, erp_crediario_id, competencia));
const db = require('../connection');
console.log('▶ Migração 358 — convenio (empresa + fechamento)');
db.exec(`CREATE TABLE IF NOT EXISTS convenio_empresa (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, erp_crediario_id TEXT NOT NULL,
  nome TEXT, is_empresa INTEGER NOT NULL DEFAULT 1, dia_fechamento INTEGER, cnpj TEXT, email TEXT, telefone TEXT,
  responsavel_colab_id TEXT, ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_convenio_empresa ON convenio_empresa(empresa_id, erp_crediario_id)`);
db.exec(`CREATE TABLE IF NOT EXISTS convenio_fechamento (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, erp_crediario_id TEXT NOT NULL,
  competencia TEXT NOT NULL, valor REAL, nf_numero TEXT, nf_emitida_em TEXT, enviada_em TEXT, paga_em TEXT,
  prazo_data TEXT, no_prazo INTEGER, nf_anexo TEXT, nf_mime TEXT, obs TEXT, por TEXT,
  criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_convenio_fechamento ON convenio_fechamento(empresa_id, erp_crediario_id, competencia)`);
console.log('✓ Migração 358 concluída (convenio)');
