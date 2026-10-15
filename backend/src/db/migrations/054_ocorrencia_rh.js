// 054 — fluxo de validação do RH nas ocorrências (porteiro) + assinatura
const db = require('../connection');
console.log('▶ Migração 054 — ocorrências com validação do RH');
for (const col of [
  `exige_assinatura INTEGER DEFAULT 0`,
  `assinado_em TEXT`,
  `validada_por TEXT`,
  `validada_em TEXT`,
  `reanalise TEXT`,
]) {
  try { db.exec(`ALTER TABLE ocorrencias ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
}
console.log('✓ Migração 054 concluída');
