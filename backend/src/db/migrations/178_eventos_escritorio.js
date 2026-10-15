// 178_eventos_escritorio.js — evento da agenda da Comunidade com visão SÓ ESCRITÓRIO.
// Usado pela feira (previsão de verba) e por qualquer evento interno do escritório.
const db = require('../connection');
const cols = db.prepare("PRAGMA table_info(mural_eventos)").all().map(c => c.name);
if (!cols.includes('escritorio')) {
  db.exec("ALTER TABLE mural_eventos ADD COLUMN escritorio INTEGER DEFAULT 0");
  console.log('✅ migration 178: mural_eventos.escritorio adicionada');
} else {
  console.log('• migration 178: escritorio já existe');
}
