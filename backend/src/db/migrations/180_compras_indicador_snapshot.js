// 180_compras_indicador_snapshot.js — foto MENSAL dos indicadores "do momento" por comprador
// (ruptura, cobertura, excesso, estoque, vencendo, conversão). Como esses indicadores são posição
// atual do estoque, não dá p/ reconstruir o passado do ERP — então guardamos a foto de cada mês
// (a última captura do mês vira o valor daquele mês) p/ avaliar se o comprador bateu a meta.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS compras_indicador_snapshot (
  empresa_id     TEXT,
  comprador_id   TEXT,
  ano            INTEGER,
  mes            INTEGER,
  ruptura        REAL,
  cobertura      INTEGER,
  excesso        INTEGER,
  estoque        INTEGER,
  vencidos_valor INTEGER,
  vencidos_itens INTEGER,
  conversao_novos REAL,
  capturado_em   TEXT,
  PRIMARY KEY (empresa_id, comprador_id, ano, mes)
)`);
console.log('✅ migration 180: compras_indicador_snapshot criada');
