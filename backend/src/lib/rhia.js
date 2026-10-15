// rhia.js — motor da Rhia (IA do sistema). Base de conhecimento local + busca por relevância (RAG).
// Responde por Claude quando ANTHROPIC_API_KEY estiver configurada; senão, devolve os trechos achados.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const { v4: uuid } = require('uuid');
const db = require('../db/connection');

const PDFTOTEXT = process.env.PDFTOTEXT_PATH ||
  'C:\\Users\\joeme\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftotext.exe';
const IA_MODELO = process.env.RHIA_MODELO || 'claude-sonnet-5';

const iaHabilitada = () => !!process.env.ANTHROPIC_API_KEY;

// Quebra texto em trechos de ~900 chars respeitando parágrafos.
function chunk(texto, max = 900) {
  const paras = texto.replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out = []; let buf = '';
  for (const p of paras) {
    if ((buf + '\n' + p).length > max && buf) { out.push(buf.trim()); buf = ''; }
    buf += (buf ? '\n' : '') + p;
    while (buf.length > max * 1.5) { out.push(buf.slice(0, max).trim()); buf = buf.slice(max); }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function extrairPdf(base64) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `rhia_${Date.now()}.pdf`);
    const txt = tmp.replace(/\.pdf$/, '.txt');
    try { fs.writeFileSync(tmp, Buffer.from(base64.replace(/^data:.*?;base64,/, ''), 'base64')); } catch (e) { return reject(e); }
    execFile(PDFTOTEXT, ['-layout', tmp, txt], (err) => {
      let out = '';
      try { out = fs.readFileSync(txt, 'utf8'); } catch (_) { }
      try { fs.unlinkSync(tmp); fs.unlinkSync(txt); } catch (_) { }
      if (err && !out) return reject(new Error('Falha ao ler o PDF (poppler).'));
      resolve(out);
    });
  });
}

// Adiciona uma fonte à base e indexa os trechos.
async function adicionarFonte(empresaId, { tipo, titulo, url, texto, base64 }, criadoPor) {
  let conteudo = texto || '';
  if (tipo === 'pdf' && base64) conteudo = await extrairPdf(base64);
  if (tipo === 'imagem' && base64) {
    if (!iaHabilitada()) throw new Error('Para eu ler imagem, ative minha IA (ANTHROPIC_API_KEY no .env).');
    const lido = await lerImagem(base64);
    conteudo = (texto ? texto + '\n\n' : '') + lido; // texto opcional + o que a IA leu
  }
  if (tipo === 'audio' && !conteudo) throw new Error('Transcrição automática de áudio ainda não está disponível (precisa de um serviço de transcrição). Por ora, cole um resumo/transcrição do áudio no campo de texto.');
  if (tipo === 'link' && !conteudo) conteudo = `${titulo}\nMaterial em: ${url}`; // sem transcrição automática de vídeo
  conteudo = (conteudo || '').trim();
  if (!conteudo) throw new Error('Conteúdo vazio.');
  const trechos = chunk(conteudo);
  const fid = uuid();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO rhia_fontes (id,empresa_id,tipo,titulo,url,chars,trechos,criado_por,criado_em) VALUES (?,?,?,?,?,?,?,?,datetime(\'now\'))')
      .run(fid, empresaId, tipo, titulo || 'Sem título', url || null, conteudo.length, trechos.length, criadoPor || null);
    const ins = db.prepare('INSERT INTO rhia_chunks (id,empresa_id,fonte_id,ordem,texto) VALUES (?,?,?,?,?)');
    trechos.forEach((t, i) => ins.run(uuid(), empresaId, fid, i, t));
  });
  tx();
  return { id: fid, trechos: trechos.length, chars: conteudo.length };
}

function listarFontes(empresaId) {
  return db.prepare('SELECT id,tipo,titulo,url,chars,trechos,criado_em FROM rhia_fontes WHERE empresa_id=? ORDER BY criado_em DESC').all(empresaId);
}
function removerFonte(empresaId, id) {
  db.prepare('DELETE FROM rhia_chunks WHERE empresa_id=? AND fonte_id=?').run(empresaId, id);
  db.prepare('DELETE FROM rhia_fontes WHERE empresa_id=? AND id=?').run(empresaId, id);
  return { ok: true };
}

