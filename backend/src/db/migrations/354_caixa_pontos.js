// 354 — Caixa Destaque por PONTOS (Joe 2026-11-11).
// O Joe REJEITOU o modelo de nota + premiação R$250/150/100/50. O novo modelo é o QUADRO DE PONTOS
// que ele mandou: cada critério vale X pontos (CONFIGURÁVEL, nada fixo no código), apuração TRIMESTRAL,
// ganha só quem alcança >= o mínimo (30). Pontualidade usa o Tangerino (atraso). Há critérios
// AUTO (saem do ERP/ponto) e MANUAIS (lançamento avulso pela gestão). Também há diferença avulsa manual.
//
// ── Caminho técnico v2.0 (Postgres) ──────────────────────────────────────────
// CREATE TABLE caixa_pontos_regra (id text PRIMARY KEY, empresa_id text NOT NULL, chave text NOT NULL,
//   label text NOT NULL, pontos integer NOT NULL DEFAULT 0, tipo text NOT NULL DEFAULT 'manual',
//   desclassifica boolean NOT NULL DEFAULT false, ordem integer NOT NULL DEFAULT 0, ativo boolean NOT NULL DEFAULT true,
//   UNIQUE(empresa_id, chave));
// CREATE TABLE caixa_pontos_lancamento (id text PRIMARY KEY, empresa_id text NOT NULL, colaborador_id text,
//   operador_erp text, operador_nome text, loja_id text, data date NOT NULL, regra_chave text, pontos integer NOT NULL DEFAULT 0,
//   origem text NOT NULL DEFAULT 'avulso', ref text, obs text, por text, criado_em timestamptz DEFAULT now(),
//   UNIQUE(empresa_id, origem, ref));
// -- config do mínimo p/ premiação fica em tesouraria_config chave 'pontos_minimo_premiacao' (default 30).
const db = require('../connection');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();
console.log('▶ Migração 354 — caixa_pontos (regra + lançamento)');

db.exec(`CREATE TABLE IF NOT EXISTS caixa_pontos_regra (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, chave TEXT NOT NULL,
  label TEXT NOT NULL, pontos INTEGER NOT NULL DEFAULT 0, tipo TEXT NOT NULL DEFAULT 'manual',
  desclassifica INTEGER NOT NULL DEFAULT 0, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_cx_pontos_regra ON caixa_pontos_regra(empresa_id, chave)`);

db.exec(`CREATE TABLE IF NOT EXISTS caixa_pontos_lancamento (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT, operador_erp TEXT, operador_nome TEXT,
  loja_id TEXT, data TEXT NOT NULL, regra_chave TEXT, pontos INTEGER NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'avulso', ref TEXT, obs TEXT, por TEXT, criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_cx_pontos_lanc ON caixa_pontos_lancamento(empresa_id, data)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_cx_pontos_lanc_ref ON caixa_pontos_lancamento(empresa_id, origem, ref)`);

// Seed do quadro de pontos do Joe (valores PADRÃO — ele ajusta na tela). tipo: auto=sai do ERP/ponto; manual=lançado pela gestão.
const EMP = 'empresa-mutti-001';
const REGRAS = [
  ['acerto_caixa', 'Acerto de caixa (diferença zero)', 2, 'auto', 0],
  ['sem_erro_1sem', '1 semana sem errar no caixa', 5, 'auto', 0],
  ['sem_erro_2sem', '2 semanas sem errar no caixa', 15, 'auto', 0],
  ['sem_erro_3sem', '3 semanas sem errar no caixa', 30, 'auto', 0],
  ['sem_erro_4sem', '4 semanas sem errar no caixa', 50, 'auto', 0],
  ['erro_3dias', '3 dias de erros consecutivos no caixa', -5, 'auto', 0],
  ['erro_5dias', '5 dias de erros consecutivos no caixa', -10, 'auto', 0],
  ['dif_ate30', 'Diferença de caixa até R$30,00', -1, 'auto', 0],
  ['dif_30a100', 'Diferença de caixa R$30,01 a R$100,00', -5, 'auto', 0],
  ['dif_acima100', 'Diferença de caixa superior a R$100,01', -30, 'auto', 0],
  ['agilidade', 'Agilidade', 10, 'manual', 0],
  ['pontual_1015', 'Pontualidade — atraso de 10 a 15 min', -3, 'auto', 0],
  ['pontual_1630', 'Pontualidade — atraso de 16 a 30 min', -10, 'auto', 0],
  ['pontual_mais30', 'Pontualidade — atraso superior a 30 min', 0, 'auto', 1],
  ['pontual_conferencia', 'Ser pontual no dia da conferência', 3, 'manual', 0],
  ['erro_sangria_dp', 'Erro de sangria / DP', -2, 'manual', 0],
  ['modalidade_errada', 'Baixar venda na modalidade errada', -1, 'manual', 0],
  ['fundo_errado', 'Fundo de caixa errado', -1, 'manual', 0],
  ['tela_sem_baixar', 'Deixar venda ou entrega na tela sem baixar', -3, 'manual', 0],
];
const existe = db.prepare('SELECT 1 FROM caixa_pontos_regra WHERE empresa_id=? AND chave=?');
const ins = db.prepare('INSERT INTO caixa_pontos_regra (id, empresa_id, chave, label, pontos, tipo, desclassifica, ordem, ativo) VALUES (?,?,?,?,?,?,?,?,1)');
REGRAS.forEach((r, i) => { if (!existe.get(EMP, r[0])) ins.run(uuid(), EMP, r[0], r[1], r[2], r[3], r[4], i); });

// mínimo p/ premiação (default 30) em tesouraria_config, se a tabela existir e ainda não tiver o valor
try {
  const has = db.prepare("SELECT 1 FROM tesouraria_config WHERE empresa_id=? AND chave='pontos_minimo_premiacao'").get(EMP);
  if (!has) db.prepare("INSERT INTO tesouraria_config (empresa_id, chave, valor) VALUES (?, 'pontos_minimo_premiacao', '30')").run(EMP);
} catch (e) { /* tabela config pode ter outro shape; ignora */ }

console.log('✓ Migração 354 concluída (caixa_pontos: ' + REGRAS.length + ' regras seed)');
