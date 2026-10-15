// 069 — Integração com o ERP (Postgres A7/Trier).
// Adiciona os vínculos entre o cadastro do Mutti e os IDs do ERP e semeia o
// mapa das lojas (loja Mutti -> unidadenegocioid do ERP). Idempotente.
const db = require('../connection');
console.log('▶ Migração 069 — Integração ERP (vínculos + mapa de lojas)');

// ALTER seguro: só adiciona a coluna se ainda não existir.
function addCol(tabela, coluna, tipo) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
  if (!cols.includes(coluna)) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    console.log(`  + ${tabela}.${coluna}`);
  } else {
    console.log(`  = ${tabela}.${coluna} já existe`);
  }
}

// Loja Mutti recebe o id da unidade de negócio do ERP.
addCol('lojas', 'erp_unidadenegocio_id', 'INTEGER');
// Colaborador recebe o vínculo com a pessoa/usuário do ERP (pessoa é a chave
// principal: um vendedor pode ter mais de um login/usuário no ERP).
addCol('colaboradores', 'erp_pessoa_id', 'INTEGER');
addCol('colaboradores', 'erp_usuario_id', 'INTEGER');
addCol('colaboradores', 'origem_erp', 'INTEGER'); // 1 = criado pela sincronização

db.exec(`CREATE INDEX IF NOT EXISTS idx_lojas_erp ON lojas(erp_unidadenegocio_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_colab_erp_pessoa ON colaboradores(erp_pessoa_id);`);

// Mapa oficial das lojas (validado no relatório mensal): loja Mutti -> unidadenegocioid.
const MAPA_LOJAS = {
  'loja-esplanada':      70423, // Mutti Esplanada
  'loja-rioreal':        70421, // Mutti Rio Real
  'loja-entrerioss1':    70424, // Mutti Entre Rios 1
  'loja-entrerios2':     70422, // Mutti Entre Rios 2
  'loja-ultraesplanada': 70420, // Ultra Esplanada
  'loja-ultraentrerios': 70417, // Ultra Entre Rios
  'loja-farmarocha':     70418, // Farma Rocha
  'loja-posto':          70419, // Posto de Medicamentos
};
const upd = db.prepare('UPDATE lojas SET erp_unidadenegocio_id = ? WHERE id = ?');
let mapeadas = 0;
for (const [lojaId, uni] of Object.entries(MAPA_LOJAS)) {
  const info = upd.run(uni, lojaId);
  mapeadas += info.changes;
}
console.log(`✓ ${mapeadas} loja(s) mapeada(s) para o ERP.`);
console.log('✓ Migração 069 concluída.');
