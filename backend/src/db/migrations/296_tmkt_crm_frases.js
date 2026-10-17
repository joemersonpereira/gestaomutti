// 296_tmkt_crm_frases.js — banco de FRASES DE EFEITO do CRM (pra cada ação/plano/espaço escolher
// uma frase diferente, ou aleatória). Idempotente + seed guardado (só se vazio).
const db = require('../connection');
const uuid = () => require('crypto').randomUUID();

db.exec(`CREATE TABLE IF NOT EXISTS tmkt_crm_frase (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  texto TEXT NOT NULL,   -- título (aceita {marca})
  sub TEXT,              -- subtítulo/intro (aceita {marca})
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, criado_em TEXT
)`);
const addCol = (t, c, ddl) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };
addCol('tmkt_crm_outreach', 'frase_id', 'frase_id TEXT');  // null = aleatória

const EMP = 'empresa-mutti-001';
const qtd = db.prepare('SELECT COUNT(*) c FROM tmkt_crm_frase WHERE empresa_id=?').get(EMP).c;
if (!qtd) {
  const seed = [
    ['O que a Mutti posta vira conversa. E a {marca} pode estar no meio dela.', 'Os nossos conteúdos viralizam e viram meme — o cliente assiste, comenta e compartilha.'],
    ['Os nossos vídeos viram meme. A {marca} pode ser a próxima estrela.', 'Conteúdo que o bairro inteiro assiste, com o produto no centro da cena.'],
    ['O bairro inteiro assiste. E a {marca} no centro da cena.', 'Trend, meme e muita gente engajada no @farmaciamutti_.'],
    ['Aqui a {marca} não contrata visibilidade — entra na conversa.', 'Presença no ponto certo da jornada de cuidado: na loja, no delivery e no digital.'],
    ['Da gôndola pro feed: a {marca} na jornada de cuidado.', 'On e off andando juntos, com sell-out medido de verdade.'],
    ['Quando pedem pra caprichar, a {marca} aparece.', 'Os nossos conteúdos colocam o produto em destaque — e viralizam.'],
    ['A conversa do bairro já rola. A {marca} não vai querer ficar de fora.', 'Conteúdo que viraliza + presença real na loja = a sua marca no momento certo.'],
  ];
  const ins = db.prepare(`INSERT INTO tmkt_crm_frase (id,empresa_id,texto,sub,ordem,ativo,criado_em) VALUES (?,?,?,?,?,1,datetime('now'))`);
  seed.forEach((f, i) => ins.run(uuid(), EMP, f[0], f[1], i));
  console.log(`  seed: ${seed.length} frases`);
}
console.log('✅ migration 296: tmkt_crm_frase (banco de frases) + tmkt_crm_outreach.frase_id');
