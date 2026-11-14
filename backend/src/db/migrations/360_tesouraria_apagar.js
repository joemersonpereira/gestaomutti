// 360 — "A pagar / Desconto" do operador + contato/retorno p/ a Agilidade (Joe 2026-11-11).
// Na tela de Faltas por caixa, a gestão marca a falta como DÉBITO a descontar (ciclo 25→25 configurável)
// e registra o CONTATO com o colaborador (contato às X, retorno às Y). O sistema calcula o tempo de
// retorno e compara com o SLA (padrão 4h) — isso vira a pontuação de "Agilidade" (auto) no Caixa Destaque.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE tesouraria_apagar (id text PRIMARY KEY, empresa_id text NOT NULL, operador text NOT NULL,
//   loja_id text, de date, ate date, valor numeric NOT NULL, obs text,
//   contato_em timestamptz, retorno_em timestamptz, sla_horas numeric, no_prazo boolean,
//   status text NOT NULL DEFAULT 'aberto', pago_em date, origem_quitacao text, por text, criado_em timestamptz DEFAULT now());
// -- config em tesouraria_config: 'desconto_dia_corte' (25) e 'agilidade_sla_horas' (4).
const db = require('../connection');
console.log('▶ Migração 360 — tesouraria_apagar (a pagar/desconto + contato)');
db.exec(`CREATE TABLE IF NOT EXISTS tesouraria_apagar (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, operador TEXT NOT NULL,
  loja_id TEXT, de TEXT, ate TEXT, valor REAL NOT NULL, obs TEXT,
  contato_em TEXT, retorno_em TEXT, sla_horas REAL, no_prazo INTEGER,
  status TEXT NOT NULL DEFAULT 'aberto', pago_em TEXT, origem_quitacao TEXT, por TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tes_apagar ON tesouraria_apagar(empresa_id, status)`);

const EMP = 'empresa-mutti-001';
// defaults de config (dia de corte do ciclo e SLA de retorno)
try {
  const set = (chave, valor) => { const ex = db.prepare('SELECT 1 FROM tesouraria_config WHERE empresa_id=? AND chave=?').get(EMP, chave); if (!ex) db.prepare('INSERT INTO tesouraria_config (empresa_id, chave, valor) VALUES (?,?,?)').run(EMP, chave, valor); };
  set('desconto_dia_corte', '25');
  set('agilidade_sla_horas', '4');
} catch (e) { /* tabela config com outro shape: ignora */ }

// "Agilidade" passa a ser AUTOMÁTICA (calculada pelo tempo de retorno vs SLA no contato de desconto).
try { db.prepare("UPDATE caixa_pontos_regra SET tipo='auto' WHERE chave='agilidade'").run(); } catch (e) { /* regra ainda não existe */ }
// "Deixar venda/entrega na tela sem baixar" passa a ser AUTOMÁTICA (orçamento status 'A' que virou o dia).
try { db.prepare("UPDATE caixa_pontos_regra SET tipo='auto' WHERE chave='tela_sem_baixar'").run(); } catch (e) { /* regra ainda não existe */ }

console.log('✓ Migração 360 concluída (tesouraria_apagar + config desconto/SLA + agilidade auto)');
