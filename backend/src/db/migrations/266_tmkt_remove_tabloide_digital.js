// 266_tmkt_remove_tabloide_digital.js — remove os "Tabloide - Digital" legados (Joe 2026-10-16):
// eram da importação antiga (segmento='digital', area='Tabloide - Digital') e duplicavam o Tabloide
// real (segmento='encarte', que tem seção própria). Só apaga os que NÃO estão em nenhuma venda.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
const alvo = db.prepare(`SELECT id, espaco FROM tmkt_espaco_loja WHERE empresa_id=? AND segmento='digital' AND area='Tabloide - Digital'`).all(EMP);
const temVenda = db.prepare('SELECT 1 FROM tmkt_venda_espacos WHERE espaco_id=? LIMIT 1');
const del = db.prepare('DELETE FROM tmkt_espaco_loja WHERE id=?');
let n = 0;
for (const a of alvo) { if (!temVenda.get(a.id)) { del.run(a.id); n++; } }
console.log(`✅ migration 266: ${n} itens "Tabloide - Digital" legados removidos (de ${alvo.length})`);
