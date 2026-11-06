// 314_estagio_seguro_sura.js — cadastra a APÓLICE VIGENTE do seguro de estágio (Seguros SURA),
// extraída do PDF da apólice, pra (1) aparecer no cadastro de Seguros e (2) o contrato do estagiário
// já sair com a seguradora/apólice no placeholder {{seguro}}. Idempotente: id fixo + INSERT OR IGNORE
// (não sobrescreve se já existir). Vincula as fichas ainda sem seguro a esta apólice.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
const ID = 'seg-sura-70820385';

db.prepare(`INSERT OR IGNORE INTO estagio_seguro
    (id, empresa_id, seguradora, apolice, vigencia_ini, vigencia_fim, valor, cobertura, ativo)
  VALUES (?,?,?,?,?,?,?,?,1)`).run(
  ID, EMP, 'Seguros SURA S.A.', '70.820.385', '2026-10-01', '2027-10-01', 1.85,
  'Acidentes Pessoais Coletivo (Plano 1 · Opção 1) — Morte acidental R$ 10.000 · Invalidez por acidente (IPA) R$ 10.000 · Auxílio funeral R$ 7.000 · Capitalização R$ 5.000 (1 sorteio/mês). Estagiários 14–70 anos, custeio 100% pela empresa. Estipulante Wehubb Soluções Digitais; corretora Oeste.');

// vincula as fichas que ainda não têm seguro a esta apólice (pra o {{seguro}} do contrato já sair preenchido)
const r = db.prepare(`UPDATE estagio_ficha SET seguro_id=? WHERE empresa_id=? AND (seguro_id IS NULL OR seguro_id='')`).run(ID, EMP);
console.log('✅ migration 314: apólice SURA 70.820.385 cadastrada' + (r.changes ? ` · ${r.changes} ficha(s) vinculada(s)` : ''));
