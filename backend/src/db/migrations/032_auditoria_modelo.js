// 032 — itens do Checklist de Supervisão viram cadastráveis
const db = require('../connection');
const { v4: uuidv4 } = require('uuid');
const { AUDITORIA_ITENS } = require('../../lib/auditoriaModeloSeed');
console.log('▶ Migração 032 — auditoria_modelo_itens');
db.exec(`CREATE TABLE IF NOT EXISTS auditoria_modelo_itens (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, texto TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
const empresaId = 'empresa-mutti-001';
const tem = db.prepare(`SELECT COUNT(*) c FROM auditoria_modelo_itens WHERE empresa_id=?`).get(empresaId).c;
if (!tem) {
  const ins = db.prepare(`INSERT INTO auditoria_modelo_itens (id,empresa_id,texto,ordem,ativo) VALUES (?,?,?,?,1)`);
  AUDITORIA_ITENS.forEach((t, i) => ins.run(uuidv4(), empresaId, t, i));
  console.log('  + itens semeados');
}
console.log('✓ Migração 032 concluída');
