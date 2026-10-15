// 060 — estrutura organizacional: novas funções (áreas) + setor central em departamento
const db = require('../connection');
console.log('▶ Migração 060 — estrutura organizacional');

const NOVAS = [
  ['func-financeiro', 'Financeiro', 1],
  ['func-controladoria', 'Controladoria', 1],
  ['func-compras-beleza', 'Comprador Beleza', 1],
  ['func-compras-bemestar', 'Comprador Bem-estar', 1],
  ['func-devolucao', 'Devolução', 1],
  ['func-atendimento-online', 'Atendimento Online', 0],
  ['func-operador-loja', 'Operador de Loja', 0],
  ['func-promotor', 'Promotor de Vendas', 0],
  ['func-entregador', 'Entregador', 0],
  ['func-ouvidoria', 'Ouvidoria', 1],
];
const empresas = db.prepare(`SELECT id FROM empresas`).all();
const insF = db.prepare(`INSERT OR IGNORE INTO funcoes (id,empresa_id,nome,tem_checklist,tem_avaliacao,tem_meta,ativa,escritorio) VALUES (?,?,?,0,0,0,1,?)`);
empresas.forEach(e => NOVAS.forEach(([id, nome, esc]) => insF.run(id, e.id, nome, esc)));
console.log(`  ${NOVAS.length} funções garantidas em ${empresas.length} empresa(s)`);

// Realinha departamento = setor central de cada função
const SETOR = {
  'func-diretor': 'Direção', 'func-gestor': 'Direção', 'func-supervisor': 'Supervisão',
  'func-gerente': 'Operação', 'func-subgerente': 'Operação', 'func-vendedor': 'Operação', 'func-caixa': 'Operação',
  'func-conferente': 'Operação', 'func-farmaceutico': 'Operação', 'func-estagiario': 'Operação', 'func-limpeza': 'Operação',
  'func-atendimento-online': 'Operação', 'func-operador-loja': 'Operação', 'func-promotor': 'Operação', 'func-entregador': 'Operação',
  'func-rh': 'Gente & Gestão',
  'func-marketing': 'Comercial', 'func-comercial': 'Comercial', 'func-compras-beleza': 'Comercial', 'func-compras-bemestar': 'Comercial',
  'func-suporte': 'Suporte', 'func-devolucao': 'Suporte',
  'func-tesouraria': 'Administrativo', 'func-financeiro': 'Administrativo', 'func-controladoria': 'Administrativo',
  'func-ouvidoria': 'Ouvidoria',
};
const upd = db.prepare(`UPDATE colaboradores SET departamento=? WHERE funcao_id=? AND (departamento IS NULL OR departamento IN ('Atendimento','Manutenção','Tesouraria','Marketing','Comercial Financeiro','Gente & Gestão'))`);
let n = 0;
Object.entries(SETOR).forEach(([fid, setor]) => { const r = upd.run(setor, fid); n += r.changes; });
console.log(`  ${n} colaborador(es) realinhados ao setor`);

console.log('✓ Migração 060 concluída');
