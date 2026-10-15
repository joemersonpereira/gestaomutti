// 074 — Pesquisa de satisfação do cliente (avaliação da loja por QR code).
// Alimenta o indicador do gerente "nps" (pilar Performance). O cliente escaneia o
// QR da loja e dá uma nota de 1 a 5 (+ comentário opcional), sem login.
const db = require('../connection');
console.log('▶ Migração 074 — tabela satisfacao_avaliacoes');
db.exec(`
  CREATE TABLE IF NOT EXISTS satisfacao_avaliacoes (
    id TEXT PRIMARY KEY,
    empresa_id TEXT,
    loja_id TEXT NOT NULL,
    nota INTEGER NOT NULL,            -- 1 a 5
    comentario TEXT,
    ip TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_satisfacao_loja ON satisfacao_avaliacoes(loja_id, criado_em);`);
console.log('✓ Migração 074 concluída.');
