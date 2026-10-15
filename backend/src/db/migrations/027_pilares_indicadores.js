// 027 — pilares e indicadores do gerente viram cadastráveis (tabelas + seed)
const db = require('../connection');
const { DEFAULT_PILARES } = require('../../lib/pilaresSeed');
console.log('▶ Migração 027 — pilares & indicadores cadastráveis');
db.exec(`CREATE TABLE IF NOT EXISTS pilares (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
  cor TEXT, peso INTEGER DEFAULT 0, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
db.exec(`CREATE TABLE IF NOT EXISTS indicadores_def (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, pilar_id TEXT NOT NULL, nome TEXT NOT NULL,
  min INTEGER DEFAULT 0, fonte TEXT DEFAULT 'manual', acao TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
const empresaId = 'empresa-mutti-001';
const tem = db.prepare(`SELECT COUNT(*) c FROM pilares WHERE empresa_id=?`).get(empresaId).c;
if (!tem) {
  const insP = db.prepare(`INSERT INTO pilares (id,empresa_id,nome,cor,peso,ordem,ativo) VALUES (?,?,?,?,?,?,1)`);
  const insI = db.prepare(`INSERT INTO indicadores_def (id,empresa_id,pilar_id,nome,min,fonte,acao,ordem,ativo) VALUES (?,?,?,?,?,?,?,?,1)`);
  DEFAULT_PILARES.forEach((p, pi) => {
    insP.run(p.id, empresaId, p.nome, p.cor, p.peso, pi);
    p.indicadores.forEach((ind, ii) => insI.run(ind.id, empresaId, p.id, ind.nome, ind.min, ind.fonte, ind.acao, ii));
  });
  console.log('  + pilares/indicadores semeados');
}
console.log('✓ Migração 027 concluída');
