// 158 — Indicadores INDIVIDUAIS do escritório (por colaborador). A Direção/RH atribui
// metas por pessoa (às vezes o mesmo indicador só p/ alguns, às vezes diferente pra cada
// um) com prêmio em R$ OU pontos POR indicador; apuração mensal do realizado → batido.
const db = require('../connection');
db.exec(`
CREATE TABLE IF NOT EXISTS colab_indicadores (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  unidade TEXT,                       -- 'reais' | 'percentual' | 'unidades' | 'dias' | 'qtd' (rótulo)
  meta REAL DEFAULT 0,
  sentido TEXT DEFAULT 'maior',       -- 'maior' = bate quando realizado >= meta; 'menor' = quando <= meta
  premio_tipo TEXT DEFAULT 'reais',   -- 'reais' | 'pontos'
  premio_valor REAL DEFAULT 0,        -- R$ ou pontos ganhos quando bate a meta no mês
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_colabind_colab ON colab_indicadores(empresa_id, colaborador_id, ativo);

CREATE TABLE IF NOT EXISTS colab_indicador_apuracao (
  id TEXT PRIMARY KEY,
  colab_indicador_id TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  realizado REAL DEFAULT 0,
  apurado_por TEXT,
  apurado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(colab_indicador_id, mes, ano)
);
`);
console.log('✅ migration 158: colab_indicadores + colab_indicador_apuracao (indicadores individuais do escritório)');
