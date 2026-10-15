// 211_estagio_documento.js — anexos (documentos) do estagiário na ficha. Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS estagio_documento (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, ficha_id TEXT NOT NULL,
  nome TEXT, tipo TEXT, dados TEXT,            -- dados = data URL base64 (como atestados/foto)
  criado_em TEXT DEFAULT (datetime('now'))
)`);
console.log('✅ migration 211: estagio_documento criada');
