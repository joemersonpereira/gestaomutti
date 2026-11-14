// 390 — Precificação Fase 2 (Joe 2026-11-14): TAGS de produto (formador de tráfego/opinião etc, editáveis)
// + CADERNOS de oferta com frequência de conferência personalizável e validador de execução (por comprador
// ou pessoa, editável). App DB (o ERP é só leitura).
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE produto_tag (empresa_id text, produto_id bigint, tag text, criado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, produto_id, tag));
// CREATE TABLE precificacao_caderno (id bigserial PRIMARY KEY, empresa_id text, nome text, frequencia_dias int,
//   responsavel_tipo text, responsavel_id text, responsavel_nome text, proxima_conferencia date, ativo int DEFAULT 1,
//   criado_em timestamptz DEFAULT now());
// CREATE TABLE precificacao_caderno_exec (id bigserial PRIMARY KEY, caderno_id bigint, data date, por_nome text,
//   ok int DEFAULT 1, obs text, criado_em timestamptz DEFAULT now());
const db = require('../connection');
console.log('▶ Migração 390 — produto_tag + precificacao_caderno(+exec)');
db.exec(`CREATE TABLE IF NOT EXISTS produto_tag (
  empresa_id TEXT NOT NULL, produto_id INTEGER NOT NULL, tag TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now')), PRIMARY KEY (empresa_id, produto_id, tag)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS precificacao_caderno (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
  frequencia_dias INTEGER, responsavel_tipo TEXT, responsavel_id TEXT, responsavel_nome TEXT,
  proxima_conferencia TEXT, ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS precificacao_caderno_exec (
  id INTEGER PRIMARY KEY AUTOINCREMENT, caderno_id INTEGER NOT NULL, data TEXT, por_nome TEXT,
  ok INTEGER DEFAULT 1, obs TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);
console.log('✓ Migração 390 concluída');
