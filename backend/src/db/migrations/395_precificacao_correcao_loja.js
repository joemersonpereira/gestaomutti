// 395 — Correção de precificação agora é por PRODUTO + LOJA (uni). Antes era só por produto (a correção
// num produto valia pra rede toda, mas o preço errado é por loja). Recria a tabela com `uni` na chave.
// Idempotente: só recria se ainda não tiver a coluna `uni`. Linhas antigas viram uni=0 = "todas as lojas".
module.exports = function (db) {
  const cols = db.prepare("PRAGMA table_info(precificacao_correcao)").all().map(c => c.name);
  if (cols.includes('uni')) return;
  db.exec(`
    CREATE TABLE precificacao_correcao_new (
      empresa_id TEXT NOT NULL, tipo TEXT NOT NULL, produto_id INTEGER NOT NULL, uni INTEGER NOT NULL DEFAULT 0,
      corrigido_por TEXT, corrigido_em TEXT DEFAULT (datetime('now')), obs TEXT,
      PRIMARY KEY (empresa_id, tipo, produto_id, uni));
    INSERT INTO precificacao_correcao_new (empresa_id, tipo, produto_id, uni, corrigido_por, corrigido_em, obs)
      SELECT empresa_id, tipo, produto_id, 0, corrigido_por, corrigido_em, obs FROM precificacao_correcao;
    DROP TABLE precificacao_correcao;
    ALTER TABLE precificacao_correcao_new RENAME TO precificacao_correcao;
  `);
};

/* === Caminho técnico v2.0 (Postgres) ===
ALTER TABLE precificacao_correcao ADD COLUMN IF NOT EXISTS uni bigint NOT NULL DEFAULT 0;
-- recriar a PK: DROP CONSTRAINT antiga, ADD PRIMARY KEY (empresa_id, tipo, produto_id, uni).
-- uni=0 = correção aplicada a TODAS as lojas (legado). Novas correções carregam a unidadenegocio da loja.
*/
