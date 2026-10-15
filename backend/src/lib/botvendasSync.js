// botvendasSync.js — traz atendimentos/conversas da API do BotVendas para o banco local (cache),
// casando o vendedor com o colaborador (por nome) para virar indicador/monitoria por pessoa.
const db = require('../db/connection');
const api = require('./botvendasApi');

const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Mapa nome→{id,loja_id} dos colaboradores ativos (p/ casar o vendedor do atendimento).
function mapaColaboradores(empresaId) {
  const m = new Map();
  for (const c of db.prepare('SELECT id, nome, loja_id FROM colaboradores WHERE empresa_id=? AND ativo=1').all(empresaId)) {
    m.set(norm(c.nome), { id: c.id, loja_id: c.loja_id });
  }
  return m;
}

// Sincroniza a lista de atendimentos (upsert). statuses padrão = [4] (finalizados).
async function sincronizarAtendimentos(empresaId, { statuses = [4], pageSize = 500, maxPaginas = 6, sectorIds } = {}) {
  if (!api.habilitado()) return { ok: false, erro: 'BotVendas não configurado.' };
  // Se houver setor configurado (Televendas), traz SÓ ele (evita a enxurrada de logística).
  const setores = sectorIds || api.CFG.sectorIds || [];
  const lista = await api.listarAtendimentos({ statuses, pageSize, maxPaginas, sectorIds: setores });
  const colab = mapaColaboradores(empresaId);
  const up = db.prepare(`INSERT INTO botvendas_atendimentos
    (empresa_id, order_id, cliente, telefone, canal, vendedor_nome, colaborador_id, loja_id, score, ta_seconds, status, total, cancel_reason, closed_at, updated_at, sincronizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, order_id) DO UPDATE SET cliente=excluded.cliente, telefone=excluded.telefone, canal=excluded.canal,
      vendedor_nome=excluded.vendedor_nome, colaborador_id=excluded.colaborador_id, loja_id=excluded.loja_id,
      score=excluded.score, ta_seconds=excluded.ta_seconds, status=excluded.status, total=excluded.total,
      cancel_reason=excluded.cancel_reason, closed_at=excluded.closed_at, updated_at=excluded.updated_at, sincronizado_em=datetime('now')`);
  const tx = db.transaction(() => {
    for (const a of lista) {
      const c = colab.get(norm(a.previous_seller_name)) || {};
      up.run(empresaId, a.id, (a.client_name || '').trim(), a.identification || null, a.social_network || null,
        (a.previous_seller_name || '').trim() || null, c.id || null, c.loja_id || null,
        a.average_score != null ? Number(a.average_score) : null, a.ta_in_seconds != null ? Number(a.ta_in_seconds) : null,
        a.status != null ? Number(a.status) : null, a.total != null ? Number(a.total) : null,
        a.cancel_reason_name || null, a.closed_at || null, a.updated_at || null);
    }
  });
  tx();
  return { ok: true, sincronizados: lista.length };
}

