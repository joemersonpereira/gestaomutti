// 030 — seções/itens do Checklist Diário do gerente viram cadastráveis
const db = require('../connection');
const { v4: uuidv4 } = require('uuid');
const { SECOES_GERENTE } = require('../../lib/secoesGerenteSeed');
console.log('▶ Migração 030 — gerente_secoes/itens');
db.exec(`CREATE TABLE IF NOT EXISTS gerente_secoes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, peso INTEGER DEFAULT 0, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
db.exec(`CREATE TABLE IF NOT EXISTS gerente_itens (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, secao_id TEXT NOT NULL, nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
const empresaId = 'empresa-mutti-001';
const tem = db.prepare(`SELECT COUNT(*) c FROM gerente_secoes WHERE empresa_id=?`).get(empresaId).c;
if (!tem) {
  const insS = db.prepare(`INSERT INTO gerente_secoes (id,empresa_id,nome,peso,ordem,ativo) VALUES (?,?,?,?,?,1)`);
  const insI = db.prepare(`INSERT INTO gerente_itens (id,empresa_id,secao_id,nome,ordem,ativo) VALUES (?,?,?,?,?,1)`);
  SECOES_GERENTE.forEach((sec, si) => { const sid = uuidv4(); insS.run(sid, empresaId, sec.secao, sec.peso, si); sec.itens.forEach((it, ii) => insI.run(uuidv4(), empresaId, sid, it, ii)); });
  console.log('  + seções/itens semeados');
}
console.log('✓ Migração 030 concluída');
