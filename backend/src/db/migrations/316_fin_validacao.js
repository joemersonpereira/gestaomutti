// 316_fin_validacao.js — Painel único de VALIDAÇÃO FINANCEIRA. Guarda, por item de origem
// (Trade/Devolução/…), o comprovante anexado e a confirmação do Financeiro. As pendências em si
// são lidas AO VIVO de cada módulo (agregador extensível); esta tabela só guarda comprovante +
// quem/quando confirmou, sem mexer no schema dos módulos.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS fin_validacao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  origem TEXT NOT NULL, ref_id TEXT NOT NULL,
  status TEXT DEFAULT 'pendente',                 -- pendente | confirmado
  comprovante TEXT, comprovante_mime TEXT, comprovante_nome TEXT, comprovante_por TEXT, comprovante_em TEXT,
  confirmado_por TEXT, confirmado_em TEXT, valor_confirmado REAL, obs TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, origem, ref_id)
)`);
console.log('✅ migration 316: fin_validacao');
