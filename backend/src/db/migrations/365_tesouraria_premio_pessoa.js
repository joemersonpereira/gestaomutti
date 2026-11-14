// 365 — Faixas do prêmio da Tesouraria por pessoa (Joe 2026-11-11).
// Cada pilar paga R$ (teto configurável em tesouraria_config 'premio_pilar_valor', padrão 100) proporcional
// à nota; 100% paga teto + 50% (superação, pois a nota não passa de 100). O valor é o do CHEFE (fator 1);
// cada pessoa vinculada recebe premioTotalChefe × fator (ex.: estagiária 0,5 = metade). Cada um vê o seu
// na "Minha área". Vínculo por colaborador_id (= id do usuário logado), configurado na aba Metas.
//
// ── Caminho técnico v2.0 (Postgres) ──
// CREATE TABLE tesouraria_premio_pessoa (empresa_id text, colaborador_id text, fator numeric DEFAULT 1,
//   ativo smallint DEFAULT 1, criado_em timestamptz DEFAULT now(), PRIMARY KEY (empresa_id, colaborador_id));
const db = require('../connection');
console.log('▶ Migração 365 — tesouraria_premio_pessoa (faixas do prêmio por pessoa)');
db.exec(`CREATE TABLE IF NOT EXISTS tesouraria_premio_pessoa (
  empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, fator REAL DEFAULT 1,
  ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, colaborador_id)
)`);
console.log('✓ Migração 365 concluída (tesouraria_premio_pessoa)');