// Baixa (e guarda) o histórico de mensagens de um atendimento; usa cache se já baixado.
async function conversa(empresaId, orderId, { forcar = false } = {}) {
  const at = db.prepare('SELECT * FROM botvendas_atendimentos WHERE empresa_id=? AND order_id=?').get(empresaId, orderId);
  let at2 = null;
  let msgs = db.prepare('SELECT direcao, tipo, remetente, texto, enviado_em FROM botvendas_mensagens WHERE empresa_id=? AND order_id=? ORDER BY ordem').all(empresaId, orderId);
  if ((!msgs.length || forcar) && api.habilitado()) {
    const baixadas = await api.mensagensAtendimento(orderId);
    if (baixadas.length) {
      const ins = db.prepare(`INSERT OR REPLACE INTO botvendas_mensagens (empresa_id, order_id, message_id, direcao, tipo, remetente, texto, enviado_em, ordem)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      const tx = db.transaction(() => {
        baixadas.forEach((m, i) => ins.run(empresaId, orderId, m.message_id || ('idx' + i), m.direction || null, m.type || null, m.sender_name || null, m.text || null, m.sent_at || null, i));
      });
      tx();
      msgs = db.prepare('SELECT direcao, tipo, remetente, texto, enviado_em FROM botvendas_mensagens WHERE empresa_id=? AND order_id=? ORDER BY ordem').all(empresaId, orderId);
      // A API devolve as mensagens da MAIS NOVA p/ a mais antiga → cronológico é o inverso.
      const cron = [...msgs].reverse();
      const frt = tempoPrimeiraResposta(cron);
      if (frt != null) db.prepare('UPDATE botvendas_atendimentos SET resp_seconds=? WHERE empresa_id=? AND order_id=?').run(frt, empresaId, orderId);
      // A lista da API não traz vendedor/nota/loja na maioria → extrai da CONVERSA (fonte confiável).
      extrairDaConversa(empresaId, orderId, cron);
      at2 = db.prepare('SELECT * FROM botvendas_atendimentos WHERE empresa_id=? AND order_id=?').get(empresaId, orderId);
    }
  }
  // Devolve em ordem CRONOLÓGICA (a API entrega da mais nova p/ a mais antiga).
  return { atendimento: at2 || at || null, mensagens: [...msgs].reverse() };
}

// Casa um texto (nota da conversa) com uma loja do sistema pelo nome (ex.: "Mutti - Entre Rios 2").
function acharLojaPorTexto(empresaId, texto) {
  const t = norm(texto); if (!t) return null;
  for (const l of db.prepare('SELECT id, nome FROM lojas WHERE empresa_id=?').all(empresaId)) {
    const n = norm(l.nome); if (n && t.includes(n)) return l.id;
  }
  return null;
}

// Extrai da conversa (em ordem CRONOLÓGICA): VENDEDOR (1ª fala humana), NOTA CSAT (resposta 1-5 do
// cliente à pesquisa) e LOJA (da nota "Iniciado via Whatsapp (Loja...)"). Preenche o que estiver vazio.
function extrairDaConversa(empresaId, orderId, cron) {
  const at = db.prepare('SELECT vendedor_nome, score, loja_id FROM botvendas_atendimentos WHERE empresa_id=? AND order_id=?').get(empresaId, orderId);
  if (!at) return;
  // Vendedor = 1º "sent" humano (não Sistema); fallback: nota "finalizado pelo(a) Atendente X".
  let vendedor = null;
  for (const m of cron) { if (m.direcao === 'sent' && m.tipo !== 'note' && !ehSistema(m) && (m.remetente || '').trim()) { vendedor = m.remetente.trim(); break; } }
  if (!vendedor) { const nf = cron.find(m => m.tipo === 'note' && /finalizado/i.test(m.texto || '')); if (nf) { const mm = (nf.texto || '').match(/Atendente[:\s*]+([A-Za-zÀ-ú' ]{3,40})/i); if (mm) vendedor = mm[1].replace(/[*]/g, '').trim(); } }
  // CSAT: pesquisa (Sistema) seguida da resposta do cliente com dígito 1-5.
  let score = null, aguardando = false;
  for (const m of cron) {
    if (m.tipo === 'note') continue;
    if (m.direcao === 'sent' && /classific|satisfa|avaliar? o (seu )?atend/i.test(m.texto || '')) { aguardando = true; continue; }
    if (aguardando && m.direcao === 'received') { const mm = (m.texto || '').trim().match(/^\D*([1-5])(\D|$)/); if (mm) { score = Number(mm[1]); break; } }
  }
  // Loja: última nota que cita uma loja conhecida (pega a atribuição final).
  let lojaId = null;
  for (const m of cron) { if (m.tipo === 'note' || ehSistema(m)) { const lid = acharLojaPorTexto(empresaId, m.texto || ''); if (lid) lojaId = lid; } }

  // Logística/entrega/aviso NÃO é atendimento de venda — mesmo que um humano toque (ex.: "pedido saiu
  // para entrega"). Marcador: iniciado via Integração, encaminhado p/ Delivery ou painel logístico.
  // Atendimento de venda REAL = iniciado via Whatsapp com conversa do cliente.
  const textoTudo = cron.map(m => m.texto || '').join(' | ');
  const marcadorLog = /iniciado via\s+\*?integra|encaminhado para\s+.{0,4}delivery|painel log[ií]stico|bv-proxy/i.test(textoTudo);
  const ehLogistica = marcadorLog || !vendedor;

  const colab = vendedor ? mapaColaboradores(empresaId).get(norm(vendedor)) : null;
  const sets = ['logistica=?']; const vals = [ehLogistica ? 1 : 0];
  if (vendedor && !at.vendedor_nome) { sets.push('vendedor_nome=?'); vals.push(vendedor); if (colab) { sets.push('colaborador_id=?'); vals.push(colab.id); } }
  if (lojaId && !at.loja_id) { sets.push('loja_id=?'); vals.push(lojaId); }
  else if (colab && colab.loja_id && !at.loja_id && !lojaId) { sets.push('loja_id=?'); vals.push(colab.loja_id); }
  if (score != null && at.score == null) { sets.push('score=?'); vals.push(score); }
  if (sets.length) { vals.push(empresaId, orderId); db.prepare(`UPDATE botvendas_atendimentos SET ${sets.join(',')} WHERE empresa_id=? AND order_id=?`).run(...vals); }
}

// Processa em lote os atendimentos SEM vendedor OU SEM loja: extrai vendedor+CSAT+loja da conversa.
// Reaproveita mensagens já em cache (barato); só baixa da API quando ainda não tem.
function reextrair(empresaId, orderId) {
  const msgs = db.prepare('SELECT direcao, tipo, remetente, texto, enviado_em FROM botvendas_mensagens WHERE empresa_id=? AND order_id=? ORDER BY ordem').all(empresaId, orderId);
  if (!msgs.length) return false;
  const cron = [...msgs].reverse();
  const frt = tempoPrimeiraResposta(cron);
  if (frt != null) db.prepare('UPDATE botvendas_atendimentos SET resp_seconds=? WHERE empresa_id=? AND order_id=?').run(frt, empresaId, orderId);
  extrairDaConversa(empresaId, orderId, cron);
  return true;
}

async function processarConversas(empresaId, { limite = 40 } = {}) {
  if (!api.habilitado()) return { ok: false };
  // Só processa atendimento HUMANO (logistica=0) que ainda esteja incompleto — não gasta com logística.
  const incompleto = `status=4 AND logistica=0 AND (loja_id IS NULL OR resp_seconds IS NULL)`;
  // 1) Reprocessa TODOS os que já têm conversa em cache (barato, sem API).
  const comCache = db.prepare(`SELECT a.order_id FROM botvendas_atendimentos a WHERE a.empresa_id=? AND ${incompleto}
    AND EXISTS (SELECT 1 FROM botvendas_mensagens m WHERE m.empresa_id=a.empresa_id AND m.order_id=a.order_id)`).all(empresaId);
  let re = 0; for (const p of comCache) { try { if (reextrair(empresaId, p.order_id)) re++; } catch { /* ignora */ } }
  // 2) Baixa da API (limitado) os que ainda não têm conversa — a nota da conversa dá a LOJA.
  const semCache = db.prepare(`SELECT a.order_id FROM botvendas_atendimentos a WHERE a.empresa_id=? AND ${incompleto}
    AND NOT EXISTS (SELECT 1 FROM botvendas_mensagens m WHERE m.empresa_id=a.empresa_id AND m.order_id=a.order_id)
    ORDER BY a.closed_at DESC LIMIT ?`).all(empresaId, limite);
  let baixados = 0; for (const p of semCache) { try { await conversa(empresaId, p.order_id); baixados++; } catch { /* ignora */ } }
  return { ok: true, reprocessados: re, baixados, processados: re + baixados };
}

// Converte "DD/MM/YYYY HH:mm" (formato do BotVendas) em Date; null se não der.
function parseDataBv(s) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
}
// Segundos entre a 1ª mensagem do CLIENTE e a 1ª resposta do ATENDENTE HUMANO depois dela.
function tempoPrimeiraResposta(mensagens) {
  const ord = (mensagens || []).filter(m => m.tipo !== 'note' && !ehSistema(m));
  let tCliente = null;
  for (const m of ord) {
    if (m.direcao === 'received' && !tCliente) { tCliente = parseDataBv(m.enviado_em); continue; }
    if (m.direcao === 'sent' && tCliente) {
      const tAt = parseDataBv(m.enviado_em);
      if (tAt) { const s = Math.round((tAt - tCliente) / 1000); return s >= 0 && s < 7 * 864e2 ? s : null; }
    }
  }
  return null;
}

// Mensagem automática do bot (saudação, pesquisa CSAT etc.) — NÃO é fala do atendente humano.
function ehSistema(m) { return norm(m.remetente) === 'sistema'; }

// Texto da conversa em formato simples (p/ a IA avaliar) — sem as mensagens automáticas do Sistema.
function conversaTexto(mensagens) {
  return (mensagens || [])
    .filter(m => m.tipo !== 'note' && !ehSistema(m) && (m.texto || '').trim())
    .map(m => `${m.direcao === 'sent' ? 'ATENDENTE' : 'CLIENTE'} (${m.remetente || ''}): ${m.texto}`)
    .join('\n');
}

// Reaplica a classificação (logística/vendedor/loja/nota) em TODAS as conversas já baixadas.
function reclassificarTodos(empresaId) {
  const ords = db.prepare('SELECT DISTINCT order_id FROM botvendas_mensagens WHERE empresa_id=?').all(empresaId);
  let n = 0; for (const o of ords) { try { if (reextrair(empresaId, o.order_id)) n++; } catch { /* ignora */ } }
  return n;
}

module.exports = { sincronizarAtendimentos, conversa, conversaTexto, mapaColaboradores, processarConversas, reclassificarTodos };
