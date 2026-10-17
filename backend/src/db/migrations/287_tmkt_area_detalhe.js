// 287_tmkt_area_detalhe.js — Área do Trade passa a ser detalhada: canal (onde fica vinculada:
// físico/e-commerce/CRM/endomarketing), tamanho (ex.: tabloide → tamanho da oferta), descrição
// longa, ordem, e MAIS DE UMA FOTO (tabela própria). Espaço ganha tamanho. Tudo idempotente.
const db = require('../connection');

const addCol = (tabela, coluna, ddl) => {
  try { db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
};

// Área: onde fica vinculada + como é detalhada
addCol('tmkt_areas', 'canal', 'canal TEXT');        // fisico | ecommerce | crm | endomarketing
addCol('tmkt_areas', 'tamanho', 'tamanho TEXT');     // dimensão/formato (ex.: "1/4 de página", "1,20m")
addCol('tmkt_areas', 'detalhe', 'detalhe TEXT');     // descrição livre do que é a área
addCol('tmkt_areas', 'ordem', 'ordem INTEGER DEFAULT 0');

// Espaço (item vendável dentro da área) também pode ter tamanho/formato próprio
addCol('tmkt_espacos', 'tamanho', 'tamanho TEXT');

// Mais de uma foto por área
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_area_fotos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  area_id TEXT NOT NULL,
  foto TEXT NOT NULL,
  legenda TEXT,
  ordem INTEGER DEFAULT 0,
  criado_em TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS ix_tmkt_area_fotos ON tmkt_area_fotos(area_id)');

console.log('✅ migration 287: tmkt_areas (canal/tamanho/detalhe/ordem) + tmkt_espacos.tamanho + tmkt_area_fotos');
