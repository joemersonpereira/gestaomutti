// 258_tmkt_modo_venda.js — "modo de venda" de cada posição comercializável (Joe 2026-10-16):
//   periodo  = espaço fechado por um tempo (vitrine, gôndola, banner da home, tabloide por edição)
//   insercao = compra uma QUANTIDADE de inserções (spots de rádio, stories/reels, posts) com data/hora
// Regra do Joe: espaços físicos = período fechado · digital/rádio = inserção. A gestão pode mudar. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_espaco_loja ADD COLUMN modo_venda TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
const EMP = 'empresa-mutti-001';
// padrões por segmento (só onde ainda está nulo)
db.prepare(`UPDATE tmkt_espaco_loja SET modo_venda='insercao' WHERE empresa_id=? AND modo_venda IS NULL AND segmento IN ('social','radio')`).run(EMP);
db.prepare(`UPDATE tmkt_espaco_loja SET modo_venda='periodo'  WHERE empresa_id=? AND modo_venda IS NULL`).run(EMP);
console.log('✅ migration 258: tmkt_espaco_loja.modo_venda (período × inserção) + padrões');
