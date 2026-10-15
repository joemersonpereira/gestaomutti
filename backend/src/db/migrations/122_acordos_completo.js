// 122_acordos_completo.js — expande Acordos: dados básicos, condições ricas, lojas, pagamentos, assinaturas.
const db = require('../connection');
const add = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };

// Dados básicos extras
add('acordos', 'data_cadastro', 'TEXT');
add('acordos', 'template_contrato', 'TEXT');
add('acordos', 'url_contrato', 'TEXT');
add('acordos', 'apuracao', 'TEXT');           // data de emissão | data de entrada...

// Condições ricas
add('acordo_condicoes', 'dimensao', 'TEXT');    // fornecedor|fabricante|grupo_preco|grupo_pai|grupo_filho|produtos
add('acordo_condicoes', 'estrategia', 'TEXT');  // global | restricao
add('acordo_condicoes', 'escopo', 'TEXT');      // JSON: EANs/ids do escopo
add('acordo_condicoes', 'percentual', 'REAL');
add('acordo_condicoes', 'comissao_unitaria', 'REAL');
add('acordo_condicoes', 'apuracao', 'TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS acordo_lojas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, acordo_id TEXT NOT NULL,
  loja_id TEXT, loja_nome TEXT, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS acordo_pagamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, acordo_id TEXT NOT NULL,
  forma TEXT, data_vencimento TEXT, data_pagamento TEXT,
  valor REAL DEFAULT 0, valor_credito REAL DEFAULT 0, nf_ref TEXT, anexo_url TEXT,
  status TEXT DEFAULT 'previsto',  -- previsto | pago
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS acordo_assinaturas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, acordo_id TEXT NOT NULL,
  nome TEXT, papel TEXT, assinatura TEXT, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acordo_lojas ON acordo_lojas(acordo_id);
CREATE INDEX IF NOT EXISTS idx_acordo_pag ON acordo_pagamentos(acordo_id);
`);
console.log('✅ migration 122: acordos completo (lojas, pagamentos, assinaturas, condições ricas)');
