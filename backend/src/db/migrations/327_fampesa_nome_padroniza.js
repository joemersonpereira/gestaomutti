// 327 — Padroniza o nome da terceirizada FAMPESA pelo nome da conta Pay X (Joe 2026-11-10).
// A migration 325 criou a terceirizada como "FAMPESA"; a conta Pay X veio "FAMPESA SOLUCOES LTDA"
// (capturada do cabeçalho da carga). Aqui alinhamos os dois usando a conta Pay X como fonte única.
// Idempotente: só atualiza se estiver diferente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
const CNPJ = '05622666000103';
console.log('▶ Migração 327 — padroniza nome da terceirizada FAMPESA');
const conta = db.prepare('SELECT empresa_nome FROM payx_conta WHERE empresa_id=? AND cnpj=?').get(EMP, CNPJ);
const nome = (conta && conta.empresa_nome && conta.empresa_nome.trim()) || 'FAMPESA SOLUCOES LTDA';
const r = db.prepare(`UPDATE empresas_terceirizadas SET nome=?
  WHERE empresa_id=?
    AND replace(replace(replace(COALESCE(cnpj,''),'.',''),'/',''),'-','')=?
    AND nome<>?`).run(nome, EMP, CNPJ, nome);
console.log(r.changes ? `  = nome ajustado para "${nome}"` : '  = já estava padronizado');
console.log('✓ Migração 327 concluída');