// Busca por relevância (TF simples sobre os termos da pergunta).
function buscar(empresaId, pergunta, n = 5) {
  const termos = (pergunta || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{3,}/g) || [];
  if (!termos.length) return [];
  const chunks = db.prepare(`SELECT c.id, c.texto, c.fonte_id, f.titulo FROM rhia_chunks c JOIN rhia_fontes f ON f.id=c.fonte_id WHERE c.empresa_id=?`).all(empresaId);
  const scored = chunks.map(c => {
    const t = c.texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let score = 0; for (const termo of termos) { const re = new RegExp('\\b' + termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); score += (t.match(re) || []).length; }
    return { ...c, score };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
  return scored;
}

// Mapa dos menus/módulos do sistema Mutti — a Rhia conhece cada um para tirar dúvidas de uso.
const MAPA_SISTEMA = `MENUS DO SISTEMA MUTTI (o que cada um faz):
• ✅ Tarefas — kanban de tarefas/pendências (muitas geradas automaticamente por outros módulos).
• 💬 Comunidade — rede social interna (posts, curtidas, comentários, enquetes, comunicados, conquistas); é a home.
• 🏅 Loja de pontos — troca os pontos da gamificação (#EuSouGrupoMutti) por brindes; e por dinheiro no Pé de Meia.
• 🏆 Campanhas / 🎯 Minhas Metas — metas e premiação por vendas; supermeta e acompanhamento do vendedor.
• 👤 Colaboradores / 🌴 Afastamentos / 🗂️ Parâmetros — cadastros de RH e configurações.
• 📅 Feriados e Escala — calendário de escala e feriados.
• 👤 Meu RH / 📄 Meus documentos — colaborador vê seus dados, holerites e dá ciência.
• 📬 Canal de escuta — ouvidoria (denúncia/sugestão/reclamação), pode ser anônimo.
• 📄 Holerites (RH) / 🎁 Benefícios — RH distribui documentos por CPF; benefícios (vale-compras, day off de aniversário, brinde por tempo de casa).
• 🧭 Painel RH / 💬 Pesquisa de clima / 🚪 Desligamentos — gestão de pessoas, clima e exit survey (eNPS).
• 🌴 Folgas / ⚠️ Ocorrências — solicitação de folga e registro de ocorrências.
• 🏦 Tesouraria — conferência de caixa/tesouraria.
• 🏬 Meu Mercado — almoxarifado interno (materiais, fardamento, brindes); NF do ERP alimenta estoque e custo; pedido com fluxo.
• 📦 Conferentes / ↩️ Devoluções — conferência de mercadoria e devolução ao fornecedor (puxa NF/fornecedor do ERP).
• 📊 Painel Gerente / 🌐 Supervisor / 💵 Premiação da equipe — indicadores ao vivo da loja, visão do supervisor, premiação da equipe.
• ⭐ Satisfação (QR) — cliente avalia a loja por QR; alimenta o NPS do gerente.
• 🧹 Checklist de Limpeza / ✅ Checklist Diário / 🔎 Checklist de Supervisão — rotinas e auditorias.
• 📣 Marketing / 🗓️ Calendário de Ações / 🏷️ Etiquetas de Preço — ações e postagens; gerador de placas de oferta (caderno do ERP ou busca, tema, de:/por:, validade, A4).
• 📝 Lista de faltas — loja registra o que faltou (código/descrição); comprador compra; confronto com pedidos do ERP.
• 🧮 Painel de Compras — comprador: estoque, remanejamento, indicadores, projeção de venda, vencidos, comprometido (CMV).
• 🤝 Acordos e Negociações — acordos/trade marketing com fornecedor (kanban + condições por dimensão, metas de compra, pagamentos, assinaturas).
• 💼 Financeiro — fluxo de caixa, DRE/DFC, orçamento projetado × realizado (por loja e rede), reajuste de despesas.
• 💊 Fórmulas — controle de entrega de fórmulas manipuladas (chegou/avisado/entregue, prazo de 3 dias após o pagamento).
• 🗄️ Patrimônio — bens da loja/administrativo; reserva/empréstimo por período, fila, devolução com assinatura.
• 🐷 Pé de Meia — poupança do colaborador (10 pontos = R$1 + vale-compras), saque 1x/ano no fim do ano.
• 🤖 Rhia — sou eu, a IA do grupo (treinada pelo Diretor).
Quando perguntarem "onde faço X" ou "como funciona o menu Y", explique com base neste mapa e no seu conhecimento.`;

const SISTEMA_RHIA = `Você é a Rhia, a inteligência do Grupo Mutti (rede de farmácias + posto, na Bahia). Você é a assistente de TODOS — do balcão à diretoria — e serve para TUDO, não é um suporte técnico.

${MAPA_SISTEMA}


Domínios em que você ajuda com segurança de especialista:
• Farmácia e atendimento: princípios ativos (DCB), referência × genérico × similar, intercambialidade, tarjas, leitura e validade de receitas, controlados (Portaria 344/1998), antimicrobianos (RDC 20/2011), interações, posologia, orientação ao cliente.
• Gestão e varejo: comercial, compras/CMV, financeiro (DRE, DFC, orçamento), RH, marketing, precificação, indicadores.
• O próprio sistema Mutti (módulos, processos, boas práticas).

Como responder:
• Sempre em português do Brasil, de forma clara, objetiva e prática. Use SEU CONHECIMENTO para responder — nunca se recuse por "não estar na base".
• Quando houver "Contexto da base de conhecimento", trate-o como material/regra OFICIAL do grupo: priorize-o e cite a fonte. Se o contexto não cobrir a pergunta, responda mesmo assim com seu conhecimento, sinalizando que é orientação geral.
• Em questões clínicas/dispensação, reforce que a decisão final e a intercambialidade cabem ao farmacêutico responsável.
• Nunca invente números internos (vendas, metas, políticas específicas do grupo) que você não tem — nesse caso oriente onde consultar no sistema.`;

const dorme = ms => new Promise(r => setTimeout(r, ms));

// Uma tentativa de chamada à API do Claude. Resolve {texto} ou {retry:true} p/ status transitório (429/5xx).
function anthropicUma({ system, messages, maxTokens }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: IA_MODELO, max_tokens: maxTokens, system, messages });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(body) },
    }, res => {
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => {
        let j = {}; try { j = JSON.parse(data); } catch (_) {}
        // O texto pode não ser o 1º bloco (o modelo pode emitir "thinking" antes). Pega o 1º bloco de texto.
        const texto = Array.isArray(j.content) ? (j.content.find(c => c && c.type === 'text' && c.text) || {}).text : null;
        if (texto) return resolve({ texto });
        const transitorio = res.statusCode === 429 || res.statusCode >= 500 || !data;
        resolve({ retry: transitorio, erro: j.error?.message || `Falha (${res.statusCode})` });
      });
    });
    req.on('error', e => resolve({ retry: true, erro: e.message }));
    req.setTimeout(45000, () => req.destroy(new Error('timeout')));
    req.write(body); req.end();
  });
}

