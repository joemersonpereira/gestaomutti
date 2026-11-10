// 321 — Status de fechamento do mês de premiação (travar/reabrir).
// Quando um mês é FECHADO, as decisões (%, descontos, gestão) e os relatórios ficam travados —
// vira o fechamento oficial. Só a gestão reabre. Idempotente (CREATE IF NOT EXISTS).
const db = require('../connection');
console.log('▶ Migração 321 — status de fechamento da premiação');
db.exec(`
CREATE TABLE IF NOT EXISTS premiacao_fechado (
  empresa_id TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  fechado INTEGER DEFAULT 0,
  fechado_em TEXT,
  fechado_por TEXT,
  PRIMARY KEY (empresa_id, mes, ano)
);
`);
console.log('✓ Migração 321 concluída (premiacao_fechado).');
