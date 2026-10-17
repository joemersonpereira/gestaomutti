// 249_tmkt_meta_periodicidade.js — a "meta_compra" na verdade é o COMPROMISSO DE COMPRA DA EMPRESA
// com o fornecedor (contrapartida do espaço): compramos R$X por período dele. Periodicidade do
// compromisso: mensal | trimestral | semestral (ou por período fixo). Controle interno. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_vendas ADD COLUMN meta_periodicidade TEXT DEFAULT 'mensal'`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 249: tmkt_vendas.meta_periodicidade (compromisso de compra da empresa)');
