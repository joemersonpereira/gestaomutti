// 182_botvendas_monitoria.js — monitoria por IA: termos proibidos/evasivos + config + seed.
const db = require('../connection');
const { v4: uuid } = require('uuid');

// Termos que NÃO devem ser usados no atendimento (negativas e evasivos).
db.exec(`CREATE TABLE IF NOT EXISTS botvendas_termos (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT,
  termo      TEXT,
  tipo       TEXT DEFAULT 'negativa',  -- negativa | evasivo
  ativo      INTEGER DEFAULT 1,
  criado_em  TEXT
)`);

// Config da monitoria (auto ao fechar, nota mínima p/ alerta).
db.exec(`CREATE TABLE IF NOT EXISTS botvendas_config (
  empresa_id TEXT PRIMARY KEY,
  auto       INTEGER DEFAULT 1,
  nota_alerta REAL DEFAULT 6,
  atualizado_em TEXT
)`);

// Colunas extras na avaliação.
const cols = db.prepare("PRAGMA table_info(botvendas_avaliacoes)").all().map(c => c.name);
if (!cols.includes('termos_encontrados')) db.exec("ALTER TABLE botvendas_avaliacoes ADD COLUMN termos_encontrados TEXT");
if (!cols.includes('auto')) db.exec("ALTER TABLE botvendas_avaliacoes ADD COLUMN auto INTEGER DEFAULT 0");

// Seed por empresa (só se ainda não houver critérios/termos).
const CRITERIOS = [
  'Cumprimentou o cliente adequadamente (bom dia / boa tarde / boa noite)',
  'NUNCA usou a palavra "não" de forma seca — sempre ofereceu uma alternativa',
  'Quando não tinha o produto, ofereceu o GENÉRICO ou SIMILAR (ex.: "temos o produto X")',
  'Se o cliente não quis genérico/similar, informou quando o produto CHEGA (prazo)',
  'Foi cordial, atencioso e prestativo do início ao fim',
  'Evitou termos evasivos/negativos (acho que, talvez, para ser honesto, barato, tentar)',
  'Conduziu para uma solução / tentou fechar a venda (não deixou o cliente sem saída)',
];
const TERMOS = [
  ['não', 'negativa'], ['acho que', 'evasivo'], ['talvez', 'evasivo'],
  ['para ser honesto', 'evasivo'], ['barato', 'evasivo'], ['tentar', 'evasivo'],
];
const empresas = db.prepare('SELECT id FROM empresas').all();
const temCrit = db.prepare('SELECT 1 FROM botvendas_criterios WHERE empresa_id=? LIMIT 1');
const temTerm = db.prepare('SELECT 1 FROM botvendas_termos WHERE empresa_id=? LIMIT 1');
const insC = db.prepare("INSERT INTO botvendas_criterios (id, empresa_id, texto, peso, ativo, ordem, criado_em) VALUES (?,?,?,1,1,?,datetime('now'))");
const insT = db.prepare("INSERT INTO botvendas_termos (id, empresa_id, termo, tipo, ativo, criado_em) VALUES (?,?,?,?,1,datetime('now'))");
const insCfg = db.prepare("INSERT OR IGNORE INTO botvendas_config (empresa_id, auto, nota_alerta, atualizado_em) VALUES (?,1,6,datetime('now'))");
for (const e of empresas) {
  if (!temCrit.get(e.id)) CRITERIOS.forEach((t, i) => insC.run(uuid(), e.id, t, i));
  if (!temTerm.get(e.id)) TERMOS.forEach(([t, tp]) => insT.run(uuid(), e.id, t, tp));
  insCfg.run(e.id);
}
console.log('✅ migration 182: monitoria BotVendas (termos + config + seed de critérios/termos)');
