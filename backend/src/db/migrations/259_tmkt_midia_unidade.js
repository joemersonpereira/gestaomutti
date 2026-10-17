// 259_tmkt_midia_unidade.js — organiza a tela de posições da gestão (Joe 2026-10-16):
//   midia   = p/ ESPAÇO FÍSICO: 'off' (só loja física) | 'on' (só digital no ponto) | 'ambos' (all-line)
//             → acaba com a duplicação "Mídia OFF" × "All-line": uma lista só, com a coluna Mídia ao lado.
//   unidade = a que se refere a quantidade de vagas: 'mes' | 'dia' | 'edicao' | 'periodo'
//             → rede social é limitada (ex.: X posts/dia), tabloide é por edição, físico é por período.
// Idempotente. Não mexe em segmento (o portal ainda usa p/ montar o catálogo).
const db = require('../connection');
const EMP = 'empresa-mutti-001';
for (const col of ['midia', 'unidade']) {
  try { db.exec(`ALTER TABLE tmkt_espaco_loja ADD COLUMN ${col} TEXT`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
// mídia só faz sentido no físico — deriva do segmento atual
db.prepare(`UPDATE tmkt_espaco_loja SET midia='off'   WHERE empresa_id=? AND midia IS NULL AND segmento='off'`).run(EMP);
db.prepare(`UPDATE tmkt_espaco_loja SET midia='ambos' WHERE empresa_id=? AND midia IS NULL AND segmento='allline'`).run(EMP);
db.prepare(`UPDATE tmkt_espaco_loja SET midia='on'    WHERE empresa_id=? AND midia IS NULL AND segmento='digital'`).run(EMP);
// unidade da quantidade
db.prepare(`UPDATE tmkt_espaco_loja SET unidade='edicao'  WHERE empresa_id=? AND unidade IS NULL AND segmento='encarte'`).run(EMP);
db.prepare(`UPDATE tmkt_espaco_loja SET unidade='mes'     WHERE empresa_id=? AND unidade IS NULL AND segmento IN ('ecommerce','crm','social','radio')`).run(EMP);
db.prepare(`UPDATE tmkt_espaco_loja SET unidade='periodo' WHERE empresa_id=? AND unidade IS NULL`).run(EMP);
const r = db.prepare(`SELECT segmento, midia, unidade, COUNT(*) n FROM tmkt_espaco_loja WHERE empresa_id=? GROUP BY segmento, midia, unidade ORDER BY segmento`).all(EMP);
console.log('✅ migration 259: midia + unidade');
r.forEach(x => console.log(`  ${x.segmento} · mídia=${x.midia || '—'} · un=${x.unidade || '—'} (${x.n})`));
