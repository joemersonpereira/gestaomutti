// 361 — Horário do mês POR OPERADOR (Joe 2026-11-11).
// Antes o horário era único por loja/mês. Agora cada colaborador pode ter o seu horário
// (entrada/saída almoço/volta/saída + tolerância). colaborador_id='' continua valendo como
// padrão da loja (fallback), pra não quebrar o que já existe.
//
// ── Caminho técnico v2.0 (Postgres) ──
// ALTER TABLE caixa_horario_mes ADD COLUMN colaborador_id text NOT NULL DEFAULT '';
// -- chave lógica passa a ser (empresa_id, ano, mes, loja_id, colaborador_id).
const db = require('../connection');
console.log('▶ Migração 361 — caixa_horario_mes por operador');
const cols = db.prepare("PRAGMA table_info(caixa_horario_mes)").all().map(c => c.name);
if (!cols.includes('colaborador_id')) {
  db.exec("ALTER TABLE caixa_horario_mes ADD COLUMN colaborador_id TEXT NOT NULL DEFAULT ''");
  console.log('  + coluna colaborador_id');
}
console.log('✓ Migração 361 concluída (horário por operador)');
