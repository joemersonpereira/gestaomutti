// erp-backfill-nascimento.js — Preenche colaboradores.nascimento a partir do ERP
// (pessoa.datanascimento) para quem tem erp_pessoa_id e ainda está sem data.
// Idempotente: só toca em quem está com nascimento vazio. Uso: node src/db/erp-backfill-nascimento.js
const db = require('./connection');
const { erpQuery, habilitado } = require('./erp');

async function main() {
  if (!habilitado()) { console.error('ERP desabilitado.'); process.exit(1); }
  const alvos = db.prepare(`SELECT id, erp_pessoa_id FROM colaboradores WHERE erp_pessoa_id IS NOT NULL AND (nascimento IS NULL OR nascimento='')`).all();
  if (!alvos.length) { console.log('Nada a preencher.'); process.exit(0); }
  const pids = alvos.map(a => Number(a.erp_pessoa_id));
  const rows = await erpQuery(`SELECT id, to_char(datanascimento,'YYYY-MM-DD') nasc FROM pessoa WHERE id = ANY($1::bigint[]) AND datanascimento IS NOT NULL`, [pids]);
  const mapa = new Map(rows.map(r => [Number(r.id), r.nasc]));
  const upd = db.prepare('UPDATE colaboradores SET nascimento=? WHERE id=?');
  let n = 0;
  const tx = db.transaction(() => { for (const a of alvos) { const d = mapa.get(Number(a.erp_pessoa_id)); if (d) { upd.run(d, a.id); n++; } } });
  tx();
  console.log(`✓ ${n} colaborador(es) com nascimento preenchido do ERP (de ${alvos.length} sem data).`);
  process.exit(0);
}
main().catch(e => { console.error('✗', e.message); process.exit(1); });
