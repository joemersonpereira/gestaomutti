// 208_estagio_talentos.js — Estágios fases 2/3: banco de talentos (candidatos + testes) e ranking.
const db = require('../connection');
const { v4: uuid } = require('uuid');
const EMP = 'empresa-mutti-001';

// Candidatos (vindos do link público) + notas (boletim, frequência, teste)
db.exec(`CREATE TABLE IF NOT EXISTS estagio_candidato (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL, cpf TEXT, email TEXT, telefone TEXT,
  escola TEXT, curso TEXT, serie TEXT,
  boletim REAL, frequencia REAL,       -- boletim 0-10 · frequência 0-100(%)
  teste_nota REAL, teste_total INTEGER, teste_respostas_json TEXT,
  status TEXT DEFAULT 'novo',          -- novo | avaliado | contratado | descartado
  obs TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);

// Banco de questões do teste de conhecimentos gerais
db.exec(`CREATE TABLE IF NOT EXISTS estagio_teste_questao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  pergunta TEXT NOT NULL, alt_json TEXT,   -- JSON: ["alt A","alt B",...]
  correta INTEGER,                         -- índice da alternativa correta
  ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
)`);

// Pesos do ranking (boletim/frequência/teste) — somam 1
db.prepare(`INSERT OR IGNORE INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))`)
  .run(EMP, 'ranking_pesos', JSON.stringify({ boletim: 0.3, frequencia: 0.2, teste: 0.5 }));

// Semeia 3 questões de exemplo (editáveis)
const QS = [
  ['Quanto é 15% de 200?', ['20', '30', '35', '15'], 1],
  ['Qual destas palavras está escrita corretamente?', ['Excessão', 'Exceção', 'Eceção', 'Excesão'], 1],
  ['Numa farmácia, um cliente pagou R$ 48,00 e deu uma nota de R$ 50,00. Qual o troco?', ['R$ 1,00', 'R$ 2,00', 'R$ 3,00', 'R$ 2,50'], 1],
];
const ins = db.prepare(`INSERT OR IGNORE INTO estagio_teste_questao (id,empresa_id,pergunta,alt_json,correta,ativo) VALUES (?,?,?,?,?,1)`);
const n0 = db.prepare(`SELECT COUNT(*) n FROM estagio_teste_questao WHERE empresa_id=?`).get(EMP).n;
if (!n0) QS.forEach(q => ins.run(uuid(), EMP, q[0], JSON.stringify(q[1]), q[2]));

console.log('✅ migration 208: estagio_candidato + teste_questao + ranking_pesos');
