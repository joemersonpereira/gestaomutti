// botvendasMonitoria.js — monitoria de atendimento por IA (Claude/Rhia) + scan de termos proibidos.
// Filosofia da empresa: NUNCA dizer "não" seco; faltando o produto, oferecer genérico/similar ou
// informar quando chega; cordialidade; evitar termos evasivos. Roda automático ao fechar o atendimento.
const db = require('../db/connection');
const { v4: uuid } = require('uuid');
const sync = require('./botvendasSync');
const rhia = require('./rhia');

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function getConfig(empresaId) {
  return db.prepare('SELECT * FROM botvendas_config WHERE empresa_id=?').get(empresaId) || { auto: 1, nota_alerta: 6 };
}
function criteriosAtivos(empresaId) {
  return db.prepare('SELECT texto, peso FROM botvendas_criterios WHERE empresa_id=? AND ativo=1 ORDER BY ordem').all(empresaId);
}
function termosAtivos(empresaId) {
  return db.prepare('SELECT termo, tipo FROM botvendas_termos WHERE empresa_id=? AND ativo=1').all(empresaId);
}

// Varre as mensagens do ATENDENTE procurando cada termo proibido (sem acento, por palavra/expressão).
function escanearTermos(mensagens, termos) {
  const falas = (mensagens || []).filter(m => m.direcao === 'sent' && m.tipo !== 'note' && norm(m.remetente) !== 'sistema' && (m.texto || '').trim());
  const achados = [];
  for (const t of termos) {
    const alvo = norm(t.termo);
    if (!alvo) continue;
    const re = new RegExp('\\b' + alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
    let ocorr = 0; const trechos = [];
    for (const m of falas) {
      const txt = norm(m.texto);
      const n = (txt.match(re) || []).length;
      if (n > 0) { ocorr += n; if (trechos.length < 3) trechos.push((m.texto || '').trim().slice(0, 120)); }
    }
    if (ocorr > 0) achados.push({ termo: t.termo, tipo: t.tipo, ocorrencias: ocorr, trechos });
  }
  return achados;
}

// Monta e chama o Claude para avaliar a conversa contra os critérios.
async function avaliarComIA(empresaId, conversaTexto, criterios, termos, scriptRef) {
  const listaCrit = criterios.map((c, i) => `${i + 1}. ${c.texto}`).join('\n');
  const negativos = termos.filter(t => t.tipo !== 'positivo').map(t => `"${t.termo}"`).join(', ');
  const positivos = termos.filter(t => t.tipo === 'positivo').map(t => `"${t.termo}"`).join(', ');
  const system = `Você é um MONITOR DE QUALIDADE de atendimento de uma rede de farmácias. Avalie a conversa entre ATENDENTE e CLIENTE seguindo RIGOROSAMENTE a filosofia da empresa (baseada no método RAV):
- Escreva/atenda com português correto: SEM abreviaturas (vc, oq, pq), SEM gírias (mano, cara), SEM erros e SEM pontuação exagerada (!!!, ???).
- Cumprimente e SE APRESENTE (diga o nome) e trate o cliente PELO NOME. Foco no cliente, não no produto.
- O atendente NUNCA deve dizer "não" de forma seca (ex.: "não temos"). Sempre deve oferecer uma alternativa: o GENÉRICO ou o SIMILAR ("temos o produto X").
- Se o cliente não quiser genérico/similar, o atendente deve informar QUANDO o produto chega (prazo), nunca só negar.
- EVITAR termos evasivos/negativos: ${negativos || '—'}.
- VALORIZAR o uso de expressões do bom atendimento: ${positivos || '—'}.
${scriptRef ? '\nSCRIPT DE REFERÊNCIA DA EMPRESA (o atendente deve seguir este estilo — valorize quando usar frases parecidas):\n' + String(scriptRef).slice(0, 6000) + '\n' : ''}
Seja específico e cite trechos reais. Responda SOMENTE com um JSON válido, sem texto fora dele.`;
  const user = `CRITÉRIOS A AVALIAR:\n${listaCrit}\n\nCONVERSA:\n${conversaTexto.slice(0, 12000)}\n\nResponda no formato JSON:\n{"nota": <0 a 10>, "resumo": "1-2 frases objetivas", "itens": [{"criterio": "texto do critério", "ok": true|false, "obs": "o que faltou ou foi bem, citando trecho"}], "pontos_fortes": "…", "pontos_fracos": "…"}`;
  const txt = await rhia.anthropic({ system, messages: [{ role: 'user', content: user }], maxTokens: 1500 });
  const j = rhia.extrairJson(txt) || {};
  return {
    nota: j.nota != null ? Math.max(0, Math.min(10, Number(j.nota))) : null,
    resumo: (j.resumo || '').toString().slice(0, 500),
    itens: Array.isArray(j.itens) ? j.itens.slice(0, 20) : [],
    pontos_fortes: (j.pontos_fortes || '').toString().slice(0, 600),
    pontos_fracos: (j.pontos_fracos || '').toString().slice(0, 600),
  };
}

// Avalia UM atendimento: baixa a conversa, escaneia termos, chama a IA, grava e (se ruim) alerta o gerente.
async function avaliarAtendimento(empresaId, orderId, { auto = false } = {}) {
  if (!rhia.iaHabilitada || !rhia.iaHabilitada()) return { ok: false, erro: 'IA não configurada (ANTHROPIC_API_KEY).' };
  const { atendimento, mensagens } = await sync.conversa(empresaId, orderId);
  if (!atendimento) return { ok: false, erro: 'Atendimento não encontrado.' };
  const falasAtendente = (mensagens || []).filter(m => m.direcao === 'sent' && m.tipo !== 'note' && norm(m.remetente) !== 'sistema' && (m.texto || '').trim());
  if (!falasAtendente.length) return { ok: false, erro: 'Sem falas do atendente para avaliar.' };

  const criterios = criteriosAtivos(empresaId);
  const termos = termosAtivos(empresaId);
  const termosEncontrados = escanearTermos(mensagens, termos);
  const texto = sync.conversaTexto(mensagens);
  const cfgIA = getConfig(empresaId);
  const av = await avaliarComIA(empresaId, texto, criterios, termos, cfgIA.script_ref);

  db.prepare(`INSERT INTO botvendas_avaliacoes (empresa_id, order_id, nota, resumo, itens_json, pontos_fortes, pontos_fracos, termos_encontrados, modelo, auto, avaliado_em, avaliado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),?)
    ON CONFLICT(empresa_id, order_id) DO UPDATE SET nota=excluded.nota, resumo=excluded.resumo, itens_json=excluded.itens_json,
      pontos_fortes=excluded.pontos_fortes, pontos_fracos=excluded.pontos_fracos, termos_encontrados=excluded.termos_encontrados,
      modelo=excluded.modelo, auto=excluded.auto, avaliado_em=datetime('now'), avaliado_por=excluded.avaliado_por`)
    .run(empresaId, orderId, av.nota, av.resumo, JSON.stringify(av.itens), av.pontos_fortes, av.pontos_fracos,
      JSON.stringify(termosEncontrados), 'claude', auto ? 1 : 0, auto ? 'auto (IA)' : 'manual (IA)');

  // Alerta: nota abaixo do mínimo OU usou termo negativo → tarefa pro gerente da loja.
  const cfg = getConfig(empresaId);
  const usouNegativa = termosEncontrados.some(t => t.tipo === 'negativa');
  const ruim = (av.nota != null && av.nota <= (cfg.nota_alerta || 6)) || usouNegativa;
  if (ruim) alertarAtendimentoRuim(empresaId, atendimento, av, termosEncontrados);

  return { ok: true, nota: av.nota, termos: termosEncontrados, ruim };
}

function alertarAtendimentoRuim(empresaId, at, av, termos) {
  try {
    const ref = `monitoria:${at.order_id}`;
    const existe = db.prepare("SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='monitoria' AND referencia_id=?").get(empresaId, ref);
    if (existe) return;
    // Gerente da loja do atendimento; se não achar, cai p/ supervisor/diretor.
    let resp = null;
    if (at.loja_id) resp = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
      WHERE c.empresa_id=? AND c.ativo=1 AND c.loja_id=? AND f.nome IN ('Gerente','Subgerente') ORDER BY f.nome LIMIT 1`).get(empresaId, at.loja_id);
    if (!resp) resp = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
      WHERE c.empresa_id=? AND c.ativo=1 AND f.nome IN ('Supervisor','Gestor Geral','Diretor Geral') ORDER BY f.nome LIMIT 1`).get(empresaId);
    if (!resp) return;
    const { gerarTarefa } = require('../routes/tarefas');
    const negativas = termos.filter(t => t.tipo === 'negativa').map(t => `"${t.termo}"`).join(', ');
    const evasivos = termos.filter(t => t.tipo === 'evasivo').map(t => `"${t.termo}"`).join(', ');
    const desc = `Atendimento de ${at.vendedor_nome || 'vendedor'} ao cliente ${at.cliente || ''} (${at.telefone || ''}).\n`
      + `Nota da monitoria (IA): ${av.nota != null ? av.nota + '/10' : '—'}.\n`
      + (negativas ? `⚠️ Usou termo negativo: ${negativas}.\n` : '')
      + (evasivos ? `Termos evasivos: ${evasivos}.\n` : '')
      + (av.pontos_fracos ? `A melhorar: ${av.pontos_fracos}\n` : '')
      + `Abra a Monitoria de Atendimento para ver a conversa e dar o feedback ao vendedor.`;
    gerarTarefa({
      empresa_id: empresaId, loja_id: at.loja_id || null, tipo: 'tarefa', origem: 'monitoria',
      referencia_id: ref, titulo: `🎧 Atendimento p/ revisar — ${at.vendedor_nome || ''} (nota ${av.nota != null ? av.nota : '?'})`.slice(0, 140),
      descricao: desc, responsavel_id: resp.id, criado_por: null,
    });
  } catch { /* não trava a avaliação se o alerta falhar */ }
}

