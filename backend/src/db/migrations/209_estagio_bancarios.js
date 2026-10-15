// 209_estagio_bancarios.js — dados bancários na ficha do estagiário (+ PIX) e msg do banco. Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
for (const col of ['banco', 'agencia', 'conta', 'tipo_conta', 'pix', 'dados_bancarios_em']) {
  try { db.exec(`ALTER TABLE estagio_ficha ADD COLUMN ${col} TEXT`); } catch (e) { /* já existe */ }
}
db.prepare(`INSERT OR IGNORE INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))`)
  .run(EMP, 'estagio_banco_msg', 'Preferencialmente conta no Banco do Brasil. Enquanto não tiver os dados bancários, informe uma chave PIX.');
console.log('✅ migration 209: campos bancários na estagio_ficha');
