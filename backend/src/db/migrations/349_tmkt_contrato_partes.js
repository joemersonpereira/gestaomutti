// 349 — Contrato: dados editáveis do CONTRATANTE (cessionário/fornecedor) + representante que assina — Joe 2026-11-11.
// Permite sobrescrever os dados do fornecedor no contrato (nome/CNPJ/endereço, já que o CNPJ do ERP
// pode vir vazio) e informar QUEM assina pela empresa (nome + CPF). Na assinatura o CPF é obrigatório
// e precisa BATER com representante_cpf. Idempotente (ALTER protegido por PRAGMA).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE tmkt_contrato
//   ADD COLUMN IF NOT EXISTS contratante_nome text,
//   ADD COLUMN IF NOT EXISTS contratante_cnpj text,
//   ADD COLUMN IF NOT EXISTS contratante_endereco text,
//   ADD COLUMN IF NOT EXISTS representante_nome text,
//   ADD COLUMN IF NOT EXISTS representante_cpf text,
//   ADD COLUMN IF NOT EXISTS aceite_mp int NOT NULL DEFAULT 0;  -- aceite "reconheço o texto + assino conforme MP 2.200-2/2001"
const db = require('../connection');
console.log('▶ Migração 349 — tmkt_contrato: partes (contratante + representante)');
const cols = db.prepare("PRAGMA table_info(tmkt_contrato)").all().map(c => c.name);
const add = (nome, ddl) => { if (!cols.includes(nome)) db.exec(`ALTER TABLE tmkt_contrato ADD COLUMN ${ddl}`); };
add('contratante_nome', 'contratante_nome TEXT');
add('contratante_cnpj', 'contratante_cnpj TEXT');
add('contratante_endereco', 'contratante_endereco TEXT');
add('representante_nome', 'representante_nome TEXT');
add('representante_cpf', 'representante_cpf TEXT');
add('aceite_mp', 'aceite_mp INTEGER NOT NULL DEFAULT 0');
console.log('✓ Migração 349 concluída (tmkt_contrato partes)');
