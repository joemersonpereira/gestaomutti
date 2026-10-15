// 165 — Trilhas: um curso pode pertencer a uma trilha (sequência) com uma ordem.
// Trilha = agrupamento nomeado de cursos em ordem; progresso = % concluído da trilha.
const db = require('../connection');
for (const [c, t] of [['trilha', 'TEXT'], ['trilha_ordem', 'INTEGER']]) {
  try { db.exec(`ALTER TABLE cursos ADD COLUMN ${c} ${t}`); } catch { /* já existe */ }
}
console.log('✅ migration 165: cursos.trilha + trilha_ordem (trilhas de cursos)');
