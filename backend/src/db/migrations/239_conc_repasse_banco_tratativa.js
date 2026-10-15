// 239_conc_repasse_banco_tratativa.js — validação humana do "caiu o lote?" na conciliação bancária.
// Os lotes de repasse que o sistema não consegue cruzar com o extrato do Alpha ficam PENDENTES;
// aqui a Tesouraria confirma à mão que caiu (ou ignora). Chave = data|loja_id|operadora. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS conc_repasse_banco_tratativa (
  empresa_id TEXT NOT NULL,
  chave TEXT NOT NULL,                 -- data|loja_id|operadora (identifica o lote)
  status TEXT NOT NULL,                -- 'confirmado' (caiu, validado à mão) | 'ignorado'
  valor REAL,
  obs TEXT,
  usuario_id TEXT,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, chave)
)`);
console.log('✅ migration 239: conc_repasse_banco_tratativa');
