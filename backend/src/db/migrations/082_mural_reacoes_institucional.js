// 082 — Reações com emoji no mural + documentos institucionais (regimento/conduta).
const db = require('../connection');
console.log('▶ Migração 082 — reações emoji + institucional');

// Reação: uma por pessoa/post, com o emoji escolhido (curtidas vira "reações").
const cols = db.prepare('PRAGMA table_info(mural_curtidas)').all().map(c => c.name);
if (!cols.includes('emoji')) {
  db.exec(`ALTER TABLE mural_curtidas ADD COLUMN emoji TEXT DEFAULT '❤️'`);
  console.log("  + mural_curtidas.emoji");
} else { console.log('  = mural_curtidas.emoji já existe'); }

// Comentário com foto (opcional).
const cc = db.prepare('PRAGMA table_info(mural_comentarios)').all().map(c => c.name);
if (!cc.includes('imagem')) {
  db.exec(`ALTER TABLE mural_comentarios ADD COLUMN imagem TEXT`);
  console.log('  + mural_comentarios.imagem');
} else { console.log('  = mural_comentarios.imagem já existe'); }

// Documentos institucionais (Regimento Interno, Código de Conduta) editáveis pela gestão.
db.exec(`
CREATE TABLE IF NOT EXISTS mural_institucional (
  empresa_id TEXT NOT NULL,
  chave TEXT NOT NULL,              -- 'regimento' | 'conduta'
  titulo TEXT,
  conteudo TEXT,
  atualizado_por TEXT,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, chave)
);`);

// Semente dos títulos (conteúdo em branco p/ a gestão preencher).
const emp = db.prepare('SELECT DISTINCT empresa_id FROM lojas').all();
const seed = db.prepare(`INSERT OR IGNORE INTO mural_institucional (empresa_id,chave,titulo,conteudo,atualizado_em) VALUES (?,?,?,?,datetime('now'))`);
for (const e of emp) {
  seed.run(e.empresa_id, 'regimento', 'Regimento Interno', '');
  seed.run(e.empresa_id, 'conduta', 'Código de Conduta', '');
}
console.log('  + mural_institucional (regimento/conduta)');
console.log('✓ Migração 082 concluída.');
