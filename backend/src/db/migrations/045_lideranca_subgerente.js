// 045 — marcador de Liderança no colaborador + função Subgerente
const db = require('../connection');
console.log('▶ Migração 045 — lideranca + func-subgerente');
try { db.exec(`ALTER TABLE colaboradores ADD COLUMN lideranca INTEGER DEFAULT 0`); } catch (e) { /* já existe */ }
// Garante a função Subgerente (por id; se já existe com outro id pelo nome, não duplica problema)
const empresas = db.prepare(`SELECT id FROM empresas`).all();
const ins = db.prepare(`INSERT OR IGNORE INTO funcoes (id,empresa_id,nome,tem_checklist,tem_avaliacao,tem_meta,ativa,escritorio) VALUES ('func-subgerente',?,?,1,1,0,1,0)`);
empresas.forEach(e => { try { ins.run(e.id, 'Subgerente'); } catch (err) { /* ok */ } });
console.log('✓ Migração 045 concluída');
