// 399 — Redes sociais do Marketing (Instagram/TikTok): conexão (token + conta) + histórico de métricas.
// Instagram usa a Graph API da Meta (Unified Login). No preview: cola token de longa duração + ID da conta;
// em produção: botão de login OAuth (precisa do app Meta + redirect público). Métricas viram meta no Meu Setor.
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS mkt_social_conta (
    empresa_id TEXT NOT NULL, rede TEXT NOT NULL,       -- instagram | tiktok
    conta_id TEXT, username TEXT, token TEXT,
    seguidores INTEGER, atualizado_em TEXT, erro TEXT,
    PRIMARY KEY (empresa_id, rede)
  )`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS mkt_social_metrica (
    id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, rede TEXT NOT NULL,
    data TEXT NOT NULL,                                 -- AAAA-MM-DD (snapshot do dia)
    seguidores INTEGER, alcance INTEGER, engajamento INTEGER,
    criado_em TEXT DEFAULT (datetime('now'))
  )`).run();
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS ux_mkt_social_met ON mkt_social_metrica(empresa_id, rede, data)').run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS mkt_social_conta (empresa_id text, rede text, conta_id text, username text, token text,
  seguidores int, atualizado_em timestamptz, erro text, PRIMARY KEY (empresa_id, rede));
CREATE TABLE IF NOT EXISTS mkt_social_metrica (id text PRIMARY KEY, empresa_id text, rede text, data date,
  seguidores int, alcance int, engajamento int, criado_em timestamptz DEFAULT now(),
  UNIQUE(empresa_id, rede, data));
-- Instagram Graph API: GET /{ig-user-id}?fields=username,followers_count  e  /{ig-user-id}/insights?metric=reach.
-- Indicador Meu Setor (Marketing): seguidores_instagram (maior) = último snapshot.
*/
