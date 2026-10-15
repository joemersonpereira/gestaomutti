// ecommConversao.js — Validação diária Giro Premiado/E-commerce × vendas do ERP A7.
//
// Regra do Joe (29/09/2026):
//  1. Só há cruzamento quando o CLIENTE é identificado por TELEFONE ou NOME. Fora isso, não conta.
//  2. Só é VENDA se o cliente comprou, depois do checkout, o MESMO produto do giro ou uma
//     VARIAÇÃO dele (mesmas N primeiras palavras da descrição: tipo + marca + linha — ex.: Plax
//     Fresh Mint 500ml → Plax Melancia 500ml). Item diferente vira só "visita", fora da API.
//  3. Venda confirmada é registrada na API do e-commerce (dispara Meta/GA4) com o COO do A7 no
//     transaction_id e o valor do ITEM (não do cupom).
//
// O ERP é só leitura (erpQuery). A API do e-commerce devolve apenas checkouts com formulário e
// ainda sem venda — então cada execução reanalisa só o que continua pendente.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');

const TZ_OFFSET_H = -3; // Bahia: UTC-3 o ano todo (sem horário de verão)

function config(empresaId) {
  const rows = db.prepare('SELECT chave, valor FROM ecomm_conversao_config WHERE empresa_id=?').all(empresaId);
  const g = Object.fromEntries(rows.map(r => [r.chave, r.valor]));
  return {
    ativo: g.ativo !== '0',
    hora: g.hora_execucao || '18:00',
    janelaDias: Math.max(1, Number(g.janela_dias) || 15),
    palavrasVariacao: Math.max(1, Number(g.palavras_variacao) || 3),
    registrarAuto: g.registrar_auto === '1',
    apiBase: (g.api_base || '').replace(/\/+$/, ''),
    ultimaExecucao: g.ultima_execucao || '',
  };
}
function setConfig(empresaId, chave, valor) {
  db.prepare('UPDATE ecomm_conversao_config SET valor=? WHERE empresa_id=? AND chave=?').run(String(valor), empresaId, chave);
}

// ── Utilidades ────────────────────────────────────────────────────────────────
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const palavras = s => norm(s).split(/[^A-Z0-9]+/).filter(Boolean);
const digitos = s => (s || '').replace(/\D/g, '');
// Unix (s) → 'YYYY-MM-DD HH:MM' no horário local (mesmo formato do to_char do ERP)
const local = ts => new Date((ts + TZ_OFFSET_H * 3600) * 1000).toISOString().slice(0, 16).replace('T', ' ');
const agoraLocal = () => local(Math.floor(Date.now() / 1000));

// 'exato' | 'variacao' | null
function casaProduto(produtoGiro, itemErp, n) {
  if (norm(produtoGiro) === norm(itemErp)) return 'exato';
  const a = palavras(produtoGiro), b = palavras(itemErp);
  if (a.length < n || b.length < n) return null;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return null;
  return 'variacao';
}

// ── API do e-commerce ────────────────────────────────────────────────────────
function segredo() { return process.env.ECOMM_API_SECRET || ''; }

async function buscarPendentes(apiBase) {
  const todos = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${apiBase}/api/ecomm/pending-checkouts?all=true&limit=1000&offset=${offset}`, { headers: { 'x-secret': segredo() } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(`API e-commerce (pendentes): HTTP ${r.status} ${d.message || d.error || ''}`);
    todos.push(...(d.checkouts || []));
    if (!d.checkouts || d.checkouts.length < 1000 || todos.length >= (d.total || 0)) break;
  }
  return todos;
}

async function registrarVenda(apiBase, id, valor, transactionId) {
  const r = await fetch(`${apiBase}/api/ecomm/register-purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secret': segredo() },
    body: JSON.stringify({ id, price: valor, transaction_id: transactionId }),
  });
  const d = await r.json().catch(() => ({}));
  // 409 = já registrada (pela tela ou outra chamada) → para nós, também está registrada.
  return { ok: r.status === 200 || r.status === 409, status: r.status, resposta: d };
}

// ── ERP ──────────────────────────────────────────────────────────────────────
const FONE8 = `right(regexp_replace(coalesce(%s_ddd,'')||coalesce(%s_contato,''),'\\D','','g'),8)`;
const SEM_ACENTO = c => `translate(upper(${c}),'ÁÀÂÃÉÊÍÓÔÕÚÇ','AAAAEEIOOOUC')`;

