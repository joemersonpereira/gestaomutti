// 253_tmkt_segmento.js — segmento do espaço no catálogo (estilo Tradebook): digital(ON) | off | allline.
// Organiza o portal em seções. Idempotente. Auto-classifica os espaços existentes pelo nome/área.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_espaco_loja ADD COLUMN segmento TEXT`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
// palpite inicial pelos termos (a tela interna ajusta depois)
const rows = db.prepare(`SELECT id, area, espaco FROM tmkt_espaco_loja WHERE segmento IS NULL OR segmento=''`).all();
const up = db.prepare(`UPDATE tmkt_espaco_loja SET segmento=? WHERE id=?`);
const classif = t => {
  const s = (t || '').toLowerCase();
  if (/instagram|reels|feed|stor|rede|tiktok|whats|disparo|hotsite|digital|publi|online/.test(s)) return 'digital';
  if (/filipeta|atendimento|caixa|r[aá]dio interna|comunidade|r[eé]gua|monitor/.test(s)) return 'allline';
  return 'off'; // gôndola, vitrine, cestão, encarte, PDV, outdoor, LED… = físico
};
const tx = db.transaction(() => rows.forEach(r => up.run(classif((r.area || '') + ' ' + (r.espaco || '')), r.id)));
tx();
console.log('✅ migration 253: tmkt_espaco_loja.segmento (' + rows.length + ' classificados)');
