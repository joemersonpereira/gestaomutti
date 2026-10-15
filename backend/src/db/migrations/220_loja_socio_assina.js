// 220_loja_socio_assina.js — sócio (colaborador) que assina os contratos de estágio por loja. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE lojas ADD COLUMN socio_assina_id TEXT`); } catch (e) { /* já existe */ }
console.log('✅ migration 220: lojas.socio_assina_id');