async function vendasDoCliente(fone8, nomes, ini, fim) {
  const pessoas = fone8.length === 8
    ? (await erpQuery(`SELECT DISTINCT pessoaid FROM contato c WHERE ${FONE8.replace(/%s_/g, 'c.')}=$1`, [fone8])).map(r => r.pessoaid)
    : [];
  const vendas = await erpQuery(`
    SELECT v.id, to_char(v.datahorafechamento,'YYYY-MM-DD HH24:MI') quando, v.coo, v.valortotal,
           coalesce(pu.nome, v.unidadenegocioid::text) loja,
           CASE WHEN v.pessoaid = ANY($4::bigint[]) OR ${FONE8.replace(/%s_/g, 'v.')}=$3 THEN 'telefone' ELSE 'nome' END via
      FROM venda v
      LEFT JOIN pessoa pe ON pe.id = v.pessoaid
      LEFT JOIN unidadenegocio un ON un.id = v.unidadenegocioid
      LEFT JOIN pessoa pu ON pu.id = un.pessoaid
     WHERE v.status IN ('F','D') AND v.datahorafechamento >= $1 AND v.datahorafechamento < $2
       AND ( v.pessoaid = ANY($4::bigint[])
          OR (length($3) = 8 AND ${FONE8.replace(/%s_/g, 'v.')} = $3)
          OR ${SEM_ACENTO('v.nome')} = ANY($5::text[])
          OR ${SEM_ACENTO('pe.nome')} = ANY($5::text[]) )
     ORDER BY v.datahorafechamento`, [ini, fim, fone8, pessoas, nomes]);
  if (!vendas.length) return [];
  const itens = await erpQuery(`
    SELECT i.id, i.vendaid, pr.descricao, i.valortotal
      FROM itemvenda i JOIN embalagem e ON e.id = i.embalagemid JOIN produto pr ON pr.id = e.produtoid
     WHERE i.vendaid = ANY($1::bigint[]) AND i.status <> 'C'
     ORDER BY i.vendaid, i.sequencia`, [vendas.map(v => v.id)]);
  for (const v of vendas) v.itens = itens.filter(i => String(i.vendaid) === String(v.id));
  return vendas;
}

