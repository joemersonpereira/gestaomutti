// 034 — avaliação do caixa/conferente via checklist de conduta
const db = require('../connection');
const { v4: uuidv4 } = require('uuid');
const { CONDUTA_ITENS } = require('../../lib/avaliacaoAdminModeloSeed');
console.log('▶ Migração 034 — avaliacao_conduta_modelo + itens + nota_pct');
db.exec(`CREATE TABLE IF NOT EXISTS avaliacao_conduta_modelo (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, funcao_id TEXT NOT NULL, texto TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
db.exec(`CREATE TABLE IF NOT EXISTS avaliacao_admin_itens (
  id TEXT PRIMARY KEY, avaliacao_id TEXT NOT NULL, texto TEXT NOT NULL, nota TEXT
);`);
const cols = db.prepare(`PRAGMA table_info(avaliacao_admin)`).all().map(c => c.name);
if (!cols.includes('nota_pct')) db.exec(`ALTER TABLE avaliacao_admin ADD COLUMN nota_pct INTEGER`);
const empresaId = 'empresa-mutti-001';
const tem = db.prepare(`SELECT COUNT(*) c FROM avaliacao_conduta_modelo WHERE empresa_id=?`).get(empresaId).c;
if (!tem) {
  const ins = db.prepare(`INSERT INTO avaliacao_conduta_modelo (id,empresa_id,funcao_id,texto,ordem,ativo) VALUES (?,?,?,?,?,1)`);
  Object.entries(CONDUTA_ITENS).forEach(([fid, itens]) => itens.forEach((t, i) => ins.run(uuidv4(), empresaId, fid, t, i)));
  console.log('  + itens de conduta semeados');
}
console.log('✓ Migração 034 concluída');