// Avalia em lote os atendimentos fechados AINDA sem avaliação (limite por rodada p/ custo).
async function avaliarPendentes(empresaId, { limite = 15, desde } = {}) {
  if (!rhia.iaHabilitada || !rhia.iaHabilitada()) return { ok: false, erro: 'IA não configurada.' };
  // Por padrão só avalia atendimentos recentes (sem retroativo). desde = 'YYYY-MM-DD' ou 'now'.
  const filtroData = desde ? "AND date(a.closed_at) >= date(?)" : '';
  const params = desde ? [empresaId, desde, limite] : [empresaId, limite];
  const pend = db.prepare(`SELECT a.order_id FROM botvendas_atendimentos a
    WHERE a.empresa_id=? AND a.status=4 AND a.logistica=0 ${filtroData} AND NOT EXISTS (SELECT 1 FROM botvendas_avaliacoes v WHERE v.empresa_id=a.empresa_id AND v.order_id=a.order_id)
    ORDER BY a.closed_at DESC LIMIT ?`).all(...params);
  let ok = 0, falhas = 0;
  for (const p of pend) {
    try { const r = await avaliarAtendimento(empresaId, p.order_id, { auto: true }); if (r.ok) ok++; else falhas++; }
    catch { falhas++; }
  }
  return { ok: true, avaliados: ok, falhas, restantes: Math.max(0, pend.length - ok) };
}

// Avaliação de um atendimento (p/ a tela mostrar).
function avaliacaoDe(empresaId, orderId) {
  const v = db.prepare('SELECT * FROM botvendas_avaliacoes WHERE empresa_id=? AND order_id=?').get(empresaId, orderId);
  if (!v) return null;
  return { ...v, itens: JSON.parse(v.itens_json || '[]'), termos: JSON.parse(v.termos_encontrados || '[]') };
}

module.exports = { avaliarAtendimento, avaliarPendentes, avaliacaoDe, escanearTermos, getConfig, termosAtivos, criteriosAtivos };
