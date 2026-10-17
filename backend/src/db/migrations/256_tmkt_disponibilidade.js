// 256_tmkt_disponibilidade.js — Fase 2 do portal (Joe 2026-10-16): travamento de vaga+data.
// Adiciona `atendido` na fila (p/ prioridade de recompra) e índices p/ a checagem de disponibilidade
// por período (vagasLivres: tmkt_venda_espacos × tmkt_vendas). Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_fila ADD COLUMN atendido INTEGER NOT NULL DEFAULT 0`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_ve_espaco ON tmkt_venda_espacos (empresa_id, espaco_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_vendas_status ON tmkt_vendas (empresa_id, status)`);
console.log('✅ migration 256: tmkt_fila.atendido + índices de disponibilidade (travamento vaga+data)');
