// 041 — ciclo do Checklist de Limpeza (abrir/fechar por colaborador da limpeza)
const db = require('../connection');
console.log('▶ Migração 041 — limpeza_dia');
db.exec(`CREATE TABLE IF NOT EXISTS limpeza_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  data TEXT NOT NULL, modelo_id TEXT, aberto_em TEXT, fechado INTEGER DEFAULT 0, fechado_em TEXT,
  respostas_json TEXT, execucao_id TEXT,
  UNIQUE(empresa_id, loja_id, colaborador_id, data)
);`);
console.log('✓ Migração 041 concluída');
