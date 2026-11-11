// 337 — CRM/Lead de fornecedores de trade (Joe 2026-11-10).
// Traz do ERP os fornecedores que MAIS COMPRAMOS (volume de compra) e deixa rastrear o relacionamento
// de trade com eles: status, cadência de contato (diário/mensal), próximo contato, responsável e obs.
// A compra vem ao vivo do Alpha 7; só o relacionamento fica aqui. Idempotente.
const db = require('../connection');
console.log('▶ Migração 337 — CRM/Lead de fornecedores de trade');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_lead_fornecedor (
  empresa_id TEXT NOT NULL,
  fornecedor_id TEXT NOT NULL,           -- id do fornecedor no ERP
  fornecedor_nome TEXT,
  status TEXT DEFAULT 'novo',            -- novo | a_contatar | contatado | visita_agendada | parceiro | sem_interesse
  periodicidade TEXT DEFAULT '',         -- '' | diario | semanal | mensal (cadência de contato)
  proximo_contato TEXT,                  -- data (YYYY-MM-DD)
  responsavel TEXT,
  contato TEXT,                          -- telefone/e-mail do contato na fornecedora
  obs TEXT,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, fornecedor_id)
)`);
console.log('✓ Migração 337 concluída (tmkt_lead_fornecedor)');
