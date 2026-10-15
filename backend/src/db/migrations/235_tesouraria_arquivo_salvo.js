// 235_tesouraria_arquivo_salvo.js — guarda o caminho em que a despesa foi salva na pasta organizada
// (Controle de Caixa/<ano>/<loja>/<N - Mês>/). Idempotente (ALTER protegido).
const db = require('../connection');
const cols = db.prepare(`PRAGMA table_info(tesouraria_anexo)`).all().map(c => c.name);
if (!cols.includes('arquivo_salvo')) db.exec(`ALTER TABLE tesouraria_anexo ADD COLUMN arquivo_salvo TEXT`);
console.log('✅ migration 235: tesouraria_anexo.arquivo_salvo');
