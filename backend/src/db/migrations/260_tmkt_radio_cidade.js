// 260_tmkt_radio_cidade.js — arruma a rádio (Joe 2026-10-16):
//   • Rádio EXTERNA = por CIDADE (a rádio local da cidade), com os tipos de inserção (spot gravado, ao vivo).
//   • Rádio INTERNA = padrão da REDE (Hora Certa + inserções de marca gravadas durante o dia).
//   • Remove as linhas genéricas antigas ("Radio Externa", "Radio Inserção") que não servem p/ nada.
// Guarda a cidade em loja_nome (escopo cidade) p/ a externa; interna fica ESCRITÓRIO. Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
// 1) apaga placeholders genéricos (só os exatos, sem vendas vinculadas)
const lixo = db.prepare(`SELECT id FROM tmkt_espaco_loja WHERE empresa_id=? AND segmento='radio' AND espaco IN ('Radio Externa','Radio Inserção')`).all(EMP);
const temVenda = db.prepare(`SELECT 1 FROM tmkt_venda_espacos WHERE espaco_id=? LIMIT 1`);
const del = db.prepare('DELETE FROM tmkt_espaco_loja WHERE id=?');
let apagados = 0;
for (const l of lixo) { if (!temVenda.get(l.id)) { del.run(l.id); apagados++; } }
// 2) externa por cidade: as rádios "Esplanada FM" pertencem à cidade de Esplanada
db.prepare(`UPDATE tmkt_espaco_loja SET area='Rádio Externa', loja_nome='Esplanada', unidade='mes'
   WHERE empresa_id=? AND segmento='radio' AND espaco LIKE 'Esplanada FM%'`).run(EMP);
// 3) interna continua rede (ESCRITÓRIO)
db.prepare(`UPDATE tmkt_espaco_loja SET area='Rádio Interna', loja_nome='ESCRITÓRIO', unidade='mes'
   WHERE empresa_id=? AND segmento='radio' AND espaco LIKE 'Rádio Interna%'`).run(EMP);
console.log(`✅ migration 260: rádio externa por cidade + interna rede (${apagados} genéricas removidas)`);
db.prepare(`SELECT area, espaco, loja_nome FROM tmkt_espaco_loja WHERE empresa_id=? AND segmento='radio' ORDER BY area, espaco`).all(EMP)
  .forEach(x => console.log(`  [${x.area}] ${x.espaco} · ${x.loja_nome}`));
