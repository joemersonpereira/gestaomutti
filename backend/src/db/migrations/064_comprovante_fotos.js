// 064 — comprovante de campanha com fotos tiradas na hora (IP + horário + rótulo).
// Idempotente: adiciona a coluna comprovante_json em campanhas_lojas se faltar.
const db = require('../connection');
console.log('▶ Migração 064 — comprovante de campanha com fotos');

try {
  db.exec(`ALTER TABLE campanhas_lojas ADD COLUMN comprovante_json TEXT`);
  console.log('  coluna comprovante_json adicionada');
} catch (e) {
  console.log('  coluna comprovante_json já existe (ok)');
}

console.log('✓ Migracao 064 concluida');
