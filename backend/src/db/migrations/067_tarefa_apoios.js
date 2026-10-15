// 067 — vários apoios por tarefa (mantém apoio_id como primário p/ compatibilidade).
const db = require('../connection');
console.log('▶ Migração 067 — múltiplos apoios por tarefa');
db.exec(`CREATE TABLE IF NOT EXISTS tarefa_apoios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now'))
);`);
// Migra apoios já existentes (apoio_id) para a tabela
try {
  const { v4: uuidv4 } = require('uuid');
  const comApoio = db.prepare(`SELECT id, empresa_id, apoio_id FROM tarefas WHERE apoio_id IS NOT NULL`).all();
  let n = 0;
  for (const t of comApoio) {
    const ja = db.prepare(`SELECT 1 FROM tarefa_apoios WHERE tarefa_id=? AND colaborador_id=?`).get(t.id, t.apoio_id);
    if (!ja) { db.prepare(`INSERT INTO tarefa_apoios (id,empresa_id,tarefa_id,colaborador_id) VALUES (?,?,?,?)`).run(uuidv4(), t.empresa_id, t.id, t.apoio_id); n++; }
  }
  console.log(`  ${n} apoio(s) migrado(s) para tarefa_apoios`);
} catch (e) { console.log('  migração de apoios:', e.message); }
console.log('✓ Migracao 067 concluida');
