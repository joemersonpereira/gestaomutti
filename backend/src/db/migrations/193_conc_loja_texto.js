// 193_conc_loja_texto.js — de-para "nome da loja como a credenciadora escreve no arquivo" → loja do ERP.
// Existe porque a Le Card manda um único arquivo com VÁRIAS lojas misturadas (uma coluna "Loja" por
// linha, sem CNPJ) — sem este de-para, o import usava a loja escolhida no upload pra TODAS as linhas,
// o que quebra o casamento (NSU/valor+dia são indexados por loja) e gera "aguardando relatório" falso.
const db = require('../connection');

const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
const addCol = (t, col, tipo) => { if (!cols(t).includes(col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${tipo}`); };

// guarda o texto bruto da loja como veio no arquivo — permite reprocessar um lote já importado
// (reatribuir a loja certa) sem precisar pedir o arquivo de novo pro usuário.
addCol('conc_item', 'loja_arquivo', 'TEXT');

db.exec(`CREATE TABLE IF NOT EXISTS conc_loja_texto (
  empresa_id    TEXT,
  operadora     TEXT,
  texto         TEXT,     -- normalizado: minúsculo, sem acento (chave())
  texto_original TEXT,
  uni_erp       INTEGER,
  loja_id       TEXT,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, operadora, texto)
)`);

console.log('✅ migration 193: conc_loja_texto (de-para loja-no-arquivo → loja do ERP) + conc_item.loja_arquivo');
