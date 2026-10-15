// 241_conc_banco_operadora_regra.js — regra por operadora na conferência bancária do repasse.
// Operadoras que NÃO caem no banco como crédito rastreável (factoring/antecipação: Le Card, etc.)
// são marcadas como 'ignorar' aqui e param de aparecer como pendência de validação humana.
// Idempotente. Sem valor fixo no código — é cadastro.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS conc_banco_operadora_regra (
  empresa_id TEXT NOT NULL,
  operadora TEXT NOT NULL,
  ignorar INTEGER NOT NULL DEFAULT 1,   -- 1 = não cobra pendência (factoring/antecipação)
  motivo TEXT,
  usuario_id TEXT,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, operadora)
)`);
console.log('✅ migration 241: conc_banco_operadora_regra');
