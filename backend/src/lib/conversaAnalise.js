// conversaAnalise.js — motor de análise de conversas do atendimento (bot de vendas).
// Recebe as mensagens já normalizadas e sinaliza, por ATENDENTE:
//  (a) frases negativas / de ruptura  ("não tem", "em falta", "encomenda"…)
//  (b) abertura fria (1ª msg do atendente sem saudação humanizada)
//  (c) fechamento sem cordialidade (última msg do atendente sem agradecer/despedir)
// É heurística de palavra/frase (determinística) — não usa IA. Independe da fonte dos dados.

// normaliza: minúsculo, sem acento, espaços colapsados
function norm(t) {
  return (t || '').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Frases negativas / de ruptura de venda (o Joe listou; dá p/ ampliar).
const FRASES_NEGATIVAS = [
  'nao tem', 'nao temos', 'nao ha', 'esta em falta', 'em falta', 'sem estoque', 'estamos sem',
  'acabou', 'encomenda', 'sob encomenda', 'podemos pedir pra chegar', 'pedir pra chegar',
  'infelizmente nao', 'infelizmente', 'nao trabalhamos com', 'nao temos esse', 'nao dispomos',
];
// Saudações que caracterizam abertura humanizada.
const SAUDACOES = [
  'bom dia', 'boa tarde', 'boa noite', 'ola', 'oi', 'tudo bem', 'seja bem', 'bem vindo', 'bem vinda',
  'como vai', 'como posso ajudar', 'em que posso', 'prazer',
];
// Termos de cordialidade no fechamento.
const CORDIALIDADE = [
  'obrigad', 'agradec', 'volte sempre', 'a disposicao', 'estamos a disposicao', 'qualquer coisa',
  'ate logo', 'ate mais', 'tenha um', 'bom dia', 'boa tarde', 'boa noite', 'fico a disposicao',
  'precisando', 'conte comigo', 'abraco', 'ficamos por aqui',
];

// classifica UM texto: quais frases negativas contém.
function frasesNegativasEm(texto) {
  const t = norm(texto);
  return FRASES_NEGATIVAS.filter(f => t.includes(f));
}
const temSaudacao = texto => { const t = norm(texto); return SAUDACOES.some(s => t.includes(s)); };
const temCordialidade = texto => { const t = norm(texto); return CORDIALIDADE.some(s => t.includes(s)); };

// Analisa UMA conversa. Espera:
//   { atendente, atendenteId, mensagens: [{ de:'atendente'|'cliente'|'bot', texto, data }] }
// Considera só as mensagens do ATENDENTE (humano). Retorna sinais dessa conversa.
function analisarConversa(conversa) {
  const msgs = (conversa.mensagens || []).filter(m => m && m.texto);
  const doAtendente = msgs.filter(m => m.de === 'atendente');
  if (!doAtendente.length) return null; // sem fala do atendente → não avalia
  const negativas = [];
  for (const m of doAtendente) for (const f of frasesNegativasEm(m.texto)) negativas.push(f);
  const primeira = doAtendente[0].texto;
  const ultima = doAtendente[doAtendente.length - 1].texto;
  return {
    atendente: conversa.atendente || '—',
    atendenteId: conversa.atendenteId || null,
    negativas,                                   // lista de frases negativas encontradas
    aberturaFria: !temSaudacao(primeira),        // 1ª fala sem saudação
    fechamentoSemCordialidade: !temCordialidade(ultima), // última fala sem agradecer/despedir
  };
}

// Agrega várias conversas por atendente.
function analisarConversas(conversas) {
  const porAtend = new Map();
  let totalConversas = 0;
  for (const c of conversas) {
    const r = analisarConversa(c);
    if (!r) continue;
    totalConversas++;
    const k = r.atendenteId || r.atendente;
    if (!porAtend.has(k)) porAtend.set(k, {
      atendente: r.atendente, atendenteId: r.atendenteId,
      conversas: 0, negativas: 0, frasesNegativas: {}, aberturasFrias: 0, fechamentosSecos: 0,
    });
    const a = porAtend.get(k);
    a.conversas++;
    a.negativas += r.negativas.length;
    for (const f of r.negativas) a.frasesNegativas[f] = (a.frasesNegativas[f] || 0) + 1;
    if (r.aberturaFria) a.aberturasFrias++;
    if (r.fechamentoSemCordialidade) a.fechamentosSecos++;
  }
  const atendentes = [...porAtend.values()].map(a => ({
    ...a,
    pctFrio: a.conversas ? Math.round(100 * a.aberturasFrias / a.conversas) : 0,
    pctSeco: a.conversas ? Math.round(100 * a.fechamentosSecos / a.conversas) : 0,
    topFrases: Object.entries(a.frasesNegativas).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([f, n]) => ({ frase: f, n })),
  })).sort((x, y) => (y.negativas + y.aberturasFrias + y.fechamentosSecos) - (x.negativas + x.aberturasFrias + x.fechamentosSecos));
  return { totalConversas, atendentes };
}

module.exports = { analisarConversa, analisarConversas, frasesNegativasEm, temSaudacao, temCordialidade, FRASES_NEGATIVAS };
