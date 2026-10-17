// 264_tmkt_plano_foto_secao.js — banner por SEÇÃO do plano (Joe 2026-10-16):
// cada bloco de texto da proposta (por_que, o_que_mostrar, oportunidades, publico, produtos_foco,
// sellout_potencial, conteudo_redes, midias_on/off/online) pode ter um banner próprio.
// secao NULL/'' = foto da galeria geral; secao='<campo>' = banner daquele bloco. Idempotente.
const db = require('../connection');
try { db.exec(`ALTER TABLE tmkt_plano_fotos ADD COLUMN secao TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 264: tmkt_plano_fotos.secao (banner por bloco da proposta)');
