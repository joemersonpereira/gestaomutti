// 318 — Marcador "Premiação de gestão" no colaborador.
// Gerente de loja e Liderança recebem uma PREMIAÇÃO EXTRA quando a loja/equipe bate a meta.
// Guarda QUAL é o papel para o fechamento ('' = não recebe · 'gerente' · 'lideranca').
// No fechamento: "bateu meta?" sim = valor cheio (cadastrado); não = o operador digita o valor.
// Idempotente (checa a coluna antes do ALTER). É SEPARADO do flag 'lideranca' (que só define
// quem substitui o gerente) — aqui é elegibilidade a prêmio.
const db = require('../connection');
console.log('▶ Migração 318 — marcador "premiacao_gestao" no colaborador');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('premiacao_gestao')) {
  db.exec("ALTER TABLE colaboradores ADD COLUMN premiacao_gestao TEXT DEFAULT ''");
  console.log("  + colaboradores.premiacao_gestao ('' | 'gerente' | 'lideranca')");
} else {
  console.log('  = colaboradores.premiacao_gestao já existe');
}
console.log('✓ Migração 318 concluída.');
