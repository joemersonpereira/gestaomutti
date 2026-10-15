// 160 — Valor do patrocínio RECEBIDO numa ação de marketing (entra como receita que
// abate a verba no orçamento). Antes só existia o nome do patrocinador (texto).
const db = require('../connection');
try { db.exec('ALTER TABLE mkt_agenda ADD COLUMN patrocinio_valor REAL DEFAULT 0'); } catch { /* já existe */ }
console.log('✅ migration 160: mkt_agenda.patrocinio_valor (patrocínio recebido → receita)');