// Chamada com até 3 tentativas (backoff) — a chave nova costuma ter limites baixos de tráfego.
async function anthropic({ system, messages, maxTokens = 1400 }) {
  let ultimo = 'Sem resposta.';
  for (let i = 0; i < 3; i++) {
    const r = await anthropicUma({ system, messages, maxTokens });
    if (r.texto) return r.texto;
    ultimo = r.erro || ultimo;
    if (!r.retry) break;
    await dorme(800 * (i + 1));
  }
  throw new Error(ultimo);
}

// Resposta da Rhia (contexto da base é opcional, reforço).
function chamarClaude(pergunta, contexto) {
  const conteudo = contexto
    ? `Contexto da base de conhecimento do grupo (priorize e cite quando usar):\n\n${contexto}\n\n---\nPergunta: ${pergunta}`
    : pergunta;
  return anthropic({ system: SISTEMA_RHIA, messages: [{ role: 'user', content: conteudo }], maxTokens: 1400 });
}

// Lê uma imagem (visão do Claude) e extrai o conteúdo como texto de conhecimento.
function lerImagem(base64) {
  const m = /^data:(.*?);base64,(.*)$/.exec(base64 || '');
  const media = (m && m[1]) || 'image/png';
  const dados = m ? m[2] : (base64 || '').replace(/^data:.*?;base64,/, '');
  return anthropic({
    system: 'Você extrai conhecimento de imagens de forma fiel e completa, em português do Brasil. Transcreva textos, tabelas, valores, instruções e o que estiver visível; não invente.',
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: media, data: dados } },
      { type: 'text', text: 'Extraia e organize TODO o conteúdo útil desta imagem (texto, tabela, dados, passos). Isso vai virar material de conhecimento da Rhia.' },
    ] }], maxTokens: 1800,
  });
}

