// 225_despesa_nf_lida.js — guarda o que foi LIDO do comprovante (PDF) da despesa, para validar
// se é nota fiscal (número/CNPJ/valor extraídos via pdftotext). Idempotente.
const db = require('../connection');
for (const col of ['nf_lida_numero TEXT', 'nf_lida_cnpj TEXT', 'nf_lida_valor REAL', 'nf_lida_em TEXT']) {
  try { db.exec(`ALTER TABLE contabil_despesa_lancamento ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
}
console.log('✅ migration 225: contabil_despesa_lancamento nf_lida_*');
