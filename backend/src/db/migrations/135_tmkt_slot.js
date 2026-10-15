// 135 — Trava o SLOT exato do espaço vendido no Trade Marketing.
// Cada espaço-loja tem N vagas (quantidade); cada venda ocupa 1 vaga numerada. Impede vender mais que N.
const db = require('../connection');
const cols = db.prepare("PRAGMA table_info(tmkt_venda_espacos)").all().map(c => c.name);
if (!cols.includes('slot')) db.exec('ALTER TABLE tmkt_venda_espacos ADD COLUMN slot INTEGER');
console.log('✅ migration 135: tmkt_venda_espacos.slot');