// ── Gerador de conteúdo de marketing (posts/criativos/campanhas) — usa o Claude ──
const SISTEMA_MKT = `Você é o especialista de marketing do Grupo Mutti, uma rede de farmácias e drogarias na Bahia (marcas Mutti, Ultra, Farma Rocha, Posto de Medicamentos).
Você cria conteúdo para redes sociais (Instagram feed/story, WhatsApp status) e campanhas promocionais.
Tom: próximo, acolhedor, confiável e saudável — como uma farmácia de bairro que cuida das pessoas. Use emojis com moderação e linguagem do dia a dia baiano sem exagero.
Regras OBRIGATÓRIAS (publicidade de saúde): nunca prometa cura ou resultado garantido; não incentive automedicação; para medicamentos tarja/controlados lembre "venda sob prescrição" quando fizer sentido; foque em preço, conveniência, cuidado e confiança.
Responda SEMPRE e SOMENTE com um JSON válido (sem texto antes ou depois, sem crases), no formato:
{"legendas":["3 variações de legenda prontas para postar, com CTA"],"hashtags":["#..."],"ideiaCriativo":"descrição do visual do criativo (o que aparece na arte)","sugestaoCampanha":"quando/onde postar e ideia de sequência","dica":"1 dica curta de melhoria"}`;

function extrairJson(txt) {
  if (!txt) return null;
  let s = txt.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { return null; }
}

async function gerarMarketing(empresaId, { objetivo, produtos, canal, tom, data, extra } = {}) {
  if (!iaHabilitada()) throw new Error('Para gerar conteúdo, ative minha IA (ANTHROPIC_API_KEY no .env).');
  const linhasProd = (Array.isArray(produtos) ? produtos : []).filter(p => p && (p.nome || p.descricao))
    .map(p => `- ${p.nome || p.descricao}${p.de ? ` (de R$${p.de}` : ''}${p.por ? ` por R$${p.por})` : (p.de ? ')' : '')}${p.validade ? ` — válido até ${p.validade}` : ''}`).join('\n');
  const partes = [
    objetivo ? `Objetivo/tema: ${objetivo}` : 'Objetivo: post promocional para atrair clientes à farmácia.',
    canal ? `Canal: ${canal}` : 'Canal: Instagram (feed).',
    tom ? `Tom desejado: ${tom}` : null,
    data ? `Data/ocasião: ${data}` : null,
    linhasProd ? `Produtos/ofertas em destaque:\n${linhasProd}` : null,
    extra ? `Observações: ${extra}` : null,
  ].filter(Boolean).join('\n');
  const txt = await anthropic({ system: SISTEMA_MKT, messages: [{ role: 'user', content: partes }], maxTokens: 1600 });
  const j = extrairJson(txt);
  if (!j) return { ok: true, bruto: txt, legendas: [txt], hashtags: [], ideiaCriativo: '', sugestaoCampanha: '', dica: '' };
  return {
    ok: true,
    legendas: Array.isArray(j.legendas) ? j.legendas : (j.legenda ? [j.legenda] : []),
    hashtags: Array.isArray(j.hashtags) ? j.hashtags : [],
    ideiaCriativo: j.ideiaCriativo || j.criativo || '',
    sugestaoCampanha: j.sugestaoCampanha || j.campanha || '',
    dica: j.dica || '',
  };
}

