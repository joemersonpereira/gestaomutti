// 092 — Meu Mercado: fornecedor no produto (visão do comprador) + loja de pontos
// (brinde resgatável por pontos da gamificação) e registro de resgates.
const db = require('../connection');
console.log('▶ Migração 092 — Mercado: fornecedor + loja de pontos');
const cols = db.prepare("PRAGMA table_info(mercado_produtos)").all().map(c => c.name);
const add = (nome, ddl) => { if (!cols.includes(nome)) { db.exec(`ALTER TABLE mercado_produtos ADD COLUMN ${ddl}`); console.log('  + mercado_produtos.' + nome); } };
add('fornecedor', 'fornecedor TEXT');       // visão do comprador (SULTS-like)
add('imagem', 'imagem TEXT');               // url/emoji opcional
add('resgatavel', 'resgatavel INTEGER DEFAULT 0'); // brinde aparece na loja de pontos
add('pontos', 'pontos INTEGER DEFAULT 0');  // custo em pontos p/ resgate

db.exec(`
CREATE TABLE IF NOT EXISTS pontos_resgates (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  colaborador_nome TEXT,
  loja_id TEXT,
  produto_id TEXT NOT NULL,
  produto_nome TEXT,
  pontos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'solicitado', -- solicitado | separado | entregue | cancelado
  criado_em TEXT DEFAULT (datetime('now')),
  atendido_por TEXT,
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_resg_colab ON pontos_resgates(empresa_id, colaborador_id);
CREATE INDEX IF NOT EXISTS idx_resg_status ON pontos_resgates(empresa_id, status);
`);
console.log('✓ Migração 092 concluída.');
