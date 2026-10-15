// 228_contabil_fornecedor.js — marca por fornecedor (pessoa do ERP) se EMITE nota fiscal ou não.
// Ex.: sócio (retirada de sócio), pessoa física, imposto/DARF → não emitem NF, logo NÃO contam como
// "sem nota / perda fiscal" no BI. Chave = pessoa_id do ERP (texto). Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_fornecedor (
  empresa_id TEXT NOT NULL, pessoa_id TEXT NOT NULL,
  nome TEXT, cnpj TEXT,
  emite_nf INTEGER DEFAULT 1,     -- 1 = emite NF (padrão); 0 = não emite (sócio/PF/imposto…)
  motivo TEXT,                     -- ex.: 'Sócio (retirada)', 'Pessoa física', 'Imposto/DARF'
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, pessoa_id)
)`);
console.log('✅ migration 228: contabil_fornecedor');
