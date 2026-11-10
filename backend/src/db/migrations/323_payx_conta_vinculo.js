// 323 — Vínculo Pay X do colaborador + contas Pay X por CNPJ.
// A carga de premiação é UM Excel por CNPJ (conta Pay X), e o colaborador pode pertencer a uma
// conta diferente da loja onde trabalha. `colaboradores.payx_cnpj` guarda a qual conta ele carrega;
// `payx_conta` guarda o cabeçalho exigido por conta (empresa, produto, código, taxa adm). As duas
// coisas são capturadas automaticamente ao importar as cargas preenchidas. Idempotente.
const db = require('../connection');
console.log('▶ Migração 323 — vínculo Pay X do colaborador + contas por CNPJ');
const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
if (!cols.includes('payx_cnpj')) {
  db.exec("ALTER TABLE colaboradores ADD COLUMN payx_cnpj TEXT DEFAULT ''");
  console.log('  + colaboradores.payx_cnpj (CNPJ só dígitos da conta Pay X)');
} else {
  console.log('  = colaboradores.payx_cnpj já existe');
}
db.exec(`
CREATE TABLE IF NOT EXISTS payx_conta (
  empresa_id TEXT NOT NULL,
  cnpj TEXT NOT NULL,            -- só dígitos (chave)
  cnpj_fmt TEXT,                 -- formatado p/ exibir na carga
  empresa_nome TEXT,
  produto TEXT,
  codigo TEXT,
  taxa_adm REAL DEFAULT 1.2,
  PRIMARY KEY (empresa_id, cnpj)
);
`);
console.log('✓ Migração 323 concluída (colaboradores.payx_cnpj, payx_conta).');
