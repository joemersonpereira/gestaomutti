// 263_tmkt_plano_rico.js — Plano Comercial como PROPOSTA COMERCIAL completa (Joe 2026-10-16).
// Base: upfront Globo Fenamilho — o plano precisa responder TUDO que o fornecedor perguntaria:
//   por que a data/plano existe, o que a marca ganha, fatos e números, público, produtos,
//   sell-out possível, o que vamos mostrar, ideia de conteúdo nas redes, mídias on/off/online.
// + período de VEICULAÇÃO da campanha (veic_ini/veic_fim) que TRAVA as posições amarradas no período.
// + galeria de fotos (tmkt_plano_fotos). Idempotente.
const db = require('../connection');
const cols = [
  ['veic_ini', 'TEXT'], ['veic_fim', 'TEXT'],       // período de veiculação (trava posições amarradas)
  ['por_que', 'TEXT'],            // por que esse plano/data existe (ex.: importância do Arraiá pra região)
  ['o_que_mostrar', 'TEXT'],      // o que vamos mostrar / como a campanha aparece
  ['publico', 'TEXT'],            // público-alvo / perfil / audiência
  ['produtos_foco', 'TEXT'],      // produtos / categorias foco da ação
  ['sellout_potencial', 'TEXT'],  // sell-out possível / expectativa de giro
  ['oportunidades', 'TEXT'],      // ao participar, a marca ganha...
  ['conteudo_redes', 'TEXT'],     // ideia de criação de conteúdo nas redes sociais
  ['midias_on', 'TEXT'],          // mídias ON (dentro da loja)
  ['midias_off', 'TEXT'],         // mídias OFF (fora/rua/rádio)
  ['midias_online', 'TEXT'],      // mídias ONLINE (e-commerce, redes, g1-like)
  ['faq_json', 'TEXT']            // perguntas e respostas que o fornecedor faria [{q,a}]
];
for (const [c, t] of cols) {
  try { db.exec(`ALTER TABLE tmkt_plano ADD COLUMN ${c} ${t}`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_plano_fotos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, plano_id TEXT NOT NULL,
  foto TEXT, legenda TEXT, ordem INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_plano_fotos ON tmkt_plano_fotos(empresa_id, plano_id)`);
console.log('✅ migration 263: tmkt_plano proposta comercial rica + veiculação (trava) + galeria de fotos');
