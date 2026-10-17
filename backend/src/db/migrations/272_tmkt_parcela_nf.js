// 272_tmkt_parcela_nf.js — forma de pagamento detalhada por parcela (Joe 2026-10-16):
// cada parcela/recebimento tem uma FORMA (bonificação/depósito/desconto em boleto/brindes/outros),
// vencimento e, conforme a forma, documentos:
//   • bonificação → NF obrigatória (nf_numero/nf_data/nf_valor; pode buscar do Alpha)
//   • desconto em boleto → anexo do e-mail de autorização do abatimento (comprovante_foto)
//   • depósito → comprovante do depósito (comprovante_foto)
// `forma` e `comprovante_*` já existem; aqui só os campos da NF + quem informou. Idempotente.
const db = require('../connection');
const cols = [
  ['nf_numero', 'TEXT'],
  ['nf_data', 'TEXT'],
  ['nf_valor', 'REAL'],
  ['informado_por', 'TEXT']  // 'gestao' | 'fornecedor'
];
for (const [c, t] of cols) {
  try { db.exec(`ALTER TABLE tmkt_parcelas ADD COLUMN ${c} ${t}`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
console.log('✅ migration 272: tmkt_parcelas + NF da bonificação (nf_numero/data/valor) + informado_por');
