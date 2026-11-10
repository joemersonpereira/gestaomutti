// 325 — Cria a empresa FAMPESA (terceirizada, CNPJ 05.622.666/0001-03). Joe 2026-11-10.
// A Fampesa emprega pessoal terceirizado que carrega premiação no CNPJ 05622666000103 (19 pessoas
// da carga de nov/2026). Ela precisa existir em DOIS lugares:
//   1) empresas_terceirizadas → vira "empresa de registro" do colaborador (termos de RH);
//   2) payx_conta            → aparece no seletor "Vínculo Pay X" e vira cabeçalho da carga.
// Idempotente: só insere se ainda não existir. produto/código da conta Pay X ficam em branco e são
// preenchidos sozinhos quando o Joe importar a carga da Fampesa (botão Importar IDs/vínculos).
const db = require('../connection');
const { v4: uuidv4 } = require('uuid');
const EMP = 'empresa-mutti-001';
const CNPJ = '05622666000103';
const CNPJ_FMT = '05.622.666/0001-03';
const NOME = 'FAMPESA';
console.log('▶ Migração 325 — empresa FAMPESA (terceirizada + conta Pay X)');

// 1) empresas_terceirizadas (casa por dígitos do CNPJ, pra não duplicar)
const jaTerc = db.prepare(
  "SELECT 1 FROM empresas_terceirizadas WHERE empresa_id=? AND replace(replace(replace(COALESCE(cnpj,''),'.',''),'/',''),'-','')=?"
).get(EMP, CNPJ);
if (jaTerc) {
  console.log('  = terceirizada FAMPESA já existe');
} else {
  db.prepare('INSERT INTO empresas_terceirizadas (id, empresa_id, nome, cnpj) VALUES (?,?,?,?)')
    .run(uuidv4(), EMP, NOME, CNPJ_FMT);
  console.log('  + terceirizada FAMPESA cadastrada (' + CNPJ_FMT + ')');
}

// 2) payx_conta (PK empresa_id+cnpj; não sobrescreve se a carga já tiver criado com produto/código)
const jaConta = db.prepare('SELECT 1 FROM payx_conta WHERE empresa_id=? AND cnpj=?').get(EMP, CNPJ);
if (jaConta) {
  console.log('  = conta Pay X FAMPESA já existe');
} else {
  db.prepare(`INSERT INTO payx_conta (empresa_id, cnpj, cnpj_fmt, empresa_nome, produto, codigo, taxa_adm)
              VALUES (?,?,?,?,?,?,?)`).run(EMP, CNPJ, CNPJ_FMT, NOME, '', '', 1.2);
  console.log('  + conta Pay X FAMPESA criada (produto/código entram na importação da carga)');
}
console.log('✓ Migração 325 concluída');
