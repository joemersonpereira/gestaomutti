// 393 — Perdão da compra do Simples Nacional. Mutti é Lucro Real: comprar de fornecedor do Simples/MEI
// gera tributação maior (menos crédito). Vira indicador do comprador — MAS pode ser "perdoado" por mês/
// fornecedor se o comprador comprovar que o Simples deu um desconto que compensa a tributação a mais.
// Idempotente.
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS compra_simples_perdao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id TEXT NOT NULL,
    comprador_id TEXT,
    cnpj TEXT NOT NULL,
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    justificativa TEXT,
    perdoado_por TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    UNIQUE(empresa_id, comprador_id, cnpj, ano, mes)
  )`).run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS compra_simples_perdao (
  id bigserial PRIMARY KEY,
  empresa_id text NOT NULL,
  comprador_id text,
  cnpj text NOT NULL,
  ano int NOT NULL, mes int NOT NULL,
  justificativa text, perdoado_por text,
  criado_em timestamptz DEFAULT now(),
  UNIQUE(empresa_id, comprador_id, cnpj, ano, mes)
);
-- O valor comprado do Simples vem do ERP (notafiscal tipooperacao='1') cruzado com fornecedor_regime
-- (regime IN ('Simples Nacional','MEI') OU opcao_simples=1), atribuído aos produtos do comprador.
-- Uma linha de perdão exclui aquele fornecedor/competência do indicador do comprador.
*/