async function perguntar(empresaId, pergunta, colaboradorId) {
  const achados = buscar(empresaId, pergunta);
  let resposta, usouIa = false;
  const fontes = [...new Map(achados.map(a => [a.fonte_id, { id: a.fonte_id, titulo: a.titulo }])).values()];
  if (iaHabilitada()) {
    // Responde SEMPRE pela própria inteligência; a base entra como contexto quando existir.
    try {
      const contexto = achados.length ? achados.map(a => `[Fonte: ${a.titulo}]\n${a.texto}`).join('\n\n') : '';
      resposta = await chamarClaude(pergunta, contexto); usouIa = true;
    } catch (e) {
      resposta = achados.length
        ? 'Tive um problema para redigir agora. Enquanto isso, trechos relacionados na base:\n\n' + achados.map(a => `• (${a.titulo}) ${a.texto.slice(0, 300)}…`).join('\n\n')
        : 'Tive um problema para consultar a IA agora. Tente de novo em instantes.';
    }
  } else if (achados.length) {
    resposta = 'Trechos mais relevantes da base (IA não ativada — o Diretor precisa definir a ANTHROPIC_API_KEY para eu redigir as respostas):\n\n'
      + achados.map(a => `📄 ${a.titulo}\n${a.texto.slice(0, 500)}${a.texto.length > 500 ? '…' : ''}`).join('\n\n');
  } else {
    resposta = 'Minha IA ainda não está ativada (falta a ANTHROPIC_API_KEY) e não há material na base sobre isso. Peça ao Diretor para me ativar — aí eu respondo qualquer coisa, de farmácia à gestão.';
  }
  const cid = uuid();
  db.prepare('INSERT INTO rhia_conversas (id,empresa_id,colaborador_id,pergunta,resposta,fontes,usou_ia,criado_em) VALUES (?,?,?,?,?,?,?,datetime(\'now\'))')
    .run(cid, empresaId, colaboradorId || null, pergunta, resposta, JSON.stringify(fontes), usouIa ? 1 : 0);
  return { id: cid, resposta, fontes, usouIa, iaHabilitada: iaHabilitada() };
}

function feedback(empresaId, id, util) {
  db.prepare('UPDATE rhia_conversas SET util=? WHERE id=? AND empresa_id=?').run(util ? 1 : 0, id, empresaId);
  return { ok: true };
}

