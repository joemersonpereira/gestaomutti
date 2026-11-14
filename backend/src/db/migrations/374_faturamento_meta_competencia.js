// 374 — Metas de faturamento ganham COMPETÊNCIA (mês futuro) e ESCOPO (rede/loja/vendedor) — Joe 2026-11-12.
// Antes era só por loja_id. Agora: escopo ∈ {rede, loja, vendedor}; alvo = '' (rede) | loja_id | usuario_id (vendedor).
// competencia = 'YYYY-MM' (vários meses à frente) ou '' (padrão, vale pra qualquer mês).
// Efetiva(escopo,alvo,comp,ind) = alvo+comp → alvo+padrão (dentro do mesmo escopo/alvo; mais específico vence).
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE faturamento_meta (empresa_id text, escopo text, alvo text DEFAULT '', competencia text DEFAULT '',
//   indicador text, meta numeric, atualizado_por text, atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, escopo, alvo, competencia, indicador));
const db = require('../connection');
console.log('▶ Migração 374 — faturamento_meta: competência (mês futuro) + escopo (rede/loja/vendedor)');
const cols = db.prepare("PRAGMA table_info(faturamento_meta)").all().map(c => c.name);
if (!cols.includes('escopo')) {
  db.exec('BEGIN');
  db.exec(`CREATE TABLE faturamento_meta_new (
    empresa_id TEXT NOT NULL, escopo TEXT NOT NULL DEFAULT 'rede', alvo TEXT NOT NULL DEFAULT '',
    competencia TEXT NOT NULL DEFAULT '', indicador TEXT NOT NULL, meta REAL,
    atualizado_por TEXT, atualizado_em TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (empresa_id, escopo, alvo, competencia, indicador))`);
  // migra o que havia (loja_id): '' → rede; preenchido → loja
  if (cols.includes('loja_id')) {
    db.exec(`INSERT INTO faturamento_meta_new (empresa_id, escopo, alvo, competencia, indicador, meta, atualizado_por, atualizado_em)
      SELECT empresa_id, CASE WHEN COALESCE(loja_id,'')='' THEN 'rede' ELSE 'loja' END, COALESCE(loja_id,''),
        '', indicador, meta, atualizado_por, atualizado_em FROM faturamento_meta`);
  }
  db.exec('DROP TABLE faturamento_meta');
  db.exec('ALTER TABLE faturamento_meta_new RENAME TO faturamento_meta');
  db.exec('COMMIT');
  console.log('✓ Migração 374 concluída (escopo + competência)');
} else {
  console.log('• Migração 374 já aplicada');
}
