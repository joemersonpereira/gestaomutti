// 343 — Proposta/estudo + recuperação de perdidas na prospecção (Joe 2026-11-11).
// (1) PROPOSTA: o que foi oferecido ao fornecedor — a "apresentação de oportunidades/estudo".
//     Guarda o texto do que foi proposto + o arquivo da apresentação (base64, igual às artes do trade).
// (2) PERDIDAS recuperáveis: motivo_perda (por que não teve interesse) + reabordar_em (data para
//     voltar a procurar). O card perdido deixa de sumir — fica numa gaveta "Perdidas" com botão Reabrir.
// Idempotente (ALTER protegido por PRAGMA).
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// ALTER TABLE tmkt_prospeccao
//   ADD COLUMN IF NOT EXISTS proposta        text,            -- o que foi oferecido (estudo/oportunidade)
//   ADD COLUMN IF NOT EXISTS proposta_arquivo bytea,          -- no PG: bytea (ou URL de storage); no SQLite guardamos o data-URL base64
//   ADD COLUMN IF NOT EXISTS proposta_mime   text,
//   ADD COLUMN IF NOT EXISTS proposta_nome   text,
//   ADD COLUMN IF NOT EXISTS motivo_perda    text,            -- por que não teve interesse / não avançou
//   ADD COLUMN IF NOT EXISTS reabordar_em    date;            -- quando voltar a procurar esse fornecedor
const db = require('../connection');
console.log('▶ Migração 343 — tmkt_prospeccao: proposta/estudo + perdidas recuperáveis');
const cols = db.prepare("PRAGMA table_info(tmkt_prospeccao)").all().map(c => c.name);
const add = (nome, ddl) => { if (!cols.includes(nome)) db.exec(`ALTER TABLE tmkt_prospeccao ADD COLUMN ${ddl}`); };
add('proposta', 'proposta TEXT');
add('proposta_arquivo', 'proposta_arquivo TEXT');
add('proposta_mime', 'proposta_mime TEXT');
add('proposta_nome', 'proposta_nome TEXT');
add('motivo_perda', 'motivo_perda TEXT');
add('reabordar_em', 'reabordar_em TEXT');
console.log('✓ Migração 343 concluída (proposta + motivo_perda + reabordar_em)');
