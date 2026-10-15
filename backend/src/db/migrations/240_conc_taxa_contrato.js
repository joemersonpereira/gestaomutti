// 240_conc_taxa_contrato.js — negociação de taxa com a credenciadora: validade (vigência) e o
// contrato/acordo anexado (PDF/foto) pra sustentar a cobrança quando o praticado fugir do combinado.
// Idempotente. Também dá validade-fim à taxa combinada (conc_taxa_contratada só tinha vigencia_ini).
const db = require('../connection');

// vigência-fim na taxa combinada (ALTER protegido)
try { db.exec(`ALTER TABLE conc_taxa_contratada ADD COLUMN vigencia_fim TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }

db.exec(`CREATE TABLE IF NOT EXISTS conc_taxa_contrato (
  empresa_id TEXT NOT NULL,
  operadora TEXT NOT NULL,
  loja_id TEXT NOT NULL DEFAULT '*',    -- '*' = acordo vale pra todas as filiais
  nome TEXT,                            -- nome do arquivo
  tipo_mime TEXT,
  dados TEXT,                           -- base64 do contrato (PDF/imagem)
  vigencia_ini TEXT,
  vigencia_fim TEXT,
  obs TEXT,
  usuario_id TEXT,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, operadora, loja_id)
)`);
console.log('✅ migration 240: conc_taxa_contrato (+ vigencia_fim)');
