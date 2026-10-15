// 172_compras_alerta_classificacao.js — adiciona a classificação do produto na lista de itens do alerta.
const db = require('../connection');

const cols = db.prepare("PRAGMA table_info(compras_alerta_itens)").all().map(c => c.name);
if (!cols.includes('classificacao')) {
  db.exec("ALTER TABLE compras_alerta_itens ADD COLUMN classificacao TEXT");
  console.log('✅ migration 172: coluna classificacao adicionada em compras_alerta_itens');
} else {
  console.log('• migration 172: coluna classificacao já existe');
}
