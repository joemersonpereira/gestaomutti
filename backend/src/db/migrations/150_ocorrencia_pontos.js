// 150 — Ocorrência pode impactar PONTOS do colaborador (gamificação), além do indicador.
// pontos: quanto tira (ou dá) na loja de pontos quando a ocorrência é lançada. Negativo = desconta.
const db = require('../connection');
for (const t of ['ocorrencia_motivos', 'ocorrencias']) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN pontos INTEGER DEFAULT 0`); console.log(`✅ 150: ${t}.pontos`); }
  catch (e) { console.log(`150: ${t}.pontos já existe (${e.message})`); }
}
