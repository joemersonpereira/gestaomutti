// 070 — Faixas de premiação de VITAMINAS (R$ por unidade vendida), configuráveis.
// Substitui a tabela fixa que estava no código por um cadastro por empresa.
const db = require('../connection');
console.log('▶ Migração 070 — faixas de premiação de vitaminas');

db.exec(`CREATE TABLE IF NOT EXISTS premiacao_vitaminas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  min_un INTEGER NOT NULL,   -- vale a partir desta quantidade de unidades
  valor REAL NOT NULL,       -- R$ por unidade nessa faixa
  UNIQUE(empresa_id, min_un)
);`);

// Semeia as faixas informadas pelo usuário (a partir de X unidades → R$/un):
//   <10 un → R$0 | 10–29 → R$5 | 30–49 → R$7 | ≥50 → R$10
const { v4: uuidv4 } = require('uuid');
const empresas = db.prepare('SELECT id FROM empresas').all();
const PADRAO = [ { min_un: 0, valor: 0 }, { min_un: 10, valor: 5 }, { min_un: 30, valor: 7 }, { min_un: 50, valor: 10 } ];
const ins = db.prepare('INSERT OR IGNORE INTO premiacao_vitaminas (id,empresa_id,min_un,valor) VALUES (?,?,?,?)');
let n = 0;
for (const e of empresas) for (const f of PADRAO) n += ins.run(uuidv4(), e.id, f.min_un, f.valor).changes;
console.log(`✓ ${n} faixa(s) de vitaminas semeada(s) (empresas: ${empresas.length}).`);
console.log('✓ Migração 070 concluída.');
