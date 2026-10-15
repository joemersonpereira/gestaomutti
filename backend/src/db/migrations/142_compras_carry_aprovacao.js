// 142 — Aprovação do Diretor para o "carry" do orçamento de compra (o excedente que não coube no
// caixa do mês e é empurrado para o mês seguinte precisa de autorização da Direção).
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS compras_carry_aprovacao (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,          -- mês que GERA o carry (o excedente sai deste mês para o seguinte)
  valor REAL DEFAULT 0,          -- valor do carry no momento da aprovação (referência)
  aprovado INTEGER DEFAULT 0,
  observacao TEXT,
  aprovado_por TEXT,
  aprovado_em TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_carry_aprov_uq ON compras_carry_aprovacao(empresa_id, ano, mes);
`);
console.log('✅ migration 142: compras_carry_aprovacao');
