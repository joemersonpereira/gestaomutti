// 202_pontorep_motivos_justificativas.js — flags nos motivos de afastamento (abona/falta/absenteísmo/
// habilitar gestores/colaboradores) + catálogo de Justificativas de Atraso. Idempotente.
const db = require('../connection');
const { v4: uuid } = require('uuid');
const EMP = 'empresa-mutti-001';

for (const col of ['abona INTEGER DEFAULT 1', 'conta_falta INTEGER DEFAULT 0', 'absenteismo INTEGER DEFAULT 0',
  'hab_gestores INTEGER DEFAULT 1', 'hab_colaboradores INTEGER DEFAULT 0']) {
  try { db.exec(`ALTER TABLE pontorep_afastamento_motivo ADD COLUMN ${col}`); } catch (e) { /* já existe */ }
}

db.exec(`CREATE TABLE IF NOT EXISTS pontorep_justificativa_atraso (
  id                 TEXT PRIMARY KEY,
  empresa_id         TEXT NOT NULL,
  descricao          TEXT NOT NULL,
  anexo_obrigatorio  INTEGER DEFAULT 0,
  obs_obrigatoria    INTEGER DEFAULT 0,
  hab_gestores       INTEGER DEFAULT 1,
  hab_colaboradores  INTEGER DEFAULT 1,
  ativo              INTEGER DEFAULT 1,
  criado_em          TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, descricao)
)`);

// Seed de justificativas de atraso comuns
const JUS = [
  ['Esquecimento', 0, 1, 1, 1],
  ['Sistema Indisponível', 0, 1, 1, 1],
  ['Trânsito / transporte', 0, 1, 1, 1],
  ['Consulta médica', 1, 1, 1, 1],
  ['Outros', 0, 1, 1, 1],
];
const ins = db.prepare(`INSERT OR IGNORE INTO pontorep_justificativa_atraso (id,empresa_id,descricao,anexo_obrigatorio,obs_obrigatoria,hab_gestores,hab_colaboradores,ativo)
  VALUES (?,?,?,?,?,?,?,1)`);
JUS.forEach(j => ins.run(uuid(), EMP, j[0], j[1], j[2], j[3], j[4]));

console.log('✅ migration 202: flags nos motivos + pontorep_justificativa_atraso (', db.prepare('SELECT COUNT(*) n FROM pontorep_justificativa_atraso').get().n, 'justificativas)');
