// 036 — responsável da pendência por seção/item do Checklist Diário (função alvo)
const db = require('../connection');
console.log('▶ Migração 036 — responsável da pendência (seção/item)');
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
if (!cols('gerente_secoes').includes('responsavel_pendencia')) db.exec(`ALTER TABLE gerente_secoes ADD COLUMN responsavel_pendencia TEXT`);
if (!cols('gerente_itens').includes('responsavel_pendencia')) db.exec(`ALTER TABLE gerente_itens ADD COLUMN responsavel_pendencia TEXT`);
console.log('✓ Migração 036 concluída');
