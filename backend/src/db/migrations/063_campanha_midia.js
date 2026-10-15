// 063 — anexos de mídia (PDF/imagem/vídeo/áudio) nas campanhas de marketing.
// Idempotente: adiciona a coluna midia_json se ainda não existir.
const db = require('../connection');
console.log('▶ Migração 063 — anexos de mídia nas campanhas');

try {
  db.exec(`ALTER TABLE campanhas ADD COLUMN midia_json TEXT`);
  console.log('  coluna midia_json adicionada');
} catch (e) {
  console.log('  coluna midia_json já existe (ok)');
}

console.log('✓ Migracao 063 concluida');
