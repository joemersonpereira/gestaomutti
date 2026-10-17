// 261_tmkt_reserva_criativo.js — fluxo de reserva completo por POSIÇÃO reservada (Joe 2026-10-16):
//   • modo de venda (período × inserção) + agenda de inserções (datas/horários livres)
//   • criativo: 'anexo' (spot/arte/vídeo) | 'texto' (leitura ao vivo) | 'producao' (Mutti produz, +R$150 isentável)
//   • briefing (fornecedor ou gestão) + aprovação
//   • aprovação de material quando a arte é fechada (arte_status) — base p/ o #2
//   • comprovação de ação POR ITEM ("sempre em tudo")
// Guarda arte/comprovante como data-URI (mesmo padrão de tmkt_espaco_loja.foto). Idempotente.
const db = require('../connection');
const cols = [
  ['modo_venda', 'TEXT'],         // 'periodo' | 'insercao' (snapshot no momento da reserva)
  ['insercoes', 'INTEGER'],       // qtd de inserções (modo insercao)
  ['agenda', 'TEXT'],             // datas/horários desejados, texto livre
  ['criativo_tipo', 'TEXT'],      // 'anexo' | 'texto' | 'producao'
  ['arte_b64', 'TEXT'],           // data-URI da arte/spot/vídeo anexado
  ['arte_mime', 'TEXT'],
  ['criativo_texto', 'TEXT'],     // texto p/ leitura ao vivo / legenda
  ['producao', 'INTEGER'],        // 1 = fornecedor pediu que a Mutti produza
  ['producao_custo', 'REAL'],     // custo da produção (padrão 150)
  ['producao_isenta', 'INTEGER'], // 1 = gestão isentou o custo da arte
  ['briefing', 'TEXT'],
  ['briefing_status', 'TEXT'],    // 'rascunho' | 'enviado' | 'aprovado' | 'reprovado'
  ['arte_status', 'TEXT'],        // 'pendente' | 'enviada' | 'aprovada' | 'reprovada'
  ['arte_obs', 'TEXT'],           // motivo da reprovação / observação da gestão
  ['comprov_b64', 'TEXT'],        // comprovação da ação (foto da peça no ar)
  ['comprov_mime', 'TEXT'],
  ['comprov_em', 'TEXT']
];
for (const [c, t] of cols) {
  try { db.exec(`ALTER TABLE tmkt_venda_espacos ADD COLUMN ${c} ${t}`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
console.log('✅ migration 261: tmkt_venda_espacos + criativo/briefing/aprovação/comprovação por item (' + cols.length + ' colunas)');
