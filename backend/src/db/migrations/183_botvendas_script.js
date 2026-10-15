// 183_botvendas_script.js — referência de SCRIPT (RAV) p/ a IA valorizar frases positivas +
// semente de termos POSITIVOS (frases recomendadas) que, se usadas, contam a favor do vendedor.
const db = require('../connection');
const { v4: uuid } = require('uuid');

const cols = db.prepare("PRAGMA table_info(botvendas_config)").all().map(c => c.name);
if (!cols.includes('script_ref')) db.exec("ALTER TABLE botvendas_config ADD COLUMN script_ref TEXT");

// Frases/termos POSITIVOS do bom atendimento (RAV). Reconhecidos na conversa contam como acerto.
const POSITIVOS = [
  'bom dia', 'boa tarde', 'boa noite', 'meu nome é', 'me chamo', 'como posso te ajudar',
  'posso te ajudar', 'temos o', 'temos sim', 'à disposição', 'fico à disposição',
  'por gentileza', 'por favor', 'obrigado', 'obrigada', 'com certeza', 'perfeito',
  'vou verificar', 'já verifico', 'chega no dia', 'chega dia', 'podemos entregar', 'seja bem-vindo', 'seja bem-vinda',
];
const empresas = db.prepare('SELECT id FROM empresas').all();
const jaTem = db.prepare("SELECT 1 FROM botvendas_termos WHERE empresa_id=? AND tipo='positivo' LIMIT 1");
const insT = db.prepare("INSERT INTO botvendas_termos (id, empresa_id, termo, tipo, ativo, criado_em) VALUES (?,?,?,'positivo',1,datetime('now'))");
for (const e of empresas) if (!jaTem.get(e.id)) POSITIVOS.forEach(t => insT.run(uuid(), e.id, t));

console.log('✅ migration 183: script_ref + termos positivos (RAV) semeados');
