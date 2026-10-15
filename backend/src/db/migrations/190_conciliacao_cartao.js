// 190_conciliacao_cartao.js — Conciliação de Cartões: confronto do relatório da OPERADORA × o que o ERP registrou.
// Existe porque o PDV não é integrado por DLL ao TEF: o operador escolhe uma forma no ERP e passa outra na
// maquininha (ex.: marca crédito e passa Alelo). O ERP fica com a modalidade errada e a conciliação não fecha.
const db = require('../connection');

// De-para 1: modalidade do ERP → GRUPO real (o que a operadora chama). É o que permite dizer "está errado".
db.exec(`CREATE TABLE IF NOT EXISTS conc_modalidade_grupo (
  empresa_id      TEXT,
  modalidade_id   TEXT,
  modalidade_nome TEXT,
  grupo           TEXT,     -- DEBITO|CREDITO|PARCELADO|VOUCHER|PIX|CREDIARIO|PREPAGO|OUTRO
  conciliar       INTEGER DEFAULT 1,
  atualizado_em   TEXT,
  PRIMARY KEY (empresa_id, modalidade_id)
)`);

// De-para 2: operadora do relatório → modalidade(s) do ERP aceitas (p/ arquivos de convênio, que não
// informam débito/crédito por linha: Brasil Card, Le Card, Nutricash, Bracov, Alelo…).
db.exec(`CREATE TABLE IF NOT EXISTS conc_operadora_modalidade (
  empresa_id    TEXT,
  operadora     TEXT,
  modalidade_id TEXT,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, operadora, modalidade_id)
)`);

// Cada relatório importado (1 arquivo = 1 lote, idempotente pelo hash do conteúdo).
db.exec(`CREATE TABLE IF NOT EXISTS conc_arquivo (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id    TEXT,
  operadora     TEXT,
  layout        TEXT,
  loja_id       TEXT,          -- informada no upload (quando o arquivo não traz CNPJ)
  nome_arquivo  TEXT,
  hash          TEXT,
  data_ini      TEXT,
  data_fim      TEXT,
  linhas        INTEGER,
  valor_total   REAL,
  usuario_id    TEXT,
  importado_em  TEXT
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_conc_arquivo_hash ON conc_arquivo (empresa_id, hash)`);

// Linhas do relatório, normalizadas (a "verdade da operadora").
db.exec(`CREATE TABLE IF NOT EXISTS conc_item (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo_id     INTEGER,
  empresa_id     TEXT,
  operadora      TEXT,
  uni_erp        INTEGER,       -- unidadenegocio do ERP (por CNPJ ou pela loja do upload)
  loja_id        TEXT,
  data           TEXT,
  hora           TEXT,
  nsu            TEXT,
  autorizacao    TEXT,
  cartao         TEXT,
  cliente        TEXT,
  bandeira       TEXT,
  grupo          TEXT,
  tipo_operadora TEXT,
  parcelas       INTEGER,
  valor          REAL,
  valor_liquido  REAL,
  taxa           REAL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_conc_item_busca ON conc_item (empresa_id, data, uni_erp)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_conc_item_arquivo ON conc_item (arquivo_id)`);

// Tratativa da divergência (quem olhou, o que fez). A divergência em si é sempre RECALCULADA — aqui
// fica só a decisão humana, amarrada pela referência estável da divergência.
db.exec(`CREATE TABLE IF NOT EXISTS conc_tratativa (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id    TEXT,
  ref           TEXT,          -- ex.: 'MODALIDADE|ext:1234' ou 'SO_OPERADORA|edi:99'
  tipo          TEXT,
  status        TEXT,          -- aberta | corrigida | procede | ignorada
  valor         REAL,
  loja_id       TEXT,
  operador      TEXT,          -- operador de caixa do ERP (p/ treinar/cobrar)
  obs           TEXT,
  usuario_id    TEXT,
  criado_em     TEXT,
  atualizado_em TEXT
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_conc_tratativa_ref ON conc_tratativa (empresa_id, ref)`);

console.log('✅ migration 190: conciliação de cartões (conc_modalidade_grupo, conc_operadora_modalidade, conc_arquivo, conc_item, conc_tratativa)');
