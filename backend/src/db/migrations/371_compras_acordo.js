// 371 — Acordos comerciais do comprador com evidência + validação da diretoria (Joe 2026-11-12).
// Comprador informa fornecedor + valor + descrição e ANEXA evidência; a diretoria VALIDA (ou recusa).
// Só os acordos VALIDADOS contam no indicador "Acordos comerciais" do Meu Setor de Compras.
// Evidência guardada em base64 (mesmo padrão dos anexos de Trade).
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE compras_acordo (id text PRIMARY KEY, empresa_id text, comprador_id text, ano int, mes int,
//   fornecedor text, valor numeric, descricao text, evidencia_nome text, evidencia_b64 text,
//   status text DEFAULT 'pendente', criado_por text, criado_em timestamptz DEFAULT now(),
//   validado_por text, validado_em timestamptz, obs_validacao text);
// CREATE INDEX ON compras_acordo (empresa_id, comprador_id, ano, mes, status);
const db = require('../connection');
console.log('▶ Migração 371 — compras_acordo (acordos comerciais + evidência + validação)');
db.exec(`CREATE TABLE IF NOT EXISTS compras_acordo (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, comprador_id TEXT NOT NULL, ano INTEGER, mes INTEGER,
  fornecedor TEXT, valor REAL, descricao TEXT, evidencia_nome TEXT, evidencia_b64 TEXT,
  status TEXT DEFAULT 'pendente', criado_por TEXT, criado_em TEXT DEFAULT (datetime('now')),
  validado_por TEXT, validado_em TEXT, obs_validacao TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_compras_acordo ON compras_acordo (empresa_id, comprador_id, ano, mes, status)');
console.log('✓ Migração 371 concluída (compras_acordo)');
