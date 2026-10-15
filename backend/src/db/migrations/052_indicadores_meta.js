// 052 — metas/lançamentos de indicadores comerciais + remoção do indicador 'generico'
const db = require('../connection');
console.log('▶ Migração 052 — indicadores comerciais por meta');

db.exec(`CREATE TABLE IF NOT EXISTS indicador_metas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, indicador TEXT NOT NULL,
  mes INTEGER NOT NULL, ano INTEGER NOT NULL, escopo TEXT NOT NULL,
  meta_valor REAL DEFAULT 0, unidade TEXT DEFAULT 'percentual', criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, loja_id, indicador, mes, ano, escopo)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS indicador_lancamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, indicador TEXT NOT NULL,
  mes INTEGER NOT NULL, ano INTEGER NOT NULL, data_inicio TEXT, data_fim TEXT, valor REAL DEFAULT 0,
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now'))
);`);

// Remove 'generico': move o peso dele para 'identificacao' (mantém soma 100) e desativa.
try {
  const gens = db.prepare(`SELECT empresa_id, funcao_id, peso FROM config_indicadores WHERE indicador='generico' AND ativo=1`).all();
  gens.forEach(g => {
    db.prepare(`UPDATE config_indicadores SET peso = peso + ? WHERE empresa_id=? AND funcao_id=? AND indicador='identificacao'`).run(g.peso || 0, g.empresa_id, g.funcao_id);
    db.prepare(`UPDATE config_indicadores SET ativo=0 WHERE empresa_id=? AND funcao_id=? AND indicador='generico'`).run(g.empresa_id, g.funcao_id);
  });
  console.log(`  ${gens.length} indicador(es) 'generico' desativado(s).`);
} catch (e) { console.log('  (config_indicadores ainda não existe — ok no setup novo)'); }

console.log('✓ Migração 052 concluída');
