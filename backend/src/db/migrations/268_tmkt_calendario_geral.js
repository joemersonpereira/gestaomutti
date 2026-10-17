// 268_tmkt_calendario_geral.js — calendário GERAL (Joe 2026-10-16):
// o calendário passa a ser geral/aberto (não só trade). Cada programação tem a marcação
// no_trade = "aparece no Trade Marketing para comercializar" (patrocínio pelo fornecedor).
// Só os eventos com no_trade=1 aparecem no portal do fornecedor. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_calendario ADD COLUMN no_trade INTEGER DEFAULT 0`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
const EMP = 'empresa-mutti-001';
// os eventos já cadastrados eram do trade → marca como comercializáveis
db.prepare(`UPDATE tmkt_calendario SET no_trade=1 WHERE empresa_id=? AND (no_trade IS NULL OR no_trade=0) AND COALESCE(patrocinavel,1)=1`).run(EMP);
console.log('✅ migration 268: tmkt_calendario.no_trade (aparece no Trade p/ comercializar)');
