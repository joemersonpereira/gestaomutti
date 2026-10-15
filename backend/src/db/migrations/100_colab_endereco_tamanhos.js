// 100 — Endereço completo + tamanhos de fardamento do colaborador (calçado, blusa,
// calça, jaleco) — úteis para entrega de fardamento (Meu Mercado).
const db = require('../connection');
console.log('▶ Migração 100 — Endereço completo + tamanhos de fardamento');
const addCol = (nome, ddl) => {
  const cols = db.prepare(`PRAGMA table_info(colaboradores)`).all().map(c => c.name);
  if (!cols.includes(nome)) { db.exec(`ALTER TABLE colaboradores ADD COLUMN ${ddl}`); console.log('  + colaboradores.' + nome); }
};
// Endereço (o campo `endereco` já existe = logradouro/rua)
addCol('cep', 'cep TEXT');
addCol('endereco_numero', 'endereco_numero TEXT');
addCol('complemento', 'complemento TEXT');
addCol('bairro', 'bairro TEXT');
addCol('cidade', 'cidade TEXT');
addCol('uf', 'uf TEXT');
// Tamanhos de fardamento
addCol('num_calcado', 'num_calcado TEXT');
addCol('tam_blusa', 'tam_blusa TEXT');
addCol('tam_calca', 'tam_calca TEXT');
addCol('tam_jaleco', 'tam_jaleco TEXT');
console.log('✓ Migração 100 concluída.');
