// 226_contabil_nf_contapagar.js — nota (de serviço, principalmente) anexada a um contas a pagar do
// ERP. Como o ERP é SÓ LEITURA, guardamos aqui o anexo + o que foi lido do PDF + a validade fiscal,
// ligados pelo ID do contapagar (texto). Serve pros casos que NÃO dão entrada no Alpha (NFS-e sem
// chave): a validação "tem nota" passa a valer pelo PDF, não pela entrada/chave do ERP. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_nf_contapagar (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, contapagar_id TEXT NOT NULL,
  anexo_nome TEXT, anexo_tipo TEXT, anexo_dados TEXT,
  nf_lida_numero TEXT, nf_lida_cnpj TEXT, nf_lida_valor REAL,
  validade_fiscal INTEGER DEFAULT 0,
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, contapagar_id)
)`);
console.log('✅ migration 226: contabil_nf_contapagar');
