// 033 — notas manuais de indicadores por loja/mês
const db = require('../connection');
console.log('▶ Migração 033 — indicador_nota_manual');
db.exec(`CREATE TABLE IF NOT EXISTS indicador_nota_manual (
  empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, indicador_id TEXT NOT NULL,
  mes INTEGER NOT NULL, ano INTEGER NOT NULL, nota INTEGER,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, loja_id, indicador_id, mes, ano)
);`);
console.log('✓ Migração 033 concluída');
