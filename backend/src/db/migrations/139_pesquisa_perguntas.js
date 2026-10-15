// 139 — Perguntas (critérios) das pesquisas de avaliação. Cada pesquisa define as perguntas que
// o colaborador responde para cada setor / gerente (nota 1..5 por pergunta). Antes era só 1 nota por alvo.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS pesquisa_avaliacao_pergunta (
  id TEXT PRIMARY KEY,
  pesquisa_id TEXT NOT NULL,
  tipo TEXT NOT NULL,             -- setor | gerencia (a qual grupo de alvos a pergunta se aplica)
  texto TEXT NOT NULL,
  ordem INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pav_perg ON pesquisa_avaliacao_pergunta(pesquisa_id, tipo);
`);
// pergunta_id na resposta (a nota passa a ser por alvo+pergunta). Coluna nova, nullable p/ compatibilidade.
const cols = db.prepare(`PRAGMA table_info(pesquisa_avaliacao_resposta)`).all().map(c => c.name);
if (!cols.includes('pergunta_id')) db.exec(`ALTER TABLE pesquisa_avaliacao_resposta ADD COLUMN pergunta_id TEXT`);
console.log('✅ migration 139: pesquisa_avaliacao_pergunta + resposta.pergunta_id');
