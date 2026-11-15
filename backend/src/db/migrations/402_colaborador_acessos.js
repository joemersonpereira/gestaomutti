// 402 — Acessos de módulo POR COLABORADOR (além do override por função que já existe em acessos.js).
// Joe (2026-11-14): no cadastro do colaborador, poder selecionar os MENUS (módulos do escritório) que
// aquela PESSOA terá acesso — porque duas pessoas da mesma função podem precisar de menus diferentes.
// Guarda só os DESVIOS da pessoa: permitido=1 libera, permitido=0 bloqueia; sem linha = usa o override
// da função (e, na falta deste, o padrão do código). O merge (pessoa vence função) é feito no /acessos/meus.
// Idempotente.
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS colaborador_acessos (
    empresa_id    TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    modulo_id     TEXT NOT NULL,
    permitido     INTEGER NOT NULL,          -- 1 = libera, 0 = bloqueia
    atualizado_em TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (colaborador_id, modulo_id)
  )`).run();
  db.prepare('CREATE INDEX IF NOT EXISTS ix_colab_acessos_emp ON colaborador_acessos(empresa_id, colaborador_id)').run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS colaborador_acessos (
  empresa_id     text NOT NULL,
  colaborador_id text NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  modulo_id      text NOT NULL,
  permitido      boolean NOT NULL,          -- true = libera, false = bloqueia
  atualizado_em  timestamptz DEFAULT now(),
  PRIMARY KEY (colaborador_id, modulo_id)
);
CREATE INDEX IF NOT EXISTS ix_colab_acessos_emp ON colaborador_acessos(empresa_id, colaborador_id);

-- /acessos/meus (menus do usuário logado) = override da FUNÇÃO ⊕ override do COLABORADOR (pessoa vence):
--   SELECT modulo_id, permitido FROM colaborador_acessos WHERE colaborador_id = $usuario_id;
--   aplica por cima do mapa da função (acessos_modulos em configuracoes).
-- Travas de segurança continuam no app (podeVer): Diretor Geral vê tudo; núcleo nunca some;
-- Gestor Geral nunca perde Parâmetros/Acessos. Por isso um bloqueio por pessoa nesses casos é inócuo.
*/
