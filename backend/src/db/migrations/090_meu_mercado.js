// 090 — Meu Mercado (loja interna): produtos, estoque, movimentos e pedidos.
// Categorias: limpeza | escritorio | fardamento | brinde. NF do ERP alimenta estoque+custo.
const db = require('../connection');
console.log('▶ Migração 090 — Meu Mercado');
db.exec(`
CREATE TABLE IF NOT EXISTS mercado_produtos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  categoria TEXT NOT NULL,          -- limpeza | escritorio | fardamento | brinde
  nome TEXT NOT NULL,
  unidade TEXT DEFAULT 'UN',
  ean TEXT,
  custo REAL DEFAULT 0,             -- custo médio
  preco REAL DEFAULT 0,             -- preço de venda interno (fardamento p/ colaborador)
  estoque REAL DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS mercado_movimentos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  produto_id TEXT NOT NULL,
  tipo TEXT NOT NULL,               -- entrada | saida | ajuste
  quantidade REAL NOT NULL,
  custo_unit REAL DEFAULT 0,
  origem TEXT,                      -- nf_erp | pedido | brinde | manual
  referencia TEXT,                  -- nº NF / id do pedido
  loja_id TEXT,                     -- destino (saída) → custo por loja
  destino TEXT,                     -- brinde: loja/pessoa/campanha (texto)
  colaborador_id TEXT,
  obs TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mercado_pedidos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,
  solicitante_id TEXT,
  solicitante_nome TEXT,
  categoria TEXT,                   -- materiais | fardamento
  status TEXT NOT NULL DEFAULT 'pedido', -- pedido | separacao | enviado | entregue | cancelado
  obs TEXT,
  atendido_por TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS mercado_pedido_itens (
  id TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL,
  produto_id TEXT,
  nome TEXT,
  quantidade REAL DEFAULT 1,
  atendida REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_merc_prod ON mercado_produtos(empresa_id, categoria, ativo);
CREATE INDEX IF NOT EXISTS idx_merc_mov ON mercado_movimentos(empresa_id, produto_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_merc_ped ON mercado_pedidos(empresa_id, status, loja_id);
`);
console.log('  + mercado_produtos, mercado_movimentos, mercado_pedidos, mercado_pedido_itens');
console.log('✓ Migração 090 concluída.');
