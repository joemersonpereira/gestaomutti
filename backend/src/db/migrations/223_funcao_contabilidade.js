// 223_funcao_contabilidade.js — cria a função "Contabilidade" (acesso do contador, de escritório,
// read-only no financeiro/contabilidade) para poder ser atribuída a um colaborador. Idempotente.
const db = require('../connection');
const emps = db.prepare(`SELECT id FROM empresas`).all();
const ins = db.prepare(`INSERT OR IGNORE INTO funcoes (id,empresa_id,nome,tem_checklist,tem_avaliacao,tem_meta,ativa,escritorio) VALUES ('func-contabilidade',?,?,0,0,0,1,1)`);
emps.forEach(e => { try { ins.run(e.id, 'Contabilidade'); } catch (err) { /* ok */ } });
console.log('✅ migration 223: função Contabilidade');
