// 319 — Marcador "Caixa (premiação por kits)" no colaborador.
// O caixa recebe uma premiação por bater a meta de venda de KITS: por faixa de unidades.
// Regra inicial do Joe (valores ficam cadastráveis no fechamento): >=100 un -> R$250 · <100 un -> R$120.
// Guarda só o FLAG de elegibilidade aqui (premiacao_caixa 0/1); as faixas/valores são config do fechamento.
// Idempotente (checa a coluna antes do ALTER).
const db = require('../connection');
console.log('▶ Migração 319 — flag "premiacao_caixa" no colaborador');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('premiacao_caixa')) {
  db.exec('ALTER TABLE colaboradores ADD COLUMN premiacao_caixa INTEGER DEFAULT 0');
  console.log('  + colaboradores.premiacao_caixa (0/1)');
} else {
  console.log('  = colaboradores.premiacao_caixa já existe');
}
console.log('✓ Migração 319 concluída.');
