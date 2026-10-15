// 118_patrimonio_assinatura.js — transferência entre lojas + assinaturas de retirada/devolução.
const db = require('../connection');

const cols = db.prepare("PRAGMA table_info(patrimonio_reserva)").all().map(c => c.name);
const add = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
add('patrimonio_reserva', 'recebedor_nome', 'TEXT');        // quem retirou/recebeu o bem
add('patrimonio_reserva', 'assinatura_retirada', 'TEXT');    // base64 da assinatura de retirada
add('patrimonio_reserva', 'devolvedor_nome', 'TEXT');        // quem devolveu
add('patrimonio_reserva', 'recebedor_devolucao_nome', 'TEXT'); // quem recebeu de volta
add('patrimonio_reserva', 'assinatura_devolucao', 'TEXT');   // base64 da assinatura de devolução

db.exec(`
CREATE TABLE IF NOT EXISTS patrimonio_historico (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  patrimonio_id TEXT NOT NULL,
  tipo TEXT NOT NULL,            -- transferencia | retirada | devolucao
  de_loja_id TEXT, para_loja_id TEXT,
  colaborador_id TEXT, colaborador_nome TEXT,
  obs TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patr_hist ON patrimonio_historico(empresa_id, patrimonio_id);
`);
console.log('✅ migration 118: assinaturas + histórico/transferência de patrimônio');