// ── Execução ─────────────────────────────────────────────────────────────────
// opts.simular = true → analisa e grava o histórico, mas NÃO chama o registro na API.
async function executar(empresaId, opts = {}) {
  const cfg = config(empresaId);
  if (!habilitado()) return { ok: false, motivo: 'ERP desabilitado.' };
  if (!segredo()) return { ok: false, motivo: 'ECOMM_API_SECRET não configurado no .env.' };
  if (!cfg.apiBase) return { ok: false, motivo: 'api_base não configurada.' };
  const registrar = cfg.registrarAuto && !opts.simular;

  const pendentes = (await buscarPendentes(cfg.apiBase)).map(c => ({
    ...c, fone: digitos(c.raw_phone), nome: norm(c.raw_name), quando: local(c.created_at),
  }));

  // Testes: nome com "TESTE" e qualquer checkout do mesmo telefone.
  const fonesTeste = new Set(pendentes.filter(c => /\bTESTE\b/.test(c.nome) && c.fone).map(c => c.fone.slice(-8)));
  const ehTeste = c => /\bTESTE\b/.test(c.nome) || (c.fone && fonesTeste.has(c.fone.slice(-8)));

  // Agrupa por cliente (telefone; sem telefone, pelo nome).
  const grupos = new Map();
  for (const c of pendentes.filter(c => !ehTeste(c))) {
    const k = c.fone ? 'f:' + c.fone.slice(-8) : 'n:' + c.nome;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }

  const agora = agoraLocal();
  const itensUsados = new Set(db.prepare(`SELECT erp_item_id FROM ecomm_conversao_log
    WHERE empresa_id=? AND resultado='registrada' AND erp_item_id IS NOT NULL`).all(empresaId).map(r => r.erp_item_id));
  const res = []; // {c, resultado, ...}
  for (const c of pendentes.filter(ehTeste)) res.push({ c, resultado: 'teste' });

  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.created_at - b.created_at);
    const fone8 = (lista.find(c => c.fone) || {}).fone?.slice(-8) || '';
    const nomes = [...new Set(lista.map(c => c.nome).filter(n => n.split(' ').length >= 2))];
    const fimJanela = c => local(c.created_at + cfg.janelaDias * 86400);
    let vendas;
    try {
      vendas = await vendasDoCliente(fone8, nomes, lista[0].quando, fimJanela(lista[lista.length - 1]));
    } catch (e) {
      lista.forEach(c => res.push({ c, resultado: 'erro', detalhe: 'ERP: ' + e.message }));
      continue;
    }
    // Cada ITEM vendido confirma no máximo 1 checkout: o mais recente anterior à venda, do mesmo
    // produto ou variação, dentro da janela. Item que já confirmou venda antes fica de fora.
    const confirmado = new Map();
    for (const v of vendas) {
      for (const it of v.itens) {
        if (itensUsados.has(String(it.id))) continue;
        const alvo = lista.filter(c => !confirmado.has(c.id) && c.quando <= v.quando && v.quando < fimJanela(c)
            && casaProduto(c.product_name, it.descricao, cfg.palavrasVariacao))
          .pop();
        if (alvo) confirmado.set(alvo.id, { v, it, tipo: casaProduto(alvo.product_name, it.descricao, cfg.palavrasVariacao) });
      }
    }
    for (const c of lista) {
      const m = confirmado.get(c.id);
      if (m) { res.push({ c, resultado: 'venda', ...m }); continue; }
      const depois = vendas.filter(v => c.quando <= v.quando && v.quando < fimJanela(c));
      if (depois.length) {
        const v = depois[0];
        res.push({ c, resultado: 'visita', v, via: v.via,
          detalhe: depois.map(x => `${x.quando} COO ${x.coo}: ${x.itens.map(i => i.descricao).join(' + ')}`).join(' | ') });
      } else {
        res.push({ c, resultado: fimJanela(c) > agora ? 'aguardando' : 'sem_compra' });
      }
    }
  }

  // Registro na API + histórico
  const up = db.prepare(`INSERT INTO ecomm_conversao_log
      (checkout_id, empresa_id, checkout_em, origem, cliente, telefone, produto, preco, resultado, via,
       erp_venda_id, erp_item_id, coo, loja, venda_em, item_erp, valor, detalhe, analisado_em, registrado_em)
    VALUES (@checkout_id,@empresa_id,@checkout_em,@origem,@cliente,@telefone,@produto,@preco,@resultado,@via,
       @erp_venda_id,@erp_item_id,@coo,@loja,@venda_em,@item_erp,@valor,@detalhe,@analisado_em,@registrado_em)
    ON CONFLICT(checkout_id) DO UPDATE SET resultado=excluded.resultado, via=excluded.via, erp_venda_id=excluded.erp_venda_id, erp_item_id=excluded.erp_item_id,
       coo=excluded.coo, loja=excluded.loja, venda_em=excluded.venda_em, item_erp=excluded.item_erp, valor=excluded.valor,
       detalhe=excluded.detalhe, analisado_em=excluded.analisado_em,
       registrado_em=COALESCE(excluded.registrado_em, ecomm_conversao_log.registrado_em)`);
  const resumo = { registrada: 0, apontada: 0, visita: 0, aguardando: 0, sem_compra: 0, teste: 0, erro: 0 };
  const vendasRegistradas = [];

  for (const r of res) {
    const { c } = r;
    let resultado = r.resultado, detalhe = r.detalhe || null, registradoEm = null, valor = null;
    if (resultado === 'venda') {
      valor = Number(r.it.valortotal);
      detalhe = `${r.tipo === 'exato' ? 'mesmo produto' : 'variação'}`;
      if (registrar) {
        try {
          const api = await registrarVenda(cfg.apiBase, c.id, valor, `A7-COO-${r.v.coo}`);
          if (api.ok) { resultado = 'registrada'; itensUsados.add(String(r.it.id)); registradoEm = agoraLocal(); vendasRegistradas.push({ cliente: c.raw_name, produto: r.it.descricao, valor, coo: r.v.coo }); }
          else { resultado = 'erro'; }
          detalhe += ` · API ${api.status}: ${api.resposta.message || api.resposta.error || ''}`;
        } catch (e) { resultado = 'erro'; detalhe += ' · API: ' + e.message; }
      } else {
        resultado = 'apontada';
      }
    }
    resumo[resultado] = (resumo[resultado] || 0) + 1;
    up.run({
      checkout_id: c.id, empresa_id: empresaId, checkout_em: c.quando, origem: c.origin || null,
      cliente: c.raw_name || null, telefone: c.fone || null, produto: c.product_name || null, preco: c.price ?? null,
      resultado, via: r.v ? r.v.via : null, erp_venda_id: r.v ? String(r.v.id) : null, erp_item_id: r.it ? String(r.it.id) : null, coo: r.v ? r.v.coo : null,
      loja: r.v ? r.v.loja : null, venda_em: r.v ? r.v.quando : null, item_erp: r.it ? r.it.descricao : null,
      valor, detalhe, analisado_em: agoraLocal(), registrado_em: registradoEm,
    });
  }
  return { ok: true, analisados: res.length, registrou: registrar, resumo, vendasRegistradas };
}

// Chamado pelo agendador do server.js a cada poucos minutos: roda UMA vez por dia, a partir do
// horário configurado (se o servidor estava desligado às 18:00, roda assim que subir no mesmo dia).
async function talvezExecutar(empresaId) {
  const cfg = config(empresaId);
  if (!cfg.ativo) return null;
  const agora = agoraLocal();
  const hoje = agora.slice(0, 10);
  if (cfg.ultimaExecucao === hoje || agora.slice(11) < cfg.hora) return null;
  setConfig(empresaId, 'ultima_execucao', hoje); // marca antes: evita rodar 2x em paralelo
  return executar(empresaId);
}

module.exports = { executar, talvezExecutar, config, setConfig, casaProduto };
