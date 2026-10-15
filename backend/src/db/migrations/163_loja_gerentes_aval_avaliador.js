// 163 — (a) gerente/subgerente no cadastro da loja; (b) avaliação T&D passa a ser única
// por (colaborador, trimestre, ano, AVALIADOR) — gerente e subgerente avaliam cada um a sua.
const db = require('../connection');
for (const c of ['gerente_id', 'subgerente_id']) {
  try { db.exec(`ALTER TABLE lojas ADD COLUMN ${c} TEXT`); } catch { /* já existe */ }
}
// Recria td_avaliacao com a unique por avaliador (preserva dados existentes, se houver).
const jaTem = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='td_avaliacao'").get();
if (jaTem && !/avaliador_id\)/.test(jaTem.sql)) {
  db.exec(`
    CREATE TABLE td_avaliacao_new (
      id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
      trimestre INTEGER NOT NULL, ano INTEGER NOT NULL, avaliador_id TEXT, avaliador_nome TEXT,
      status TEXT DEFAULT 'rascunho', pontos_fortes TEXT, a_desenvolver TEXT, comentario TEXT,
      criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT,
      UNIQUE(colaborador_id, trimestre, ano, avaliador_id)
    );
    INSERT INTO td_avaliacao_new SELECT id,empresa_id,colaborador_id,trimestre,ano,avaliador_id,avaliador_nome,status,pontos_fortes,a_desenvolver,comentario,criado_em,atualizado_em FROM td_avaliacao;
    DROP TABLE td_avaliacao;
    ALTER TABLE td_avaliacao_new RENAME TO td_avaliacao;
  `);
  console.log('   td_avaliacao recriada com UNIQUE por avaliador.');
}
console.log('✅ migration 163: loja gerente/subgerente + avaliação T&D por avaliador');
