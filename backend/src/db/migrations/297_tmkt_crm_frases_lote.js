// 297_tmkt_crm_frases_lote.js — mais frases de efeito ORIGINAIS da Mutti (voz própria, apelo digital/
// comunidade/jornada de cuidado) pro banco do CRM. Idempotente: só insere a que ainda não existe (por texto).
const db = require('../connection');
const uuid = () => require('crypto').randomUUID();
const EMP = 'empresa-mutti-001';

const novas = [
  ['A conversa do bairro já começou. A {marca} entra agora?', 'Conteúdo que o nosso cliente assiste, comenta e compartilha todo dia.'],
  ['O que todo mundo aqui comenta pode levar a {marca} junto.', 'Viralizar no bairro é a nossa especialidade — e o produto fica no centro da cena.'],
  ['A {marca} na trend que o nosso cliente já segue.', 'Meme, bastidor e dica: conteúdo real que gera conversa de verdade.'],
  ['Do corredor da loja pro feed do cliente.', 'A {marca} presente onde a decisão de compra realmente acontece.'],
  ['Aqui a marca não interrompe o conteúdo — ela é o conteúdo.', 'Aparição natural nos vídeos que viralizam no @farmaciamutti_.'],
  ['Quando a Mutti grava, o bairro inteiro assiste.', 'Alcance local de verdade, com engajamento acima do varejo farmacêutico.'],
  ['A {marca} no momento em que o cliente decide.', 'On e off juntos: loja, delivery e digital na mesma jornada de cuidado.'],
  ['Viralizou? A {marca} pode estar lá.', 'Conteúdo que rende curtida, comentário e, no fim, venda medida por loja.'],
  ['Mais que uma oferta: uma participação na rotina do cliente.', 'A {marca} na jornada de cuidado, do começo ao carrinho.'],
  ['O público certo, na linguagem certa, com a {marca} no centro.', 'Conteúdo feito por perfil — bebê, 60+, beleza, crônico.'],
  ['A {marca} que o cliente vê, lembra e leva.', 'Presença real na loja e nas redes, com sell-out antes × depois.'],
  ['Cuidado que vira conteúdo. Conteúdo que vira venda.', 'A {marca} no meio dessa história, com resultado que você mede de verdade.'],
];

let n = 0;
const base = db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM tmkt_crm_frase WHERE empresa_id=?').get(EMP).m;
const existe = db.prepare('SELECT 1 FROM tmkt_crm_frase WHERE empresa_id=? AND texto=?');
const ins = db.prepare(`INSERT INTO tmkt_crm_frase (id,empresa_id,texto,sub,ordem,ativo,criado_em) VALUES (?,?,?,?,?,1,datetime('now'))`);
novas.forEach((f, i) => { if (!existe.get(EMP, f[0])) { ins.run(uuid(), EMP, f[0], f[1], base + 1 + i); n++; } });
console.log(`✅ migration 297: +${n} frase(s) original(is) da Mutti no banco`);
