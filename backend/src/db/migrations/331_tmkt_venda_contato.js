// 331 — Pessoa de contato vinculada à negociação de trade (Joe 2026-11-10).
// Além do fornecedor (empresa), dá pra vincular a PESSOA (CPF+nome) responsável — ela ganha acesso
// ao Portal do fornecedor pra acompanhar a ação (sell-out + comprovação). Guarda contato_cpf (11 díg)
// e contato_nome. Ao salvar, o CPF é liberado em tmkt_acesso_liberado. Idempotente.
const db = require('../connection');
console.log('▶ Migração 331 — pessoa de contato na negociação (acesso ao portal)');
const cols = db.prepare('PRAGMA table_info(tmkt_vendas)').all().map(c => c.name);
if (!cols.includes('contato_cpf')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN contato_cpf TEXT"); console.log('  + tmkt_vendas.contato_cpf'); }
else console.log('  = contato_cpf já existe');
if (!cols.includes('contato_nome')) { db.exec("ALTER TABLE tmkt_vendas ADD COLUMN contato_nome TEXT"); console.log('  + tmkt_vendas.contato_nome'); }
else console.log('  = contato_nome já existe');
console.log('✓ Migração 331 concluída');