// Pacote base de referência farmacêutica (conceitos gerais — a gestão pode complementar/corrigir).
const SEED_FARMA = [
  { titulo: 'Referência × Genérico × Similar', texto: `MEDICAMENTO DE REFERÊNCIA: produto inovador, registrado e comercializado com marca, cuja eficácia e segurança foram comprovadas cientificamente no registro (ex.: o original de marca).
MEDICAMENTO GENÉRICO (Lei 9.787/1999): tem o mesmo princípio ativo, dose, forma farmacêutica e via de administração do referência; comprova bioequivalência/equivalência terapêutica; NÃO tem marca — é vendido pelo nome do princípio ativo (DCB). Embalagem traz tarja amarela com a letra "G" e a frase "Medicamento Genérico - Lei 9.787". É INTERCAMBIÁVEL com o referência (pode substituir, com anuência do farmacêutico).
MEDICAMENTO SIMILAR: mesmo princípio ativo, concentração, forma e via do referência, mas é vendido COM marca (nome comercial). Desde 2014 os similares também passam por testes de equivalência/bioequivalência e podem ser intercambiáveis quando a Anvisa indica. Diferença prática p/ o cliente: genérico não tem marca (mais barato em geral); similar tem marca.` },
  { titulo: 'Como ler uma receita médica', texto: `Elementos que uma receita válida deve ter: 1) Identificação do prescritor (nome, CRM/registro, endereço/telefone); 2) Nome e dados do paciente; 3) Medicamento (nome, concentração), forma farmacêutica e quantidade; 4) Posologia (dose, intervalo, duração — ex.: "1 comprimido de 8/8h por 7 dias"); 5) Data; 6) Assinatura do prescritor.
Abreviações comuns: 1cp = 1 comprimido; VO = via oral; 8/8h = a cada 8 horas; SOS = se necessário; ml = mililitros; gts = gotas; jejum; ACM = a critério médico.
Tipos de receita: RECEITA BRANCA COMUM (1 via) — medicamentos tarja vermelha "venda sob prescrição"; validade em geral 30 dias. RECEITA DE CONTROLE ESPECIAL (branca, 2 vias) — antimicrobianos e alguns tarja vermelha de controle. RECEITA AZUL (Notificação B) — psicotrópicos. RECEITA AMARELA (Notificação A) — entorpecentes. Antibióticos exigem retenção de receita (RDC 20/2011).` },
  { titulo: 'Tarjas e venda de medicamentos', texto: `TARJA VERMELHA: "Venda sob prescrição médica" — exige receita; pode ter retenção conforme a substância. TARJA PRETA: medicamentos de controle especial (psicotrópicos/entorpecentes, Portaria 344/1998) — exigem notificação de receita (azul B / amarela A) e escrituração no SNGPC. SEM TARJA (MIP/OTC): medicamento isento de prescrição, venda livre.
No balcão: conferir se a receita está válida e legível, checar interações/duplicidade quando possível, orientar posologia, e reter a via quando a lei exige. Em dúvida sobre substituição por genérico/similar, o farmacêutico decide a intercambialidade.` },
  { titulo: 'Pesquisa de substância/princípio ativo', texto: `Para pesquisar um medicamento por substância: o princípio ativo (DCB - Denominação Comum Brasileira) é o nome científico (ex.: dipirona sódica, amoxicilina, losartana potássica). Um mesmo princípio ativo pode ter vários produtos (referência, genérico e similares de marcas diferentes). Ao atender, se o cliente traz a marca, é possível oferecer o genérico do mesmo princípio ativo (mais econômico) com orientação do farmacêutico. Sempre confira concentração (mg) e forma (comprimido, cápsula, solução) para não trocar por algo diferente.` },
];
function seedFarma(empresaId, criadoPor) {
  let n = 0;
  for (const s of SEED_FARMA) {
    const existe = db.prepare('SELECT 1 FROM rhia_fontes WHERE empresa_id=? AND titulo=?').get(empresaId, s.titulo);
    if (existe) continue;
    // reutiliza o pipeline síncrono de chunk
    const trechos = chunk(s.texto);
    const fid = uuid();
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO rhia_fontes (id,empresa_id,tipo,titulo,chars,trechos,criado_por,criado_em) VALUES (?,?,?,?,?,?,?,datetime(\'now\'))')
        .run(fid, empresaId, 'texto', s.titulo, s.texto.length, trechos.length, criadoPor || null);
      const ins = db.prepare('INSERT INTO rhia_chunks (id,empresa_id,fonte_id,ordem,texto) VALUES (?,?,?,?,?)');
      trechos.forEach((t, i) => ins.run(uuid(), empresaId, fid, i, t));
    });
    tx(); n++;
  }
  return { ok: true, adicionadas: n };
}

// Semeia o mapa do sistema como fonte (útil no modo sem IA; com IA a Rhia já conhece pelo perfil).
function seedSistema(empresaId, criadoPor) {
  const titulo = 'Como o sistema Mutti funciona (menu a menu)';
  db.prepare('DELETE FROM rhia_chunks WHERE empresa_id=? AND fonte_id IN (SELECT id FROM rhia_fontes WHERE empresa_id=? AND titulo=?)').run(empresaId, empresaId, titulo);
  db.prepare('DELETE FROM rhia_fontes WHERE empresa_id=? AND titulo=?').run(empresaId, titulo);
  const trechos = chunk(MAPA_SISTEMA, 700);
  const fid = uuid();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO rhia_fontes (id,empresa_id,tipo,titulo,chars,trechos,criado_por,criado_em) VALUES (?,?,?,?,?,?,?,datetime(\'now\'))')
      .run(fid, empresaId, 'texto', titulo, MAPA_SISTEMA.length, trechos.length, criadoPor || null);
    const ins = db.prepare('INSERT INTO rhia_chunks (id,empresa_id,fonte_id,ordem,texto) VALUES (?,?,?,?,?)');
    trechos.forEach((t, i) => ins.run(uuid(), empresaId, fid, i, t));
  });
  tx();
  return { ok: true, trechos: trechos.length };
}

module.exports = { adicionarFonte, listarFontes, removerFonte, perguntar, feedback, iaHabilitada, seedFarma, seedSistema, gerarMarketing, anthropic, extrairJson };
