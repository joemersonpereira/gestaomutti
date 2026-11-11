// 338 — Funil de Prospecção de fornecedores (CRM de trade) — Joe 2026-11-10.
// Transforma o "Lead" em um FUNIL clicável com cards. A cada R$100 mil comprados de um fornecedor
// (volume do Alpha 7) abre AUTOMATICAMENTE uma prospecção para o responsável fazer contato.
// Cada card guarda histórico/tentativas de contato e a data do PRÓXIMO contato (quando o fornecedor
// remarca). Próximo contato vencido vira "cobrança" na lateral do trade. Idempotente.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE tmkt_prospeccao (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   empresa_id text NOT NULL,
//   fornecedor_id text NOT NULL,                 -- id do fornecedor no ERP A7
//   fornecedor_nome text,
//   etapa text NOT NULL DEFAULT 'novo',          -- novo|em_contato|negociando|ganho|perdido
//   origem text NOT NULL DEFAULT 'manual',       -- manual|automatica (gatilho de R$100k)
//   gatilho_valor numeric,                       -- volume de compra que disparou (marco*100000)
//   responsavel_id text,                         -- colaborador que faz o contato
//   contato_nome text, contato_fone text, contato_email text,
//   proximo_contato date,                        -- próxima data combinada
//   obs text,
//   criado_por text,
//   criado_em timestamptz DEFAULT now(),
//   atualizado_em timestamptz DEFAULT now()
// );
// CREATE INDEX ON tmkt_prospeccao(empresa_id, etapa);
// CREATE INDEX ON tmkt_prospeccao(empresa_id, fornecedor_id);
// CREATE TABLE tmkt_prospeccao_contato (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   prospeccao_id uuid NOT NULL REFERENCES tmkt_prospeccao(id) ON DELETE CASCADE,
//   quando timestamptz DEFAULT now(),
//   tipo text,                                   -- ligacao|whatsapp|email|visita|reuniao|outro
//   resultado text,                              -- sem_resposta|retornar|agendou|avancou|sem_interesse|fechou
//   anotacao text,
//   proximo date,                                -- próximo contato definido NESSE registro
//   criado_por text
// );
// CREATE INDEX ON tmkt_prospeccao_contato(prospeccao_id, quando DESC);
// -- controle do gatilho automático: quantos marcos de 100k já viraram prospecção
// CREATE TABLE tmkt_prospeccao_marco (
//   empresa_id text NOT NULL, fornecedor_id text NOT NULL,
//   marcos_processados int NOT NULL DEFAULT 0,
//   atualizado_em timestamptz DEFAULT now(),
//   PRIMARY KEY (empresa_id, fornecedor_id)
// );
const db = require('../connection');
console.log('▶ Migração 338 — Funil de Prospecção (CRM de trade)');
db.exec(`
CREATE TABLE IF NOT EXISTS tmkt_prospeccao (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  fornecedor_id TEXT NOT NULL,
  fornecedor_nome TEXT,
  etapa TEXT NOT NULL DEFAULT 'novo',          -- novo|em_contato|negociando|ganho|perdido
  origem TEXT NOT NULL DEFAULT 'manual',       -- manual|automatica
  gatilho_valor REAL,
  responsavel_id TEXT,
  contato_nome TEXT, contato_fone TEXT, contato_email TEXT,
  proximo_contato TEXT,
  obs TEXT,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prospeccao_emp_etapa ON tmkt_prospeccao(empresa_id, etapa);
CREATE INDEX IF NOT EXISTS idx_prospeccao_emp_forn ON tmkt_prospeccao(empresa_id, fornecedor_id);

CREATE TABLE IF NOT EXISTS tmkt_prospeccao_contato (
  id TEXT PRIMARY KEY,
  prospeccao_id TEXT NOT NULL,
  quando TEXT DEFAULT (datetime('now')),
  tipo TEXT,
  resultado TEXT,
  anotacao TEXT,
  proximo TEXT,
  criado_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_prospeccao_contato ON tmkt_prospeccao_contato(prospeccao_id);

CREATE TABLE IF NOT EXISTS tmkt_prospeccao_marco (
  empresa_id TEXT NOT NULL,
  fornecedor_id TEXT NOT NULL,
  marcos_processados INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, fornecedor_id)
);
`);
console.log('✓ Migração 338 concluída (tmkt_prospeccao + contato + marco)');
