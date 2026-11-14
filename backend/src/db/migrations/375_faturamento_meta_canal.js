// 375 — Metas de faturamento ganham CANAL (todos / entrega-online) — Joe 2026-11-12.
// A tela "Online" reusa o Faturamento filtrado a vendas por entrega e tem metas próprias.
// canal = 'todos' (faturamento geral) | 'entrega' (online). PK passa a incluir canal.
const db = require('../connection');
console.log('▶ Migração 375 — faturamento_meta: canal (todos/entrega-online)');
const cols = db.prepare("PRAGMA table_info(faturamento_meta)").all().map(c => c.name);
if (!cols.includes('canal')) {
  db.exec('BEGIN');
  db.exec(`CREATE TABLE faturamento_meta_n (
    empresa_id TEXT NOT NULL, canal TEXT NOT NULL DEFAULT 'todos', escopo TEXT NOT NULL DEFAULT 'rede',
    alvo TEXT NOT NULL DEFAULT '', competencia TEXT NOT NULL DEFAULT '', indicador TEXT NOT NULL, meta REAL,
    atualizado_por TEXT, atualizado_em TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (empresa_id, canal, escopo, alvo, competencia, indicador))`);
  db.exec(`INSERT INTO faturamento_meta_n (empresa_id, canal, escopo, alvo, competencia, indicador, meta, atualizado_por, atualizado_em)
    SELECT empresa_id, 'todos', escopo, alvo, competencia, indicador, meta, atualizado_por, atualizado_em FROM faturamento_meta`);
  db.exec('DROP TABLE faturamento_meta');
  db.exec('ALTER TABLE faturamento_meta_n RENAME TO faturamento_meta');
  db.exec('COMMIT');
  console.log('✓ Migração 375 concluída (canal)');
} else {
  console.log('• Migração 375 já aplicada');
}
