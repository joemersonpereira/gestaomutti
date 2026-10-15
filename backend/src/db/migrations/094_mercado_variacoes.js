// 094 — Meu Mercado: variações de produto (tamanho/cor). Ex.: fardamento P/M/G/GG,
// sacola plástica por tamanho. Cada variação tem estoque/custo/preço próprios.
const db = require('../connection');
console.log('▶ Migração 094 — Variações de produto (Meu Mercado)');

const addCol = (tabela, nome, ddl) => {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
  if (!cols.includes(nome)) { db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`); console.log(`  + ${tabela}.${nome}`); }
};

db.exec(`
CREATE TABLE IF NOT EXISTS mercado_variacoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  produto_id TEXT NOT NULL,
  nome TEXT NOT NULL,            -- ex.: "G", "GG", "Azul M", "40x50"
  ean TEXT,
  custo REAL DEFAULT 0,
  preco REAL DEFAULT 0,
  estoque REAL DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merc_var ON mercado_variacoes(empresa_id, produto_id, ativo);
`);
console.log('  + mercado_variacoes');

addCol('mercado_produtos', 'tem_variacoes', 'tem_variacoes INTEGER DEFAULT 0');
addCol('mercado_pedido_itens', 'variacao_id', 'variacao_id TEXT');
addCol('mercado_pedido_itens', 'variacao_nome', 'variacao_nome TEXT');
addCol('mercado_movimentos', 'variacao_id', 'variacao_id TEXT');
addCol('pontos_resgates', 'variacao_id', 'variacao_id TEXT');

console.log('✓ Migração 094 concluída.');
