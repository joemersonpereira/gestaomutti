// 335 — Premiação do VENDEDOR de trade (Joe 2026-11-10).
// Quem CADASTRA a negociação (criado_por) é o vendedor. A regra é POR ESPAÇO: a quantidade de espaços
// vendidos no mês define a faixa de %, aplicada sobre o valor vendido. Apuração MENSAL (o que foi
// fechado no mês). Lock por mês pra não duplicar premiação.
const db = require('../connection');
console.log('▶ Migração 335 — premiação do vendedor de trade (regra + lock)');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_prem_vend_regra (
  empresa_id TEXT PRIMARY KEY,
  faixas_json TEXT,            -- [{ate: 10, pct: 1}, {ate: null, pct: 2}] — ate=null é "acima"
  atualizado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_prem_vend_fechado (
  empresa_id TEXT NOT NULL, mes INTEGER NOT NULL, ano INTEGER NOT NULL,
  fechado INTEGER NOT NULL DEFAULT 1, fechado_em TEXT, fechado_por TEXT,
  PRIMARY KEY (empresa_id, mes, ano)
)`);
console.log('✓ Migração 335 concluída (tmkt_prem_vend_regra, tmkt_prem_vend_fechado)');
