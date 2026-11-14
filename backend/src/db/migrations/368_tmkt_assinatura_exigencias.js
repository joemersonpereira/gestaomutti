// 368 — Assinatura eletrônica do Trade: escolher O QUE pedir ao assinante — Joe 2026-11-12.
// Ao solicitar a assinatura (contrato ou termo de veiculação), o gestor marca o que o fornecedor precisa
// enviar: SELFIE, FOTO DO DOCUMENTO e/ou ASSINATURA NA TELA. A página pública só mostra e só exige o que
// foi marcado. Nome, CPF (que bate com o representante), aceite da MP 2.200-2/2001, IP e data/hora
// continuam sempre obrigatórios. Padrão = 1 (pede tudo), igual ao comportamento anterior.
// Idempotente (ALTER protegido por PRAGMA).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE tmkt_contrato
//   ADD COLUMN IF NOT EXISTS exige_selfie smallint NOT NULL DEFAULT 1,
//   ADD COLUMN IF NOT EXISTS exige_documento smallint NOT NULL DEFAULT 1,
//   ADD COLUMN IF NOT EXISTS exige_assinatura smallint NOT NULL DEFAULT 1;
// ALTER TABLE tmkt_veic_termo
//   ADD COLUMN IF NOT EXISTS exige_selfie smallint NOT NULL DEFAULT 1,
//   ADD COLUMN IF NOT EXISTS exige_documento smallint NOT NULL DEFAULT 1,
//   ADD COLUMN IF NOT EXISTS exige_assinatura smallint NOT NULL DEFAULT 1;
// Regra na assinatura (POST público): só valida a imagem cujo exige_* = 1.
const db = require('../connection');
console.log('▶ Migração 368 — tmkt_contrato / tmkt_veic_termo: exigências da assinatura');
for (const tabela of ['tmkt_contrato', 'tmkt_veic_termo']) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
  for (const col of ['exige_selfie', 'exige_documento', 'exige_assinatura']) {
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 1`);
  }
}
console.log('✓ Migração 368 concluída (exigências da assinatura)');
