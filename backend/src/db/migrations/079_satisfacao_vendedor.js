// 079 — Avaliação do VENDEDOR por QR (cliente avalia quem o atendeu).
// O cliente avalia durante o atendimento (antes de pagar), então a venda ainda não
// existe no ERP: a avaliação entra PENDENTE (validado=0) e é confirmada depois, quando
// o cupom fecha no caixa — só validamos se aquele CPF teve venda hoje COM aquele vendedor.
const db = require('../connection');
console.log('▶ Migração 079 — avaliação do vendedor por QR');
db.exec(`
CREATE TABLE IF NOT EXISTS satisfacao_vendedor (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,
  vendedor_id TEXT NOT NULL,        -- colaborador avaliado
  cpf TEXT NOT NULL,                -- CPF do cliente (para cruzar com o ERP)
  nota INTEGER NOT NULL,            -- 1 a 5
  comentario TEXT,
  validado INTEGER DEFAULT 0,       -- 0 = pendente, 1 = venda confirmada com este vendedor
  validado_em TEXT,
  ip TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_satvend_vend ON satisfacao_vendedor(vendedor_id, validado, criado_em);
CREATE INDEX IF NOT EXISTS idx_satvend_pend ON satisfacao_vendedor(validado, criado_em);
CREATE INDEX IF NOT EXISTS idx_satvend_dedup ON satisfacao_vendedor(vendedor_id, cpf, criado_em);
`);
console.log('  + tabela satisfacao_vendedor');
console.log('✓ Migração 079 concluída.');
