// 270_tmkt_plano_cotas.js — cotas por NÍVEL do plano (Joe 2026-10-16):
// um plano pode ter cotas Ouro/Prata/Bronze, cada uma com seu VALOR, sua QUANTIDADE de cotas
// e suas POSIÇÕES amarradas. tmkt_plano_espacos.cota_id diz a qual cota a posição pertence
// (NULL = comum a todas as cotas). Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_plano_cotas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, plano_id TEXT NOT NULL,
  nome TEXT NOT NULL,            -- Ouro | Prata | Bronze | …
  preco REAL,                    -- investimento da cota
  quantidade INTEGER DEFAULT 1,  -- quantas cotas desse nível existem
  cor TEXT, ordem INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_plano_cotas ON tmkt_plano_cotas(empresa_id, plano_id)`);
try { db.exec(`ALTER TABLE tmkt_plano_espacos ADD COLUMN cota_id TEXT`); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
console.log('✅ migration 270: tmkt_plano_cotas (Ouro/Prata/Bronze) + plano_espacos.cota_id');
