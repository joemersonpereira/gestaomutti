// 192_taxa_contratada_filial.js — a taxa é negociada POR FILIAL e por FAIXA de parcelamento
// (cada CNPJ tem seu credenciamento, e o contrato dá "2 a 6x" e "7 a 12x", não um valor por parcela).
// A tabela da 191 guardava um número solto por parcela; esta refaz no formato certo.
const db = require('../connection');

const existe = t => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

// só recria se ainda estiver no formato antigo (sem loja_id)
if (existe('conc_taxa_contratada') && !cols('conc_taxa_contratada').includes('loja_id')) {
  const antigas = db.prepare('SELECT * FROM conc_taxa_contratada').all();
  db.exec('DROP TABLE conc_taxa_contratada');
  db.exec(`CREATE TABLE conc_taxa_contratada (
    empresa_id    TEXT,
    operadora     TEXT,
    loja_id       TEXT,        -- '*' = vale para todas as filiais
    bandeira      TEXT,        -- '*' = vale para todas as bandeiras
    grupo         TEXT,        -- DEBITO | CREDITO | PARCELADO | VOUCHER | PIX
    parcela_ini   INTEGER,     -- faixa de parcelamento (0/0 quando não se aplica)
    parcela_fim   INTEGER,
    taxa          REAL,
    vigencia_ini  TEXT,
    atualizado_em TEXT,
    PRIMARY KEY (empresa_id, operadora, loja_id, bandeira, grupo, parcela_ini, parcela_fim)
  )`);
  // o que existia vira taxa "para todas as filiais"
  const ins = db.prepare(`INSERT OR IGNORE INTO conc_taxa_contratada
    (empresa_id, operadora, loja_id, bandeira, grupo, parcela_ini, parcela_fim, taxa, vigencia_ini, atualizado_em)
    VALUES (?,?,'*',?,?,?,?,?,?,datetime('now'))`);
  for (const t of antigas) {
    const p = Number(t.parcelas) || 0;
    ins.run(t.empresa_id, t.operadora, t.bandeira, t.grupo, p, p, t.taxa, t.vigencia_ini);
  }
  console.log(`   ${antigas.length} taxa(s) antiga(s) migrada(s) como "todas as filiais"`);
} else if (!existe('conc_taxa_contratada')) {
  db.exec(`CREATE TABLE conc_taxa_contratada (
    empresa_id    TEXT, operadora TEXT, loja_id TEXT, bandeira TEXT, grupo TEXT,
    parcela_ini   INTEGER, parcela_fim INTEGER, taxa REAL, vigencia_ini TEXT, atualizado_em TEXT,
    PRIMARY KEY (empresa_id, operadora, loja_id, bandeira, grupo, parcela_ini, parcela_fim)
  )`);
}

console.log('✅ migration 192: taxa contratada por filial e por faixa de parcelamento');
