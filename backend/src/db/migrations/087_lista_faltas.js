// 087 — Lista de faltas (Comercial): a loja pede o que faltou; o comprador compra.
const db = require('../connection');
console.log('▶ Migração 087 — lista de faltas');
db.exec(`
CREATE TABLE IF NOT EXISTS lista_faltas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT NOT NULL,
  colaborador_id TEXT,            -- quem lançou
  colaborador_nome TEXT,
  embalagem_id INTEGER,           -- ERP embalagem.id
  produto_id INTEGER,             -- ERP produto.id
  ean TEXT,
  descricao TEXT,
  marca TEXT,
  quantidade INTEGER DEFAULT 1,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'aberta', -- 'aberta' | 'em_pedido' | 'entregue' | 'cancelada'
  atendido_por TEXT,             -- comprador que tratou
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_faltas_loja ON lista_faltas(empresa_id, loja_id, status);
CREATE INDEX IF NOT EXISTS idx_faltas_emb ON lista_faltas(embalagem_id);
`);
console.log('  + lista_faltas');
console.log('✓ Migração 087 concluída.');
