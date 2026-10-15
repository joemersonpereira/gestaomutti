// migrar.js — aplica as migrações pendentes, na ordem dos arquivos, SEM apagar dado.
//
// Uso (na pasta backend):
//   node src/db/migrar.js              aplica o que falta
//   node src/db/migrar.js --status     só lista o que está aplicado e o que falta
//   node src/db/migrar.js --baseline   marca TODAS como aplicadas sem rodar nenhuma
//
// Como funciona
// ─────────────
// Cada arquivo em `migrations/NNN_nome.js` executa suas instruções ao ser carregado
// (require). Este runner descobre os arquivos sozinho (não existe mais lista para
// manter), aplica em ordem alfabética — que é a ordem numérica — e anota cada um
// na tabela `schema_migracoes`. Na próxima execução só roda o que não está anotado.
//
// Por que existe a tabela
// ───────────────────────
// Até 2026-10-15 o runner era uma lista escrita à mão (`migrar-pendentes.js`), que
// tinha 65 das 244 migrações e colocava a 193 antes da 190 que cria a tabela dela.
// Em instalação nova ele falhava no primeiro passo; na máquina de origem nunca
// apareceu porque o banco de lá evoluiu aos poucos. Com a tabela, o banco diz o
// que já recebeu, e uma migração nova é só um arquivo novo.
//
// Banco anterior a esta tabela (o de produção, que já tem tudo aplicado)
// ───────────────────────────────────────────────────────────────────────
// Se a tabela não existe mas o banco já tem dados (tabela `empresas`), o runner
// assume que ele está COMPLETO e faz o baseline: anota todas as migrações atuais
// como aplicadas, sem rodar nenhuma. É o que vale para o banco copiado da máquina
// do escritório. Nenhuma migração roda duas vezes — importa porque 11 delas
// inserem dados de semente sem `OR IGNORE` e duplicariam linhas.
//
// Banco novo (recém-criado pelo setup.js) já nasce com a tabela vazia, então
// o runner aplica as 247 em ordem — caminho testado em 2026-10-15.
//
// v2.0 (Postgres): a mesma tabela, com `aplicada_em timestamptz default now()`.
// DDL em docs/deploy-vps.md.

const fs = require('fs');
const path = require('path');
const db = require('./connection');

const DIR = path.join(__dirname, 'migrations');
const modo = process.argv[2] || '';

// Existência da tabela ANTES de criá-la: é ela que distingue "banco anterior ao runner"
// (sem tabela, com dados → baseline) de "banco novo do setup.js" (tabela vazia → aplica tudo).
const ledgerExistia = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migracoes'").get();

db.exec(`CREATE TABLE IF NOT EXISTS schema_migracoes (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL DEFAULT (datetime('now')),
  modo        TEXT NOT NULL DEFAULT 'aplicada'   -- aplicada | baseline
)`);

const arquivos = fs.readdirSync(DIR).filter(f => /^\d{3}_.+\.js$/.test(f)).sort();
const aplicadas = new Set(db.prepare('SELECT nome FROM schema_migracoes').all().map(r => r.nome));
const registrar = db.prepare('INSERT OR IGNORE INTO schema_migracoes (nome, modo) VALUES (?, ?)');

const temDados = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='empresas'").get();
const pendentes = arquivos.filter(f => !aplicadas.has(f));

if (modo === '--status') {
  console.log(`Migrações: ${arquivos.length} arquivos · ${aplicadas.size} aplicadas · ${pendentes.length} pendentes`);
  pendentes.forEach(f => console.log('  pendente:', f));
  process.exit(0);
}

// Baseline explícito, ou implícito num banco que já tem dados e nunca viu a tabela.
const baselineImplicito = !ledgerExistia && temDados && !process.env.MIGRAR_SEM_BASELINE;
if (modo === '--baseline' || baselineImplicito) {
  const marcar = db.transaction(() => { for (const f of pendentes) registrar.run(f, 'baseline'); });
  marcar();
  console.log(`⚠️  baseline: ${pendentes.length} migrações marcadas como já aplicadas, nenhuma executada.`);
  if (baselineImplicito) {
    console.log('   Motivo: o banco já tinha dados e ainda não tinha a tabela schema_migracoes —');
    console.log('   é um banco anterior ao runner, tratado como completo. Para forçar a execução');
    console.log('   de tudo (banco incompleto), rode com MIGRAR_SEM_BASELINE=1.');
  }
  process.exit(0);
}

if (pendentes.length === 0) { console.log('✅ Migrações: nada pendente.'); process.exit(0); }

console.log(`=== Aplicando ${pendentes.length} migração(ões) pendente(s) ===`);
const silencio = () => {};
for (const f of pendentes) {
  const log = console.log; console.log = silencio;          // cada migração imprime seu próprio "✅"; aqui basta uma linha por arquivo
  try {
    require(path.join(DIR, f));
    console.log = log;
    registrar.run(f, 'aplicada');
    console.log('  ✓', f);
  } catch (e) {
    console.log = log;
    console.error(`\n✗ Erro em ${f}: ${e.message}`);
    console.error('  As anteriores ficaram registradas; corrija e rode de novo.');
    process.exit(1);
  }
}
console.log('✅ Todas as migrações pendentes foram aplicadas.');
process.exit(0);
