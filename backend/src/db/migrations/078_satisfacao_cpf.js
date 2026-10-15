// 078 — Validação da avaliação de satisfação por CPF (anti-fraude).
// Agora o cliente informa o CPF; o sistema cruza com o ERP e só aceita a avaliação
// se aquele CPF teve compra no dia naquela loja. Também guarda o vendedor da venda
// (quando único) e evita 2 avaliações do mesmo CPF na mesma loja no mesmo dia.
const db = require('../connection');
console.log('▶ Migração 078 — satisfação validada por CPF');
const cols = db.prepare('PRAGMA table_info(satisfacao_avaliacoes)').all().map(c => c.name);
const add = (nome, ddl) => { if (!cols.includes(nome)) { db.exec(`ALTER TABLE satisfacao_avaliacoes ADD COLUMN ${ddl}`); console.log('  +', nome); } };
add('cpf', 'cpf TEXT');                    // CPF (11 dígitos) que avaliou
add('validado', 'validado INTEGER DEFAULT 1'); // 1 = compra confirmada no ERP
add('vendedor_erp', 'vendedor_erp INTEGER');   // usuario.id do vendedor (se único na venda)
add('vendedor_nome', 'vendedor_nome TEXT');
add('vendas_dia', 'vendas_dia INTEGER');       // qtd de vendas do CPF no dia (auditoria)
db.exec(`CREATE INDEX IF NOT EXISTS idx_satis_cpf_dia ON satisfacao_avaliacoes(loja_id, cpf, criado_em)`);
console.log('✓ Migração 078 concluída.');
