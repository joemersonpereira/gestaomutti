// 073 — Marcação de Farmácia Popular na loja (para o cálculo do indicador PBM).
// Se a loja NÃO tem Farmácia Popular, os itens de Farmácia Popular (pbm 349) não
// entram na aderência de PBM daquela loja.
const db = require('../connection');
console.log('▶ Migração 073 — flag Farmácia Popular na loja');
const cols = db.prepare("PRAGMA table_info(lojas)").all().map(c => c.name);
if (!cols.includes('tem_farmacia_popular')) {
  db.exec('ALTER TABLE lojas ADD COLUMN tem_farmacia_popular INTEGER DEFAULT 1');
  console.log('  + lojas.tem_farmacia_popular (padrão 1 = tem)');
} else {
  console.log('  = lojas.tem_farmacia_popular já existe');
}
console.log('✓ Migração 073 concluída.');
