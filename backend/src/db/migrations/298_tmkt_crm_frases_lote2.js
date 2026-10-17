// 298_tmkt_crm_frases_lote2.js — mais frases originais da Mutti (pegada provocativa/energética,
// "virar assunto no bairro"). Idempotente (não duplica por texto).
const db = require('../connection');
const uuid = () => require('crypto').randomUUID();
const EMP = 'empresa-mutti-001';
const novas = [
  ['Sabe aquele vídeo que todo mundo mandou no grupo do zap? Pode ser o da {marca}.', 'Conteúdo que roda o bairro inteiro — e leva a sua marca junto.'],
  ['A {marca} já pensou em virar assunto no bairro?', 'A gente transforma oferta em conversa, e conversa em venda medida por loja.'],
  ['E se a próxima trend da cidade tivesse a {marca} no meio?', 'Trend, meme e bastidor da loja — com o produto em destaque.'],
  ['O que o bairro comenta hoje, a {marca} patrocina amanhã.', 'Presença no conteúdo que o nosso cliente já consome todo dia.'],
  ['Tem vídeo nosso que o cliente assiste até o fim. A {marca} pode estar nele.', 'Alcance local real, no ritmo e na linguagem de quem compra na Mutti.'],
];
const base = db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM tmkt_crm_frase WHERE empresa_id=?').get(EMP).m;
const existe = db.prepare('SELECT 1 FROM tmkt_crm_frase WHERE empresa_id=? AND texto=?');
const ins = db.prepare(`INSERT INTO tmkt_crm_frase (id,empresa_id,texto,sub,ordem,ativo,criado_em) VALUES (?,?,?,?,?,1,datetime('now'))`);
let n = 0;
novas.forEach((f, i) => { if (!existe.get(EMP, f[0])) { ins.run(uuid(), EMP, f[0], f[1], base + 1 + i); n++; } });
console.log(`✅ migration 298: +${n} frase(s) original(is)`);
