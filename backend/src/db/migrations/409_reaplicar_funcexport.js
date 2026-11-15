// 409 — CORREÇÃO DE INFRA. Joe 2026-11-15.
// As migrations 392–408 foram escritas no estilo `module.exports = function (db) {...}` (function-export).
// O runner da produção (migrar.js) só faz `require(arquivo)` e NÃO chama a função — então essas 17
// migrations viraram NO-OP na produção (foram marcadas como "aplicadas" no schema_migracoes, mas o DDL
// nunca rodou). Resultado: tabelas/colunas faltando na prod (hoptodesk_device, orcamento_justificativa,
// loja.area_m2, colaborador_acessos, os módulos de marketing 396–401, etc.) + o cache do painel (408)
// nunca foi limpo.
//
// Esta migration é SELF-EXECUTING (roda no require, igual às de antes da 392), então funciona mesmo no
// runner só-require. Ela varre as migrations anteriores e CHAMA as que exportam função. Tudo em 392–408
// é idempotente (CREATE TABLE IF NOT EXISTS / ALTER guardado / DELETE / rebuild guardado por coluna),
// então reaplicar é seguro, inclusive em bancos onde já rodou (local).
const fs = require('fs');
const path = require('path');
const db = require('../connection');

const DIR = __dirname;
// SÓ a faixa function-export (392–408). NÃO reexigir as de antes da 392: elas são self-executing e
// ~11 têm seed sem OR IGNORE — reexigir duplicaria dados. 392–408 são todas function-export (só definem
// a função; exigir não tem efeito colateral) e idempotentes quando chamadas.
const alvos = fs.readdirSync(DIR).filter(f => /^\d{3}_.+\.js$/.test(f) && f >= '392_' && f < '409_').sort();
let aplicadas = 0;
for (const f of alvos) {
  try {
    const m = require(path.join(DIR, f));
    if (typeof m === 'function') { m(db); aplicadas++; }
  } catch (e) { console.error('  409 reaplicar', f, '→', e.message); }
}
console.log(`  409: ${aplicadas} migração(ões) function-export reaplicada(s) com segurança (idempotente).`);

/* === Caminho técnico v2.0 (Postgres) ===
   Não se aplica ao Postgres (lá o runner chama a função corretamente). Isto conserta só o SQLite v1.
   Lição: o runner DEVE chamar o export quando for função —
     const m = require(arquivo); if (typeof m === 'function') m(db);
*/
