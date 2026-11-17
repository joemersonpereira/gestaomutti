// 410_tesouraria_anexo_ref_orcamento.js — liga a comprovação (anexo) ao LANÇAMENTO de despesa
// que o gerente fez na conta "Orçamento - <loja>" no Alpha 7. ref_orcamento = movimentacaocontacorrente.id
// do ERP. Assim o fechamento do dia lista as despesas lançadas no Alpha 7 e marca ✅ quando o gerente
// anexa a foto/PDF daquele lançamento. Joe 2026-11-17. AUTO-EXECUTÁVEL no require (padrão da prod).
const db = require('../connection');
const tem = db.prepare(`SELECT 1 FROM pragma_table_info('tesouraria_anexo') WHERE name='ref_orcamento'`).get();
if (!tem) db.exec(`ALTER TABLE tesouraria_anexo ADD COLUMN ref_orcamento TEXT`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tesouraria_anexo_ref ON tesouraria_anexo (empresa_id, ref_orcamento)`);
console.log('✅ migration 410: tesouraria_anexo.ref_orcamento');

/* === Caminho técnico v2.0 (Postgres) ===
ALTER TABLE tesouraria_anexo ADD COLUMN IF NOT EXISTS ref_orcamento text;
CREATE INDEX IF NOT EXISTS idx_tesouraria_anexo_ref ON tesouraria_anexo (empresa_id, ref_orcamento);
-- ref_orcamento guarda o movimentacaocontacorrente.id do Alpha 7 (débito na conta "Orçamento - <loja>").
-- A tela de fechamento cruza: para cada despesa do dia na conta orçamento, existe anexo com esse ref? → comprovado.
*/
