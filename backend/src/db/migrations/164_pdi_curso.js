// 164 — Item do PDI pode referenciar um curso do catálogo (fecha o ciclo gap→ação→curso).
const db = require('../connection');
try { db.exec('ALTER TABLE td_pdi ADD COLUMN curso_id TEXT'); } catch { /* já existe */ }
console.log('✅ migration 164: td_pdi.curso_id (PDI ligado a curso)');
