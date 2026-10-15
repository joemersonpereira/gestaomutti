// 191_conciliacao_repasse.js — a trilha do dinheiro, por fora do ERP:
//   venda conferida → recebível previsto → repasse que a credenciadora pagou.
// A previsão nasce do próprio relatório de vendas (a operadora informa taxa, líquido e prazo),
// então o sistema sabe quanto deve cair ANTES de o dinheiro chegar — sem perguntar nada ao ERP.
const db = require('../connection');

const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
const addCol = (t, col, tipo) => { if (!cols(t).includes(col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${tipo}`); };

// A venda da operadora ganha o que faltava para virar recebível.
addCol('conc_item', 'estabelecimento', 'TEXT');   // nº do estabelecimento na credenciadora (rateio por filial)
addCol('conc_item', 'prazo_texto', 'TEXT');       // "1 dia útil", "31 dias", "31 dias cada parcela"

// Uma linha por PARCELA: é isto que é comparado com o repasse.
db.exec(`CREATE TABLE IF NOT EXISTS conc_previsao (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id        INTEGER,            -- conc_item.id (a venda)
  empresa_id     TEXT,
  operadora      TEXT,
  uni_erp        INTEGER,
  loja_id        TEXT,
  estabelecimento TEXT,
  data_venda     TEXT,
  data_prevista  TEXT,               -- quando essa parcela deve cair
  bandeira       TEXT,
  grupo          TEXT,               -- DEBITO|CREDITO|PARCELADO|VOUCHER|PIX
  parcela        INTEGER,
  total_parcela  INTEGER,
  valor_bruto    REAL,
  valor_liquido  REAL,               -- o que a operadora disse que paga
  taxa           REAL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_conc_previsao_dia ON conc_previsao (empresa_id, data_prevista, estabelecimento)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_conc_previsao_item ON conc_previsao (item_id)`);

// Cada arquivo de repasse importado (relatório "recebimentos" da credenciadora).
db.exec(`CREATE TABLE IF NOT EXISTS conc_repasse_arquivo (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id   TEXT,
  operadora    TEXT,
  layout       TEXT,
  nome_arquivo TEXT,
  hash         TEXT,
  data_ini     TEXT,
  data_fim     TEXT,
  linhas       INTEGER,
  valor_total  REAL,
  usuario_id   TEXT,
  importado_em TEXT
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_conc_repasse_arquivo_hash ON conc_repasse_arquivo (empresa_id, hash)`);

// Cada depósito: a credenciadora paga por estabelecimento + bandeira + modalidade.
db.exec(`CREATE TABLE IF NOT EXISTS conc_repasse (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo_id      INTEGER,
  empresa_id      TEXT,
  operadora       TEXT,
  data            TEXT,              -- data do crédito
  estabelecimento TEXT,
  uni_erp         INTEGER,
  loja_id         TEXT,
  banco           TEXT,
  agencia         TEXT,
  conta           TEXT,
  bandeira        TEXT,
  modalidade      TEXT,              -- "Débito", "Crédito", "Crédito parcelado"…
  grupo           TEXT,
  valor           REAL,              -- líquido depositado
  valor_bruto     REAL,
  taxa            REAL,
  status          TEXT,              -- Pago, Cancelado…
  tipo            TEXT               -- recebido | a_receber
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_conc_repasse_dia ON conc_repasse (empresa_id, data, estabelecimento)`);

// Cada PARCELA paga (é o que permite dizer "essa venda foi paga" e conferir a taxa).
db.exec(`CREATE TABLE IF NOT EXISTS conc_repasse_parcela (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo_id      INTEGER,
  repasse_id      INTEGER,           -- o depósito em que ela entrou
  empresa_id      TEXT,
  operadora       TEXT,
  data_recebimento TEXT,
  data_venda      TEXT,
  data_vencimento TEXT,
  nsu             TEXT,
  autorizacao     TEXT,
  lote            TEXT,
  estabelecimento TEXT,
  uni_erp         INTEGER,
  loja_id         TEXT,
  bandeira        TEXT,
  modalidade      TEXT,
  grupo           TEXT,
  parcelas        INTEGER,
  parcela         INTEGER,
  valor_bruto     REAL,
  taxa            REAL,
  valor_taxa      REAL,
  valor_liquido   REAL,
  status          TEXT,
  item_id         INTEGER            -- conc_item casado (a venda que eu já tinha conferido)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_conc_rep_parcela_busca ON conc_repasse_parcela (empresa_id, data_recebimento, estabelecimento)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_conc_rep_parcela_nsu ON conc_repasse_parcela (empresa_id, nsu)`);

// Ajustes, cancelamentos e cobranças (o que a credenciadora DESCONTOU).
db.exec(`CREATE TABLE IF NOT EXISTS conc_repasse_ajuste (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo_id      INTEGER,
  empresa_id      TEXT,
  operadora       TEXT,
  tipo            TEXT,              -- ajuste | cancelamento | cobranca_aberta
  data            TEXT,
  data_venda      TEXT,
  nsu             TEXT,
  estabelecimento TEXT,
  uni_erp         INTEGER,
  loja_id         TEXT,
  bandeira        TEXT,
  motivo          TEXT,
  descricao       TEXT,
  valor           REAL,
  credito         REAL,
  pendente        REAL
)`);

// Validação do financeiro: fecha o dia/depósito depois de conferir.
db.exec(`CREATE TABLE IF NOT EXISTS conc_repasse_conferencia (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id    TEXT,
  ref           TEXT,                -- 'dia:2026-08-21' | 'dep:<id>' | 'dia-loja:2026-08-21|loja-esplanada'
  status        TEXT,                -- aberto | conferido | divergente
  valor         REAL,
  obs           TEXT,
  usuario_id    TEXT,
  criado_em     TEXT,
  atualizado_em TEXT
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_conc_repasse_conf_ref ON conc_repasse_conferencia (empresa_id, ref)`);

// De-para nº do estabelecimento → loja. É preenchido sozinho a partir dos relatórios de VENDAS
// (que trazem estabelecimento + CNPJ), mas fica editável para o caso de um credenciamento novo.
db.exec(`CREATE TABLE IF NOT EXISTS conc_estabelecimento (
  empresa_id      TEXT,
  operadora       TEXT,
  estabelecimento TEXT,
  uni_erp         INTEGER,
  loja_id         TEXT,
  cnpj            TEXT,
  atualizado_em   TEXT,
  PRIMARY KEY (empresa_id, operadora, estabelecimento)
)`);

// Taxa combinada com a credenciadora — sem isso não dá para dizer "cobraram a mais".
// (a tabela taxacontratadacartao do ERP está vazia neste banco)
db.exec(`CREATE TABLE IF NOT EXISTS conc_taxa_contratada (
  empresa_id    TEXT,
  operadora     TEXT,
  bandeira      TEXT,               -- '*' = qualquer
  grupo         TEXT,               -- DEBITO|CREDITO|PARCELADO
  parcelas      INTEGER,            -- 0 = qualquer
  taxa          REAL,
  vigencia_ini  TEXT,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, operadora, bandeira, grupo, parcelas)
)`);

console.log('✅ migration 191: repasses (conc_previsao, conc_repasse, conc_repasse_arquivo, conc_repasse_conferencia, conc_estabelecimento, conc_taxa_contratada)');
