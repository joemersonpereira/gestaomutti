// 204_ecomm_conversao.js — Conversão Giro/E-commerce × ERP: configuração da rotina diária e
// histórico de cada checkout analisado (registrado na API, visita, sem compra, teste, erro).
// Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';

db.exec(`CREATE TABLE IF NOT EXISTS ecomm_conversao_config (
  empresa_id TEXT NOT NULL,
  chave      TEXT NOT NULL,
  valor      TEXT,
  label      TEXT,
  PRIMARY KEY (empresa_id, chave)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS ecomm_conversao_log (
  checkout_id    TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  checkout_em    TEXT,            -- data/hora local do checkout (YYYY-MM-DD HH:MM)
  origem         TEXT,            -- giro | ecomm
  cliente        TEXT,
  telefone       TEXT,
  produto        TEXT,            -- produto do giro/checkout
  preco          REAL,
  resultado      TEXT NOT NULL,   -- registrada | visita | sem_compra | teste | erro
  via            TEXT,            -- telefone | nome
  erp_venda_id   TEXT,
  coo            TEXT,
  loja           TEXT,
  venda_em       TEXT,
  item_erp       TEXT,            -- item do cupom que casou (produto ou variação)
  valor          REAL,            -- valor do item enviado à API
  detalhe        TEXT,            -- resposta da API / o que o cliente levou / erro
  analisado_em   TEXT NOT NULL,
  registrado_em  TEXT
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ecomm_conv_res ON ecomm_conversao_log (empresa_id, resultado)`);

// [chave, valor, label]
const CFG = [
  ['ativo', '1', 'Rotina diária ligada (1) / desligada (0)'],
  ['hora_execucao', '18:00', 'Horário diário da validação (HH:MM)'],
  ['janela_dias', '15', 'Dias após o checkout em que a compra na loja ainda conta'],
  ['palavras_variacao', '3', 'Palavras iniciais da descrição que precisam bater para ser variação (tipo + marca + linha)'],
  ['registrar_auto', '1', 'Registrar a venda na API automaticamente (1) ou só apontar (0)'],
  ['api_base', 'https://ec-farmaciamutti.pages.dev', 'Endereço da API do e-commerce'],
  ['ultima_execucao', '', 'Data da última execução (preenchido pela rotina)'],
];
const ins = db.prepare('INSERT OR IGNORE INTO ecomm_conversao_config (empresa_id,chave,valor,label) VALUES (?,?,?,?)');
CFG.forEach(c => ins.run(EMP, c[0], c[1], c[2]));

console.log('✅ migration 204: ecomm_conversao_config (', db.prepare('SELECT COUNT(*) n FROM ecomm_conversao_config').get().n, 'chaves) + ecomm_conversao_log');
