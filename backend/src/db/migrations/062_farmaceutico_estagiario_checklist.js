// 062 — consolida farmacêutico/estagiário no checklist (média por pessoa) e remove indicadores duplicados do pilar.
// Idempotente: também desfaz seções genéricas e aval=0 caso uma versão anterior desta migração tenha rodado.
const db = require('../connection');
console.log('▶ Migração 062 — consolidação farmacêutico/estagiário no checklist');

// 1) Remove seções genéricas "Farmacêutico"/"Estagiário" do checklist do gerente (avaliação é por pessoa, via seletor)
try {
  const secs = db.prepare(`SELECT id FROM gerente_secoes WHERE nome IN ('Farmacêutico','Estagiário')`).all();
  secs.forEach(s => db.prepare(`DELETE FROM gerente_itens WHERE secao_id=?`).run(s.id));
  const r = db.prepare(`DELETE FROM gerente_secoes WHERE nome IN ('Farmacêutico','Estagiário')`).run();
  if (r.changes) console.log(`  ${r.changes} secao(oes) generica(s) removida(s)`);
} catch (e) {}

// 2) Garante que as funcoes continuam avaliaveis (a avaliacao inline do checklist usa esse fluxo)
try { db.prepare(`UPDATE funcoes SET tem_avaliacao=1 WHERE id IN ('func-farmaceutico','func-estagiario')`).run(); } catch (e) {}

// 3) Remove os indicadores duplicados do pilar (agora entram pela nota do checklist)
try {
  const r = db.prepare(`DELETE FROM indicadores_def WHERE id IN ('farmaceutico','estagiarios')`).run();
  if (r.changes) console.log(`  ${r.changes} indicador(es) de pilar removido(s) (consolidados no checklist)`);
} catch (e) {}

console.log('✓ Migracao 062 concluida');
