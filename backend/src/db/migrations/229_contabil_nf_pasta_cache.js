// 229_contabil_nf_pasta_cache.js — cache da leitura dos PDFs da pasta de NFs.
// Guarda o que já foi lido (texto ou OCR) por arquivo, pra não reprocessar a pasta inteira toda vez.
// Chave: empresa + caminho. Revalida por tamanho+mtime do arquivo. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_nf_pasta_cache (
  empresa_id TEXT NOT NULL,
  caminho TEXT NOT NULL,
  arquivo TEXT,
  pasta TEXT,
  tamanho INTEGER,
  mtime INTEGER,
  eh_nf INTEGER DEFAULT 0,
  tem_texto INTEGER DEFAULT 0,
  via_ocr INTEGER DEFAULT 0,
  numero TEXT,
  cnpj TEXT,
  fornecedor TEXT,
  valor REAL,
  lido_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, caminho)
)`);
console.log('✅ migration 229: contabil_nf_pasta_cache');
