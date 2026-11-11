// 352 — Cronômetro do funil de Retail: histórico de fases (tempo em cada etapa) — Joe 2026-11-11.
// Registra cada passagem de fase de uma prospecção/negociação (entrou_em / saiu_em) para medir
// quanto tempo cada uma leva e quanto fica em cada etapa. Backfill: cria 1 linha ABERTA por item
// existente, na fase atual, a partir do melhor timestamp disponível. Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS tmkt_fase_hist (
//   id uuid PRIMARY KEY, empresa_id text NOT NULL,
//   tipo text NOT NULL,            -- 'prospeccao' | 'venda'
//   ref_id text NOT NULL,
//   fase text NOT NULL,            -- fase para onde foi (fase atual enquanto saiu_em IS NULL)
//   fase_de text,                  -- fase anterior (NULL na criação)
//   por text,                      -- quem moveu (nome do usuário)
//   entrou_em timestamptz NOT NULL,
//   saiu_em timestamptz);          -- NULL = fase atual
// CREATE INDEX IF NOT EXISTS idx_fasehist_ref ON tmkt_fase_hist(tipo, ref_id);
const db = require('../connection');
const { v4: uuid } = require('uuid');
console.log('▶ Migração 352 — tmkt_fase_hist (cronômetro do funil)');
db.exec(`
CREATE TABLE IF NOT EXISTS tmkt_fase_hist (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  fase TEXT NOT NULL,
  fase_de TEXT,
  por TEXT,
  entrou_em TEXT NOT NULL,
  saiu_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_fasehist_ref ON tmkt_fase_hist(tipo, ref_id);
`);
// Backfill só se a tabela estiver vazia (não repete)
const vazio = db.prepare('SELECT COUNT(*) n FROM tmkt_fase_hist').get().n === 0;
if (vazio) {
  const ins = db.prepare('INSERT INTO tmkt_fase_hist (id,empresa_id,tipo,ref_id,fase,fase_de,por,entrou_em,saiu_em) VALUES (?,?,?,?,?,NULL,NULL,?,NULL)');
  const tx = db.transaction(() => {
    for (const p of db.prepare("SELECT id, empresa_id, COALESCE(etapa,'novo') fase, COALESCE(criado_em, datetime('now')) q FROM tmkt_prospeccao").all())
      ins.run(uuid(), p.empresa_id, 'prospeccao', p.id, p.fase, p.q);
    for (const v of db.prepare("SELECT id, empresa_id, COALESCE(status,'rascunho') fase, COALESCE(status_desde, criado_em, datetime('now')) q FROM tmkt_vendas").all())
      ins.run(uuid(), v.empresa_id, 'venda', v.id, v.fase, v.q);
  });
  tx();
  console.log('  ↳ backfill do estado atual concluído.');
}
console.log('✓ Migração 352 concluída (tmkt_fase_hist)');
