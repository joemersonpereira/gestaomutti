// 405 — área de vendas (m²) da loja, p/ o indicador Bulla "Vendas por metro quadrado". Joe 2026-11-14.
// Idempotente: só adiciona a coluna se faltar.
module.exports = function (db) {
  const cols = db.prepare("PRAGMA table_info(lojas)").all().map(c => c.name);
  if (!cols.includes('area_m2')) db.prepare("ALTER TABLE lojas ADD COLUMN area_m2 REAL").run();
};

/* === Caminho técnico v2.0 (Postgres) ===
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS area_m2 numeric;
-- Vendas por m² (Bulla) = venda líquida mensal ÷ area_m2. Cadastrado na tela de Lojas.
*/
