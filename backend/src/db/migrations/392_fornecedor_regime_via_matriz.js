// 392 — Marca o fornecedor cujo regime foi herdado da MATRIZ (ou de uma filial irmã da mesma raiz de CNPJ).
// Regime é atributo da EMPRESA (raiz), não do CNPJ da filial: se já temos o regime de qualquer CNPJ da
// mesma raiz, as filiais Desconhecidas recebem o mesmo regime, marcadas com via_matriz=1 (UI mostra badge).
// Idempotente: só adiciona a coluna se ainda não existir.
module.exports = function (db) {
  const cols = db.prepare("PRAGMA table_info(fornecedor_regime)").all().map(c => c.name);
  if (!cols.includes('via_matriz')) {
    db.prepare("ALTER TABLE fornecedor_regime ADD COLUMN via_matriz INTEGER NOT NULL DEFAULT 0").run();
  }
};

/* === Caminho técnico v2.0 (Postgres) ===
ALTER TABLE fornecedor_regime ADD COLUMN IF NOT EXISTS via_matriz boolean NOT NULL DEFAULT false;
-- Propagação (rodar após a carga/validação):
--   UPDATE fornecedor_regime f SET regime=m.regime, opcao_simples=m.opcao_simples, opcao_mei=m.opcao_mei,
--          via_matriz=true, erro=NULL
--   FROM (SELECT DISTINCT ON (left(cnpj,8)) left(cnpj,8) raiz, regime, opcao_simples, opcao_mei
--         FROM fornecedor_regime
--         WHERE regime NOT IN ('Desconhecido') AND regime NOT LIKE 'Não optante%') m
--   WHERE left(f.cnpj,8)=m.raiz AND f.manual=false
--     AND (f.regime='Desconhecido' OR f.regime LIKE 'Não optante%');
*/
