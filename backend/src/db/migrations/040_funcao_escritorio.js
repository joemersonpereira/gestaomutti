// 040 — marca escritório × atendimento na função
const db = require('../connection');
console.log('▶ Migração 040 — escritório/atendimento na função');
const cols = db.prepare(`PRAGMA table_info(funcoes)`).all().map(c => c.name);
if (!cols.includes('escritorio')) db.exec(`ALTER TABLE funcoes ADD COLUMN escritorio INTEGER DEFAULT 0`);
const escritorio = ['func-diretor', 'func-gestor', 'func-supervisor', 'func-gerente', 'func-rh', 'func-marketing', 'func-suporte', 'func-tesouraria', 'func-comercial'];
escritorio.forEach(id => db.prepare(`UPDATE funcoes SET escritorio=1 WHERE id=?`).run(id));
console.log('✓ Migração 040 concluída');
