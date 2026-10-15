// 038 — comentários internos (canal do apoio) + "ciente" na assinatura
const db = require('../connection');
console.log('▶ Migração 038 — comentário interno + ciente');
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
if (!cols('tarefa_comentarios').includes('interno')) db.exec(`ALTER TABLE tarefa_comentarios ADD COLUMN interno INTEGER DEFAULT 0`);
if (!cols('tarefa_anexos').includes('assinatura_ciente')) db.exec(`ALTER TABLE tarefa_anexos ADD COLUMN assinatura_ciente INTEGER DEFAULT 0`);
console.log('✓ Migração 038 concluída');
