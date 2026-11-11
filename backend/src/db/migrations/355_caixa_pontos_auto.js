// 355 — Critérios de pontos que viraram AUTOMÁTICOS (Joe 2026-11-11).
// O erro de sangria é detectado pela quebra (origem 'C' = Depósito de Sangria / depósito correção) e a
// modalidade errada pela "troca de forma" na conciliação de cartão (cc.correcoes). Então esses dois
// critérios, que estavam como 'manual', passam a 'auto' — o ranking aplica a perda de ponto sozinho.
// Idempotente (UPDATE por chave; não recria nada).
const db = require('../connection');
console.log('▶ Migração 355 — caixa_pontos critérios auto (sangria/modalidade)');
try {
  const up = db.prepare("UPDATE caixa_pontos_regra SET tipo='auto' WHERE chave IN ('erro_sangria_dp','modalidade_errada')");
  const r = up.run();
  console.log('✓ Migração 355 concluída (' + (r.changes || 0) + ' regras → auto)');
} catch (e) {
  console.log('⚠ Migração 355: tabela caixa_pontos_regra ainda não existe? ' + e.message);
}
