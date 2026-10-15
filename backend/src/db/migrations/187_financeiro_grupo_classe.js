// 187_financeiro_grupo_classe.js — classifica cada grupo de despesa (nível 2 do plano de contas)
// como 'variavel' ou 'fixa', por empresa. Usado na Eficiência de loja (DRE gerencial). Sem classe = fixa.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS financeiro_grupo_classe (
  empresa_id TEXT NOT NULL,
  grupo TEXT NOT NULL,
  classe TEXT NOT NULL DEFAULT 'fixa',
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, grupo)
)`);
console.log('✅ migration 187: financeiro_grupo_classe criada');
