// 394 — Config da estimativa de imposto pago a mais na compra do Simples. Como o valor exato de crédito
// perdido (ICMS/PIS-COFINS) varia por produto/estado/ST, o contador calibra UMA alíquota efetiva (%)
// e o sistema estima: imposto a mais ≈ valor comprado do Simples × alíquota. Nada fixo no código.
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS compra_simples_config (
    empresa_id TEXT PRIMARY KEY,
    aliquota REAL NOT NULL DEFAULT 0,
    atualizado_em TEXT,
    atualizado_por TEXT
  )`).run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS compra_simples_config (
  empresa_id text PRIMARY KEY,
  aliquota numeric NOT NULL DEFAULT 0,  -- % efetivo de crédito tributário perdido (calibrado pelo contador)
  atualizado_em timestamptz, atualizado_por text
);
-- Estimativa: imposto_a_mais = valor_comprado_simples_liquido * aliquota/100.
*/
