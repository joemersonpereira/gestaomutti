// trademkt.js — Trade Marketing: aluguel de espaços da loja a fornecedores (áreas/espaços, vendas, parcelas, sell-out do ERP).
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { auth, exigePerfil } = require('../middleware/auth');
const { enviarEmail, smtpOk } = require('../lib/mailer');
const { cobrarVenda } = require('../lib/cobranca');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing'];
// fluxo do Kanban (Joe 2026-10-16): rascunho → negociação → confirmado → briefing (material/arte pendente)
// → aguardando (liberar veiculação) → vigente (em veiculação) → encerrado. 'pedido' = entrada do portal (cai em Negociação).
const STATUS = ['rascunho', 'pedido', 'negociacao', 'confirmado', 'briefing', 'aguardando', 'vigente', 'encerrado', 'cancelado'];
router.use(auth);

// ── Grupos econômicos (agrupar fornecedores) ────────────────────────────────
router.get('/grupos-economicos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const grupos = db.prepare('SELECT * FROM tmkt_grupos_economicos WHERE empresa_id=? ORDER BY nome').all(emp);
  const forn = db.prepare('SELECT * FROM tmkt_grupo_fornecedores WHERE empresa_id=? ORDER BY fornecedor_nome').all(emp);
  res.json({ grupos: grupos.map(g => ({ ...g, fornecedores: forn.filter(f => f.grupo_id === g.id) })) });
});
router.post('/grupos-economicos', exigePerfil(...GESTAO), (req, res) => {
  if (!req.body.nome) return res.status(400).json({ erro: 'Informe o nome do grupo.' });
  const id = uuid();
  db.prepare('INSERT INTO tmkt_grupos_economicos (id,empresa_id,nome,observacao) VALUES (?,?,?,?)').run(id, req.usuario.empresa_id, req.body.nome, req.body.observacao || null);
  res.json({ ok: true, id });
});
router.delete('/grupos-economicos/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_grupo_fornecedores WHERE grupo_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_grupos_economicos WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});
router.post('/grupos-economicos/:id/fornecedor', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body; if (!b.fornecedor_id) return res.status(400).json({ erro: 'Selecione o fornecedor.' });
  const ja = db.prepare('SELECT 1 FROM tmkt_grupo_fornecedores WHERE grupo_id=? AND fornecedor_id=?').get(req.params.id, String(b.fornecedor_id));
  if (ja) return res.json({ ok: true, jaExistia: true });
  db.prepare('INSERT INTO tmkt_grupo_fornecedores (id,empresa_id,grupo_id,fornecedor_id,fornecedor_nome) VALUES (?,?,?,?,?)')
    .run(uuid(), req.usuario.empresa_id, req.params.id, String(b.fornecedor_id), b.fornecedor_nome || null);
  res.json({ ok: true });
});
router.delete('/grupos-economicos/fornecedor/:fid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_grupo_fornecedores WHERE id=? AND empresa_id=?').run(req.params.fid, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── Modelo de contrato com placeholders (@Fornecedor, @Valor, @VigenciaInicio…) ──
const TEMPLATE_PADRAO = `CONTRATO DE CESSÃO DE ESPAÇO COMERCIAL — @Codigo

CONTRATANTE (fornecedor): @Fornecedor — CNPJ @FornecedorCnpj
Tema / campanha: @Tema
Vigência: @VigenciaInicio a @VigenciaFim
Forma de pagamento: @FormaPagamento
Valor total: @Valor

Lojas participantes: @Lojas

Espaços cedidos:
@Espacos

Emitido em @DataHoje.`;
const dBRr = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const moneyBR = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

router.get('/contrato-template', (req, res) => {
  const r = db.prepare("SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='tmkt_contrato_template'").get(req.usuario.empresa_id);
  res.json({ template: r?.valor || TEMPLATE_PADRAO, padrao: TEMPLATE_PADRAO });
});
router.post('/contrato-template', exigePerfil(...GESTAO), (req, res) => {
  db.prepare(`INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,'tmkt_contrato_template',?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(req.usuario.empresa_id, String(req.body.template || ''));
  res.json({ ok: true });
});
router.get('/vendas/:id/contrato', async (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT * FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const tmpl = (db.prepare("SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='tmkt_contrato_template'").get(emp)?.valor) || TEMPLATE_PADRAO;
  const esp = db.prepare('SELECT * FROM tmkt_venda_espacos WHERE venda_id=? ORDER BY loja_nome, area_desc').all(v.id);
  const lojas = [...new Set(esp.map(e => e.loja_nome).filter(Boolean))].join(', ') || (v.loja_id ? '' : '—');
  const espTxt = esp.length ? esp.map(e => `  • ${e.loja_nome ? e.loja_nome + ' — ' : ''}${e.area_desc ? e.area_desc + ' · ' : ''}${e.espaco_desc}${e.slot ? ' (vaga ' + e.slot + ')' : ''} — ${moneyBR(e.valor)}`).join('\n') : '  (nenhum)';
  let cnpj = '—';
  if (habilitado() && v.fornecedor_id) {
    try { const r = await erpQuery('SELECT COALESCE(p.cnpj, p.cnpjcpf) doc FROM fornecedor f JOIN pessoa p ON p.id=f.pessoaid WHERE f.id=$1::bigint', [v.fornecedor_id]); cnpj = r[0]?.doc || '—'; } catch { /* pessoa pode não ter cnpj */ }
  }
  const mapa = {
    '@Codigo': v.codigo || '', '@Fornecedor': v.fornecedor_nome || '—', '@FornecedorCnpj': cnpj,
    '@Tema': v.tema_desc || '—', '@VigenciaInicio': dBRr(v.vigencia_ini), '@VigenciaFim': dBRr(v.vigencia_fim),
    '@FormaPagamento': v.forma_pagamento || '—', '@Valor': moneyBR(v.valor), '@Lojas': lojas || '—',
    '@Espacos': espTxt, '@DataHoje': dBRr(new Date().toISOString()),
  };
  const texto = tmpl.replace(/@[A-Za-zçÇ]+/g, m => (m in mapa ? mapa[m] : m));
  res.json({ texto, codigo: v.codigo });
});

function proximoCodigo(emp) {
  const ano = new Date().getFullYear();
  const n = db.prepare("SELECT COUNT(*) c FROM tmkt_vendas WHERE empresa_id=? AND codigo LIKE ?").get(emp, `TM-${ano}-%`).c + 1;
  return `TM-${ano}-${String(n).padStart(5, '0')}`;
}

// ── Cadastros: áreas, espaços, temas ─────────────────────────────────────
router.get('/cadastros', (req, res) => {
  const emp = req.usuario.empresa_id;
  res.json({
    areas: db.prepare('SELECT * FROM tmkt_areas WHERE empresa_id=? ORDER BY descricao').all(emp),
    espacos: db.prepare('SELECT * FROM tmkt_espacos WHERE empresa_id=? ORDER BY descricao').all(emp),
    temas: db.prepare('SELECT * FROM tmkt_temas WHERE empresa_id=? ORDER BY descricao').all(emp),
  });
});
const tabelaOk = t => ({ areas: 'tmkt_areas', temas: 'tmkt_temas' }[t]);
router.post('/cadastros/:tipo', exigePerfil(...GESTAO), (req, res) => {
  const t = tabelaOk(req.params.tipo);
  if (!t || !req.body.descricao) return res.status(400).json({ erro: 'Dados inválidos.' });
  const id = uuid();
  db.prepare(`INSERT INTO ${t} (id,empresa_id,descricao,criado_em) VALUES (?,?,?,datetime('now'))`).run(id, req.usuario.empresa_id, req.body.descricao);
  res.json({ ok: true, id });
});
router.delete('/cadastros/:tipo/:id', exigePerfil(...GESTAO), (req, res) => {
  const t = tabelaOk(req.params.tipo);
  if (!t) return res.status(400).json({ erro: 'Tipo inválido.' });
  db.prepare(`DELETE FROM ${t} WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
// Espaços (têm área + valor de referência)
router.post('/espacos', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body; if (!b.descricao) return res.status(400).json({ erro: 'Informe a descrição.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_espacos (id,empresa_id,area_id,descricao,observacoes,valor_ref,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.area_id || null, b.descricao, b.observacoes || null, Number(b.valor_ref) || 0);
  res.json({ ok: true, id });
});
router.delete('/espacos/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_espacos WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Dashboard: KPIs + performance por loja (filtro opcional por loja).
router.get('/dashboard', (req, res) => {
  const emp = req.usuario.empresa_id, loja = req.query.loja;
  const el = db.prepare(`SELECT loja_nome, loja_id, SUM(quantidade) total, SUM(quantidade*preco_unit) potencial
    FROM tmkt_espaco_loja WHERE empresa_id=? ${loja ? 'AND loja_nome=?' : ''} GROUP BY loja_nome, loja_id`).all(...(loja ? [emp, loja] : [emp]));
  // vendidos/receita por loja (vendas vigentes/concluídas)
  // vendidos e receita atribuídos à loja do ESPAÇO vendido (negociação pode ter espaços de várias lojas)
  const vend = db.prepare(`SELECT COALESCE(ve.loja_id, v.loja_id) loja_id, COUNT(ve.id) vendidos, COALESCE(SUM(ve.valor),0) receita
    FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id WHERE v.empresa_id=? AND v.status IN ('vigente','concluido')
    GROUP BY COALESCE(ve.loja_id, v.loja_id)`).all(emp).reduce((m, r) => (m[r.loja_id] = r, m), {});
  const monitorados = db.prepare(`SELECT COALESCE(SUM(json_array_length(eans_monitorados)),0) n FROM tmkt_vendas WHERE empresa_id=? AND eans_monitorados IS NOT NULL`).get(emp).n || 0;

  const lojas = el.map(r => {
    const vendidos = (vend[r.loja_id] || {}).vendidos || 0;
    const rec = (vend[r.loja_id] || {}).receita || 0;
    const total = r.total || 0;
    return { loja: r.loja_nome, total, vendidos, disponiveis: total - vendidos, ocupacao: total ? Math.round(vendidos / total * 100) : 0, receita: rec, potencial: r.potencial || 0 };
  }).sort((a, b) => b.potencial - a.potencial);

  const tot = lojas.reduce((a, l) => ({ total: a.total + l.total, vendidos: a.vendidos + l.vendidos, potencial: a.potencial + l.potencial, receita: a.receita + l.receita }), { total: 0, vendidos: 0, potencial: 0, receita: 0 });
  // funil por status (negociações reais), ignorando canceladas/recusadas
  const pipeline = db.prepare(`SELECT status, COUNT(*) n, COALESCE(SUM(valor),0) valor
    FROM tmkt_vendas WHERE empresa_id=? AND status NOT IN ('cancelado','recusado') GROUP BY status`).all(emp)
    .reduce((m, r) => (m[r.status] = { n: r.n, valor: r.valor }, m), {});
  // financeiro: vendido (negócios fechados), a receber e recebido
  const vendidoTotal = db.prepare(`SELECT COALESCE(SUM(valor),0) v FROM tmkt_vendas WHERE empresa_id=? AND status IN ('confirmado','vendido','vigente','concluido','encerrado')`).get(emp).v || 0;
  const aReceber = db.prepare(`SELECT COALESCE(SUM(p.valor),0) v FROM tmkt_parcelas p JOIN tmkt_vendas v ON v.id=p.venda_id WHERE p.empresa_id=? AND COALESCE(p.recebido,0)=0 AND v.status<>'cancelado'`).get(emp).v || 0;
  const recebido = db.prepare(`SELECT COALESCE(SUM(recebido_valor),0) v FROM tmkt_parcelas WHERE empresa_id=? AND recebido=1`).get(emp).v || 0;
  // negociações recentes
  const recentes = db.prepare(`SELECT codigo, fornecedor_nome, valor, status, origem, criado_em FROM tmkt_vendas
    WHERE empresa_id=? AND status NOT IN ('cancelado','recusado') ORDER BY criado_em DESC LIMIT 6`).all(emp);
  // top fornecedores (por valor fechado)
  const topForn = db.prepare(`SELECT fornecedor_nome nome, COUNT(*) n, COALESCE(SUM(valor),0) valor FROM tmkt_vendas
    WHERE empresa_id=? AND status IN ('confirmado','vendido','vigente','concluido','encerrado') GROUP BY fornecedor_nome ORDER BY valor DESC LIMIT 6`).all(emp);
  res.json({
    kpis: {
      total: tot.total, vendidos: tot.vendidos, disponiveis: tot.total - tot.vendidos,
      ocupacao: tot.total ? Math.round(tot.vendidos / tot.total * 100) : 0,
      potencial: tot.potencial, potencialPerdido: tot.potencial - tot.receita, receita: tot.receita, monitorados,
      vendidoTotal, aReceber, recebido,
    },
    lojas, pipeline, recentes, topForn,
  });
});

// Espaços por loja (quantidade + preço) — o "AreasEEspacosDaLoja" do TradeMkt.
// Vagas ocupadas por espaço-loja = venda_espacos de vendas ativas (não cancelada/encerrada).
const OCUPA_STATUS = "('pedido','rascunho','negociacao','confirmado','briefing','aguardando','vigente','vendido','concluido')";
router.get('/espaco-loja', (req, res) => {
  const rows = db.prepare(`SELECT el.id, el.empresa_id, el.loja_id, el.loja_nome, el.area, el.espaco, el.quantidade, el.preco_unit, el.criado_em,
      (el.foto IS NOT NULL) tem_foto, (
      SELECT COUNT(*) FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id
      WHERE ve.espaco_id=el.id AND v.status IN ${OCUPA_STATUS}
    ) ocupados
    FROM tmkt_espaco_loja el WHERE el.empresa_id=? ORDER BY el.loja_nome, el.area, el.espaco`).all(req.usuario.empresa_id);
  res.json({ itens: rows.map(r => ({ ...r, tem_foto: !!r.tem_foto, ocupados: r.ocupados || 0, disponiveis: Math.max(0, (r.quantidade || 0) - (r.ocupados || 0)) })) });
});
// Foto do ponto (base64) — leitura e gravação separadas (a foto é grande, não vai na lista).
router.get('/espaco-loja/:id/foto', (req, res) => {
  const r = db.prepare('SELECT foto FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  res.json({ foto: r?.foto || null });
});
router.put('/espaco-loja/:id/foto', exigePerfil(...GESTAO), (req, res) => {
  const foto = req.body.foto;
  if (foto && !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(foto)) return res.status(400).json({ erro: 'Envie uma imagem.' });
  db.prepare('UPDATE tmkt_espaco_loja SET foto=? WHERE id=? AND empresa_id=?').run(foto || null, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.post('/espaco-loja', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body; if (!b.loja_nome || !b.espaco) return res.status(400).json({ erro: 'Informe loja e espaço.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_espaco_loja (id,empresa_id,loja_id,loja_nome,area,espaco,quantidade,preco_unit,criado_em) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.loja_id || null, b.loja_nome, b.area || null, b.espaco, Number(b.quantidade) || 1, Number(b.preco_unit) || 0);
  res.json({ ok: true, id });
});
router.put('/espaco-loja/:id', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body;
  db.prepare('UPDATE tmkt_espaco_loja SET quantidade=?, preco_unit=? WHERE id=? AND empresa_id=?')
    .run(Number(b.quantidade) || 0, Number(b.preco_unit) || 0, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.delete('/espaco-loja/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Catálogo padrão de farmácia (áreas → espaços com valor de referência) + temas.
const SEED = {
  areas: [
    { nome: 'Frente de loja', espacos: [['Vitrine', 800], ['Tapete/entrada', 600]] },
    { nome: 'Frente de caixa', espacos: [['Balcão de caixa', 500], ['Display de caixa', 400], ['Clip strip caixa', 300]] },
    { nome: 'Ponta de gôndola', espacos: [['Ponta A', 1200], ['Ponta B', 1200], ['Ponta C', 1000]] },
    { nome: 'Ilhas', espacos: [['Ilha central', 1500], ['Ilha promocional', 1000]] },
    { nome: 'Gôndola', espacos: [['Prateleira nobre (altura dos olhos)', 700], ['Faixa de gôndola', 400]] },
    { nome: 'Perfumaria / Dermocosmético', espacos: [['Balcão de perfumaria', 700], ['Test de dermocosmético', 900]] },
    { nome: 'Área externa', espacos: [['Fachada / banner', 500]] },
  ],
  temas: ['Volta às Aulas', 'Dia das Mães', 'Namorados', 'Festa Junina', 'Dia dos Pais', 'Dia das Crianças', 'Black Friday', 'Natal', 'Verão / Proteção Solar', 'Campanha de Gripe', 'Setembro Amarelo', 'Outubro Rosa'],
};
function seedPadrao(emp) {
  const jaArea = db.prepare('SELECT COUNT(*) c FROM tmkt_areas WHERE empresa_id=?').get(emp).c;
  if (jaArea > 0) return { ok: true, jaExiste: true };
  const insA = db.prepare(`INSERT INTO tmkt_areas (id,empresa_id,descricao,criado_em) VALUES (?,?,?,datetime('now'))`);
  const insE = db.prepare(`INSERT INTO tmkt_espacos (id,empresa_id,area_id,descricao,valor_ref,criado_em) VALUES (?,?,?,?,?,datetime('now'))`);
  const insT = db.prepare(`INSERT INTO tmkt_temas (id,empresa_id,descricao,criado_em) VALUES (?,?,?,datetime('now'))`);
  let nA = 0, nE = 0, nT = 0;
  const tx = db.transaction(() => {
    for (const a of SEED.areas) { const aid = uuid(); insA.run(aid, emp, a.nome); nA++; for (const [nome, valor] of a.espacos) { insE.run(uuid(), emp, aid, nome, valor); nE++; } }
    for (const t of SEED.temas) { insT.run(uuid(), emp, t); nT++; }
  });
  tx();
  return { ok: true, areas: nA, espacos: nE, temas: nT };
}
router.post('/seed-padrao', exigePerfil(...GESTAO), (req, res) => res.json(seedPadrao(req.usuario.empresa_id)));

// ── Vendas de espaço (kanban) ────────────────────────────────────────────
function parcelasVenda(id) {
  return db.prepare(`SELECT id, numero, vencimento, valor, recebido, recebido_em, recebido_valor, forma,
      nf_numero, nf_data, nf_valor, informado_por, (comprovante_foto IS NOT NULL) AS tem_comprovante, comprovante_mime, comprovante_em
    FROM tmkt_parcelas WHERE venda_id=? ORDER BY numero`).all(id).map(p => ({ ...p, tem_comprovante: !!p.tem_comprovante }));
}
function resumoVenda(v) {
  const parc = parcelasVenda(v.id);
  const recebido = parc.reduce((a, p) => a + (p.recebido ? (p.recebido_valor || p.valor) : 0), 0);
  const aReceber = (v.valor || 0) - recebido;
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasado = parc.some(p => !p.recebido && p.vencimento && p.vencimento < hoje);
  return { recebido, aReceber, atrasado };
}
router.get('/vendas', (req, res) => {
  const emp = req.usuario.empresa_id;
  const cond = ['empresa_id=?']; const args = [emp];
  if (req.query.busca) { cond.push('(fornecedor_nome LIKE ? OR codigo LIKE ?)'); const b = `%${req.query.busca}%`; args.push(b, b); }
  const rows = db.prepare(`SELECT * FROM tmkt_vendas WHERE ${cond.join(' AND ')} ORDER BY criado_em DESC`).all(...args);
  const espCount = db.prepare('SELECT COUNT(*) n FROM tmkt_venda_espacos WHERE venda_id=?');
  res.json({ status: STATUS, vendas: rows.map(v => ({ ...v, espacos: espCount.get(v.id).n, ...resumoVenda(v) })) });
});
router.get('/vendas/:id', (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT * FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  v.espacos = db.prepare(`SELECT id, espaco_id, espaco_desc, area_desc, valor, quantidade, loja_id, loja_nome, slot,
      modo_venda, insercoes, agenda, criativo_tipo, criativo_texto, (arte_b64 IS NOT NULL) AS tem_arte, arte_mime,
      COALESCE(producao,0) AS producao, COALESCE(producao_custo,0) AS producao_custo, COALESCE(producao_isenta,0) AS producao_isenta,
      briefing, COALESCE(briefing_status,'rascunho') AS briefing_status, COALESCE(arte_status,'pendente') AS arte_status, arte_obs
    FROM tmkt_venda_espacos WHERE venda_id=?`).all(v.id)
    .map(e => ({ ...e, tem_arte: !!e.tem_arte, producao: !!e.producao, producao_isenta: !!e.producao_isenta }));
  v.parcelas = parcelasVenda(v.id);
  v.eans = v.eans_monitorados ? JSON.parse(v.eans_monitorados) : [];
  Object.assign(v, resumoVenda(v));
  res.json({ venda: v });
});
router.post('/vendas', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  if (!b.fornecedor_nome) return res.status(400).json({ erro: 'Informe o fornecedor.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_vendas (id,empresa_id,codigo,fornecedor_id,fornecedor_nome,loja_id,forma_pagamento,tema_id,tema_desc,contrato_url,vigencia_ini,vigencia_fim,valor,status,eans_monitorados,observacao,status_desde,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'))`)
    .run(id, emp, proximoCodigo(emp), b.fornecedor_id || null, b.fornecedor_nome, b.loja_id || null, b.forma_pagamento || null,
      b.tema_id || null, b.tema_desc || null, b.contrato_url || null, b.vigencia_ini || null, b.vigencia_fim || null,
      Number(b.valor) || 0, STATUS.includes(b.status) ? b.status : 'rascunho',
      b.eans ? JSON.stringify(b.eans) : null, b.observacao || null, req.usuario.id);
  res.json({ ok: true, id });
});
router.put('/vendas/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  const campos = ['fornecedor_id', 'fornecedor_nome', 'loja_id', 'forma_pagamento', 'tema_id', 'tema_desc', 'contrato_url', 'vigencia_ini', 'vigencia_fim', 'valor', 'status', 'observacao'];
  const set = [], vals = [];
  campos.forEach(c => { if (c in b) { set.push(`${c}=?`); vals.push(b[c] === '' ? null : b[c]); } });
  if ('eans' in b) { set.push('eans_monitorados=?'); vals.push(b.eans ? JSON.stringify(b.eans) : null); }
  if (set.length) { set.push("atualizado_em=datetime('now')"); db.prepare(`UPDATE tmkt_vendas SET ${set.join(',')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp); }
  res.json({ ok: true });
});
router.post('/vendas/:id/mover', exigePerfil(...GESTAO), (req, res) => {
  const novo = req.body.status;
  if (!STATUS.includes(novo)) return res.status(400).json({ erro: 'Status inválido.' });
  db.prepare("UPDATE tmkt_vendas SET status=?, status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?").run(novo, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.delete('/vendas/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_venda_espacos WHERE venda_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_parcelas WHERE venda_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_vendas WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});

// Espaços vendidos numa venda
router.post('/vendas/:id/espacos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  // Trava do slot: não deixa vender mais vagas do que o espaço-loja tem (quantidade).
  let slot = null;
  if (b.espaco_id) {
    const el = db.prepare('SELECT quantidade FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(b.espaco_id, emp);
    if (el) {
      const ocupados = db.prepare(`SELECT COUNT(*) n FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id
        WHERE ve.espaco_id=? AND v.status IN ${OCUPA_STATUS}`).get(b.espaco_id).n;
      if (ocupados >= (el.quantidade || 0)) return res.status(400).json({ erro: `Espaço esgotado — ${ocupados}/${el.quantidade} vagas já ocupadas.` });
      slot = ocupados + 1;
    }
  }
  db.prepare('INSERT INTO tmkt_venda_espacos (id,empresa_id,venda_id,espaco_id,espaco_desc,area_desc,valor,loja_id,loja_nome,slot) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(), emp, req.params.id, b.espaco_id || null, b.espaco_desc || null, b.area_desc || null, Number(b.valor) || 0, b.loja_id || null, b.loja_nome || null, slot);
  res.json({ ok: true, slot });
});
router.delete('/vendas/:id/espacos/:eid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_venda_espacos WHERE id=? AND venda_id=? AND empresa_id=?').run(req.params.eid, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Parcelas + baixa (recebimento)
router.post('/vendas/:id/parcelas', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  // gera N parcelas a partir de valor total / n, vencendo mensalmente a partir de data_ini
  const n = Math.max(1, Math.min(36, Number(b.parcelas) || 1));
  const total = Number(b.valor) || 0;
  const base = b.primeiro_venc ? new Date(b.primeiro_venc + 'T00:00:00') : new Date();
  const jaTem = db.prepare('SELECT COALESCE(MAX(numero),0) m FROM tmkt_parcelas WHERE venda_id=?').get(req.params.id).m || 0;
  const ins = db.prepare('INSERT INTO tmkt_parcelas (id,empresa_id,venda_id,numero,vencimento,valor,recebido) VALUES (?,?,?,?,?,?,0)');
  const tx = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const d = new Date(base); d.setMonth(d.getMonth() + i);
      ins.run(uuid(), emp, req.params.id, jaTem + i + 1, d.toISOString().slice(0, 10), Math.round((total / n) * 100) / 100);
    }
  });
  tx();
  res.json({ ok: true, geradas: n });
});
router.post('/parcelas/:pid/baixa', exigePerfil(...GESTAO), (req, res) => {
  const p = db.prepare('SELECT * FROM tmkt_parcelas WHERE id=? AND empresa_id=?').get(req.params.pid, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Parcela não encontrada.' });
  const receber = !p.recebido;
  db.prepare('UPDATE tmkt_parcelas SET recebido=?, recebido_em=?, recebido_valor=? WHERE id=?')
    .run(receber ? 1 : 0, receber ? new Date().toISOString().slice(0, 10) : null, receber ? (Number(req.body.valor) || p.valor) : 0, p.id);
  res.json({ ok: true });
});
router.delete('/parcelas/:pid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_parcelas WHERE id=? AND empresa_id=?').run(req.params.pid, req.usuario.empresa_id);
  res.json({ ok: true });
});
// editar a parcela: forma, vencimento, valor + NF da bonificação
router.put('/parcelas/:pid', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const sets = [], vals = [];
  if (b.forma !== undefined) { sets.push('forma=?'); vals.push(b.forma || null); }
  if (b.vencimento !== undefined) { sets.push('vencimento=?'); vals.push(b.vencimento || null); }
  if (b.valor !== undefined) { sets.push('valor=?'); vals.push(Number(b.valor) || 0); }
  if (b.nf_numero !== undefined) { sets.push('nf_numero=?'); vals.push(b.nf_numero || null); }
  if (b.nf_data !== undefined) { sets.push('nf_data=?'); vals.push(b.nf_data || null); }
  if (b.nf_valor !== undefined) { sets.push('nf_valor=?'); vals.push(b.nf_valor === '' ? null : Number(b.nf_valor) || 0); }
  if (!sets.length) return res.json({ ok: true });
  sets.push("informado_por='gestao'");
  db.prepare(`UPDATE tmkt_parcelas SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.pid, emp);
  res.json({ ok: true });
});
// anexo da parcela (comprovante de depósito / e-mail de autorização do abatimento)
router.post('/parcelas/:pid/comprovante', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}; if (!b.foto) return res.status(400).json({ erro: 'Anexe o arquivo.' });
  const r = db.prepare("UPDATE tmkt_parcelas SET comprovante_foto=?, comprovante_mime=?, comprovante_em=datetime('now'), informado_por='gestao' WHERE id=? AND empresa_id=?")
    .run(String(b.foto).slice(0, 8_000_000), b.mime || null, req.params.pid, req.usuario.empresa_id);
  if (!r.changes) return res.status(404).json({ erro: 'Parcela não encontrada.' });
  res.json({ ok: true });
});
router.get('/parcelas/:pid/comprovante', (req, res) => {
  const r = db.prepare('SELECT comprovante_foto, comprovante_mime FROM tmkt_parcelas WHERE id=? AND empresa_id=?').get(req.params.pid, req.usuario.empresa_id);
  if (!r || !r.comprovante_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.comprovante_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.comprovante_mime || 'application/octet-stream'); res.send(Buffer.from(String(r.comprovante_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
// busca de NF do fornecedor no Alpha (p/ a bonificação) — best effort
router.get('/erp/notas', async (req, res) => {
  if (!habilitado()) return res.json({ ok: true, notas: [] });
  const fid = Number(req.query.fornecedor_id) || 0;
  if (!fid) return res.json({ ok: true, notas: [] });
  const num = String(req.query.q || '').replace(/\D/g, '');
  try {
    const sql = `SELECT nf.id, nf.numero, to_char(nf.datahoraentrada,'YYYY-MM-DD') data
      FROM notafiscal nf WHERE nf.fornecedorid=$1 ${num ? "AND nf.numero::text LIKE $2" : ''}
      ORDER BY nf.datahoraentrada DESC LIMIT 15`;
    const notas = await erpQuery(sql, num ? [fid, '%' + num + '%'] : [fid]);
    res.json({ ok: true, notas });
  } catch (e) { res.json({ ok: true, notas: [], erro: 'Busca de NF indisponível.' }); }
});

// ── Sell-out do ERP: vendas dos EANs monitorados no período do contrato × período anterior ──
router.get('/vendas/:id/sellout', async (req, res) => {
  const v = db.prepare('SELECT * FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const eans = v.eans_monitorados ? JSON.parse(v.eans_monitorados) : [];
  if (!eans.length || !v.vigencia_ini || !v.vigencia_fim) return res.json({ ok: false, motivo: 'Defina EANs monitorados e a vigência (início/fim).' });
  if (!habilitado()) return res.status(503).json({ erro: 'ERP indisponível.' });
  const ini = v.vigencia_ini, fim = v.vigencia_fim;
  const dias = Math.max(1, Math.round((new Date(fim) - new Date(ini)) / 86400000));
  const antIni = new Date(new Date(ini).getTime() - dias * 86400000).toISOString().slice(0, 10);
  // filtro de loja: se a venda tem loja, usa a unidade do ERP
  const loja = v.loja_id ? db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(v.loja_id) : null;
  const uni = loja && loja.erp_unidadenegocio_id ? loja.erp_unidadenegocio_id : null;
  const sql = `SELECT e.codigobarras ean, sum(iv.quantidade) qt, sum(iv.valortotal) vl
    FROM itemvenda iv JOIN embalagem e ON e.id=iv.embalagemid JOIN venda v ON v.id=iv.vendaid
    WHERE e.codigobarras = ANY($1::text[]) AND v.status='F'
      AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)
      ${uni ? 'AND v.unidadenegocioid=$4' : ''} GROUP BY 1`;
  try {
    const pCon = [eans, ini, fim]; if (uni) pCon.push(uni);
    const pAnt = [eans, antIni, ini]; if (uni) pAnt.push(uni);
    const [con, ant] = await Promise.all([erpQuery(sql, pCon), erpQuery(sql, pAnt)]);
    const mapa = {};
    eans.forEach(x => mapa[x] = { ean: x, qtd_contrato: 0, valor_contrato: 0, qtd_anterior: 0, valor_anterior: 0 });
    con.forEach(r => { if (mapa[r.ean]) { mapa[r.ean].qtd_contrato = Number(r.qt) || 0; mapa[r.ean].valor_contrato = Number(r.vl) || 0; } });
    ant.forEach(r => { if (mapa[r.ean]) { mapa[r.ean].qtd_anterior = Number(r.qt) || 0; mapa[r.ean].valor_anterior = Number(r.vl) || 0; } });
    const itens = Object.values(mapa).map(m => ({ ...m, variacao: m.valor_anterior ? Math.round((m.valor_contrato - m.valor_anterior) / m.valor_anterior * 100) : null }));
    res.json({ ok: true, periodo: { ini, fim, dias, antIni }, loja: uni ? true : false, itens });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// ── ERP: fornecedor + produto (para EAN monitorado) + lojas ──────────────
router.get('/erp/fornecedores', async (req, res) => {
  if (!habilitado() || (req.query.q || '').length < 2) return res.json({ fornecedores: [] });
  try {
    const r = await erpQuery(`SELECT f.id, p.nome FROM fornecedor f JOIN pessoa p ON p.id=f.pessoaid WHERE f.status='A' AND p.nome ILIKE $1 ORDER BY p.nome LIMIT 20`, [`%${req.query.q}%`]);
    res.json({ fornecedores: r.map(x => ({ id: String(x.id), nome: x.nome })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.get('/erp/produtos', async (req, res) => {
  if (!habilitado() || (req.query.q || '').length < 2) return res.json({ produtos: [] });
  try {
    const r = await erpQuery(`SELECT DISTINCT ON (p.id) p.id, p.descricao nome, e.codigobarras ean FROM produto p JOIN embalagem e ON e.produtoid=p.id
      WHERE p.descricao ILIKE $1 OR e.codigobarras ILIKE $1 ORDER BY p.id, length(e.codigobarras) DESC LIMIT 20`, [`%${req.query.q}%`]);
    res.json({ produtos: r.map(x => ({ id: String(x.id), nome: x.nome, ean: x.ean })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
// escopo do Alpha p/ a ação do calendário (produto/fornecedor/laboratório/classificação/caderno/pessoa/grupos)
router.get('/erp/escopo', async (req, res) => {
  const tipo = req.query.tipo, q = (req.query.q || '').trim();
  if (!habilitado()) return res.json({ itens: [] });
  if (q.length < 2 && tipo !== 'caderno') return res.json({ itens: [] });
  const like = `%${q}%`;
  try {
    let rows = [];
    if (tipo === 'produto') rows = await erpQuery(`SELECT DISTINCT ON (p.id) p.id, p.descricao nome, e.codigobarras ean FROM produto p JOIN embalagem e ON e.produtoid=p.id WHERE p.descricao ILIKE $1 OR e.codigobarras ILIKE $1 ORDER BY p.id, length(e.codigobarras) DESC LIMIT 25`, [like]);
    else if (tipo === 'fornecedor') rows = await erpQuery(`SELECT f.id, pe.nome FROM fornecedor f JOIN pessoa pe ON pe.id=f.pessoaid WHERE f.status='A' AND pe.nome ILIKE $1 ORDER BY pe.nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'laboratorio') rows = await erpQuery(`SELECT f.id, pe.nome FROM fabricante f JOIN pessoa pe ON pe.id=f.pessoaid WHERE pe.nome ILIKE $1 ORDER BY pe.nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'classificacao') rows = await erpQuery(`SELECT id, nome FROM classificacao WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'caderno') rows = await erpQuery(`SELECT id, nome, to_char(datahorainicial,'DD/MM/YYYY') ini, to_char(datahorafinal,'DD/MM/YYYY') fim FROM cadernooferta WHERE nome ILIKE $1 ORDER BY datahorainicial DESC NULLS LAST LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'pessoa') rows = await erpQuery(`SELECT id, nome FROM pessoa WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'grupo_remarcacao') rows = await erpQuery(`SELECT id, nome FROM gruporemarcacao WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'grupo_preco') rows = await erpQuery(`SELECT id, nome FROM grupopreco WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [like]).catch(() => []);
    res.json({ itens: rows.map(x => ({ id: String(x.id), nome: x.nome + (x.ini ? ` (${x.ini}–${x.fim})` : ''), ean: x.ean || null })) });
  } catch (e) { res.json({ itens: [], erro: e.message }); }
});

// ── Custos / prestação de contas (interno): resultado real do trade = valor − custos ────────────
router.get('/vendas/:id/custos', (req, res) => {
  const v = db.prepare('SELECT valor FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const custos = db.prepare(`SELECT id, descricao, categoria, valor, data, (comprovante_foto IS NOT NULL) AS tem_comprovante, criado_em FROM tmkt_custo WHERE empresa_id=? AND venda_id=? ORDER BY criado_em`).all(req.usuario.empresa_id, req.params.id);
  const totalCusto = custos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const recebido = db.prepare(`SELECT COALESCE(SUM(recebido_valor),0) r FROM tmkt_parcelas WHERE venda_id=? AND recebido=1`).get(req.params.id).r;
  res.json({ ok: true, valor: v.valor, recebido, custos, totalCusto, resultado: Math.round((Number(v.valor) - totalCusto) * 100) / 100 });
});
router.post('/vendas/:id/custos', exigePerfil(...GESTAO), (req, res) => {
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const b = req.body || {};
  if (!(Number(b.valor) > 0)) return res.status(400).json({ erro: 'Informe o valor do custo.' });
  db.prepare(`INSERT INTO tmkt_custo (id, empresa_id, venda_id, descricao, categoria, valor, data, comprovante_foto, comprovante_mime, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), req.usuario.empresa_id, req.params.id, b.descricao || null, b.categoria || 'outro', Number(b.valor), b.data || null, b.comprovante || null, b.comprovante ? (b.mime || 'image/jpeg') : null, req.usuario.id);
  res.status(201).json({ ok: true });
});
router.delete('/custos/:cid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_custo WHERE id=? AND empresa_id=?').run(req.params.cid, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── COBRANÇA: parcelas a receber com alerta de vencido / a vencer ───────────────────────────────
router.get('/cobranca', (req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT p.id, p.venda_id, p.numero, p.vencimento, p.valor, p.forma, p.recebido, p.recebido_valor,
      (p.comprovante_em IS NOT NULL) AS tem_comprovante, v.codigo, v.fornecedor_nome, v.contato_email, v.contato_nome, v.token, v.status AS venda_status
    FROM tmkt_parcelas p JOIN tmkt_vendas v ON v.id=p.venda_id
    WHERE p.empresa_id=? AND v.status<>'cancelado' ORDER BY p.vencimento NULLS LAST, v.codigo`).all(req.usuario.empresa_id);
  const parcelas = rows.map(p => {
    const situacao = p.recebido ? 'pago' : (p.vencimento && p.vencimento < hoje ? 'vencido' : 'a_vencer');
    const diasAtraso = (!p.recebido && p.vencimento && p.vencimento < hoje) ? Math.round((new Date(hoje) - new Date(p.vencimento)) / 864e5) : 0;
    return { ...p, tem_comprovante: !!p.tem_comprovante, situacao, dias_atraso: diasAtraso };
  });
  const aberto = parcelas.filter(p => !p.recebido);
  const resumo = {
    total_aberto: Math.round(aberto.reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100,
    vencido: aberto.filter(p => p.situacao === 'vencido').length,
    valor_vencido: Math.round(aberto.filter(p => p.situacao === 'vencido').reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100,
    com_comprovante_pendente: aberto.filter(p => p.tem_comprovante).length, // fornecedor anexou mas não demos baixa
  };
  res.json({ ok: true, parcelas, resumo, smtp: smtpOk() });
});
// dispara e-mail de cobrança ao fornecedor de uma negociação (parcelas em aberto)
router.post('/cobranca/email', exigePerfil(...GESTAO), async (req, res) => {
  try {
    const r = await cobrarVenda(req.usuario.empresa_id, req.body.venda_id, true);
    res.json({ ok: true, enviado_para: r.to });
  } catch (e) { res.status(/não encontrada|não tem|aberto|SMTP/i.test(e.message) ? 400 : 502).json({ erro: e.message }); }
});
// configuração da cobrança automática (opt-in por empresa): liga/desliga + janela de reenvio
router.get('/cobranca/config', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const g = c => (db.prepare('SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?').get(emp, c) || {}).valor;
  res.json({ ok: true, auto: g('tmkt_cobranca_auto') === '1', dias: Number(g('tmkt_cobranca_dias')) || 3, smtp: smtpOk() });
});
router.post('/cobranca/config', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const set = (c, v) => db.prepare(`INSERT INTO configuracoes (empresa_id, chave, valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET valor=excluded.valor`).run(emp, c, String(v));
  set('tmkt_cobranca_auto', req.body.auto ? '1' : '0');
  const dias = Math.max(1, Math.min(60, Number(req.body.dias) || 3));
  set('tmkt_cobranca_dias', dias);
  res.json({ ok: true, auto: !!req.body.auto, dias });
});

// ── COMPROMISSO DE COMPRA: quanto a empresa JÁ COMPROU do fornecedor × o combinado (alerta) ─────
function periodoCompromisso(periodicidade, iniFixo, fimFixo) {
  const d = x => x.toISOString().slice(0, 10); if (iniFixo && fimFixo) return { ini: iniFixo, fim: fimFixo };
  const n = new Date();
  if (periodicidade === 'trimestral') { const q = Math.floor(n.getMonth() / 3); return { ini: d(new Date(n.getFullYear(), q * 3, 1)), fim: d(new Date(n.getFullYear(), q * 3 + 3, 0)) }; }
  if (periodicidade === 'semestral') { const h = n.getMonth() < 6 ? 0 : 6; return { ini: d(new Date(n.getFullYear(), h, 1)), fim: d(new Date(n.getFullYear(), h + 6, 0)) }; }
  return { ini: d(new Date(n.getFullYear(), n.getMonth(), 1)), fim: d(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
}
async function comprasPorEscopo(tipo, refs, ini, fim) {
  if (!habilitado() || !Array.isArray(refs) || !refs.length) return 0;
  const base = `FROM itemnotafiscal it JOIN notafiscal nf ON nf.id=it.notafiscalid`;
  const per = `nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + 1)`;
  let sql, params;
  try {
    if (tipo === 'produto') { const e = refs.map(r => r.ean).filter(Boolean); if (!e.length) return 0; sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} WHERE it.codigobarras = ANY($1::text[]) AND ${per}`; params = [e, ini, fim]; }
    else if (tipo === 'fornecedor') { sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} WHERE nf.fornecedorid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else if (tipo === 'laboratorio') { sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} JOIN embalagem e ON e.codigobarras=it.codigobarras JOIN produto pr ON pr.id=e.produtoid WHERE pr.fabricanteid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else if (tipo === 'classificacao' || tipo === 'grupo') { sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} JOIN embalagem e ON e.codigobarras=it.codigobarras JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid WHERE cp.classificacaoid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else return 0;
    const r = await erpQuery(sql, params); return Number(r[0].v) || 0;
  } catch { return 0; }
}
router.get('/compromissos', async (req, res) => {
  const vendas = db.prepare(`SELECT id, codigo, fornecedor_nome, meta_compra_valor, meta_escopo_tipo, meta_escopo_ref, meta_periodicidade, meta_periodo_ini, meta_periodo_fim, status
    FROM tmkt_vendas WHERE empresa_id=? AND meta_compra_valor>0 AND status<>'cancelado' ORDER BY codigo`).all(req.usuario.empresa_id);
  const hoje = new Date();
  const out = [];
  for (const v of vendas) {
    const refs = v.meta_escopo_ref ? (() => { try { return JSON.parse(v.meta_escopo_ref); } catch { return []; } })() : [];
    const per = periodoCompromisso(v.meta_periodicidade, v.meta_periodo_ini, v.meta_periodo_fim);
    const comprado = await comprasPorEscopo(v.meta_escopo_tipo, refs, per.ini, per.fim);
    const pct = v.meta_compra_valor ? Math.round(comprado / v.meta_compra_valor * 100) : 0;
    const diasRestantes = Math.max(0, Math.round((new Date(per.fim) - hoje) / 864e5));
    const falta = Math.max(0, Math.round((v.meta_compra_valor - comprado) * 100) / 100);
    // alerta: ainda falta comprar e resta pouco tempo (≤10 dias) ou já venceu o período
    const alerta = falta > 0 && (diasRestantes <= 10);
    out.push({ id: v.id, codigo: v.codigo, fornecedor: v.fornecedor_nome, periodicidade: v.meta_periodicidade || 'mensal',
      periodo: per, meta: v.meta_compra_valor, comprado: Math.round(comprado * 100) / 100, pct, falta, dias_restantes: diasRestantes, alerta, escopo_tipo: v.meta_escopo_tipo, refs });
  }
  res.json({ ok: true, compromissos: out, resumo: { total: out.length, em_alerta: out.filter(x => x.alerta).length } });
});

// ════════════ PORTAL DO FORNECEDOR — gestão (Fase 2) ════════════
const soDig = s => String(s || '').replace(/\D/g, '');
const padCnpj = d => { d = soDig(d); return (d && d.length < 14) ? d.padStart(14, '0') : d; };

// pedidos vindos do portal (pendentes de aprovação) + os já aprovados
router.get('/portal/pedidos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const status = req.query.status || 'pedido';
  const vendas = db.prepare(`SELECT id, codigo, fornecedor_nome, fornecedor_cnpj, contato_nome, contato_email, contato_fone,
      valor, status, origem, forma_pagamento, vigencia_ini, vigencia_fim, escopo_tipo, escopo_ref, observacao, criado_em
    FROM tmkt_vendas WHERE empresa_id=? AND origem IN ('portal','recompra') AND status=? ORDER BY criado_em DESC`).all(emp, status);
  const espSt = db.prepare(`SELECT id, espaco_id, espaco_desc, area_desc, valor, quantidade, loja_nome,
      modo_venda, insercoes, agenda, criativo_tipo, criativo_texto, (arte_b64 IS NOT NULL) AS tem_arte, arte_mime,
      COALESCE(producao,0) AS producao, COALESCE(producao_custo,0) AS producao_custo, COALESCE(producao_isenta,0) AS producao_isenta,
      briefing, COALESCE(briefing_status,'rascunho') AS briefing_status, COALESCE(arte_status,'pendente') AS arte_status, arte_obs
    FROM tmkt_venda_espacos WHERE empresa_id=? AND venda_id=?`);
  res.json({
    ok: true,
    pedidos: vendas.map(v => ({
      ...v,
      espacos: espSt.all(emp, v.id).map(e => ({ ...e, tem_arte: !!e.tem_arte, producao: !!e.producao, producao_isenta: !!e.producao_isenta })),
      escopo: v.escopo_ref ? (() => { try { return JSON.parse(v.escopo_ref); } catch { return []; } })() : []
    }))
  });
});
// ── APROVAÇÃO DE MATERIAL (arte fechada) ──────────────────────────────────
// serve a arte anexada de um item (preview p/ a gestão)
router.get('/portal/item/:id/arte', (req, res) => {
  const emp = req.usuario.empresa_id;
  const r = db.prepare('SELECT arte_b64, arte_mime FROM tmkt_venda_espacos WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!r || !r.arte_b64) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.arte_b64 || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.arte_mime || 'image/jpeg'); res.send(Buffer.from(String(r.arte_b64).replace(/^data:[^,]+,/, ''), 'base64'));
});
// gestão aprova a arte do item
router.post('/portal/item/:id/arte-aprovar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const r = db.prepare(`UPDATE tmkt_venda_espacos SET arte_status='aprovada', arte_obs=NULL WHERE id=? AND empresa_id=?`).run(req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Item não encontrado.' });
  res.json({ ok: true });
});
// gestão reprova a arte do item (com motivo → fornecedor reenvia)
router.post('/portal/item/:id/arte-reprovar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const motivo = String((req.body || {}).motivo || '').slice(0, 1000) || 'Ajuste necessário.';
  const r = db.prepare(`UPDATE tmkt_venda_espacos SET arte_status='reprovada', arte_obs=? WHERE id=? AND empresa_id=?`).run(motivo, req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Item não encontrado.' });
  res.json({ ok: true });
});
// gestão sobe a arte produzida pela Mutti (itens de produção) → entra como "enviada" p/ aprovação
router.post('/portal/item/:id/arte', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.arte) return res.status(400).json({ erro: 'Anexe a arte.' });
  const r = db.prepare(`UPDATE tmkt_venda_espacos SET arte_b64=?, arte_mime=?, criativo_tipo='anexo', arte_status='enviada', arte_obs=NULL WHERE id=? AND empresa_id=?`)
    .run(String(b.arte).slice(0, 8_000_000), b.mime || null, req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Item não encontrado.' });
  res.json({ ok: true });
});
// gestão isenta (ou volta a cobrar) o custo da produção de arte (+R$150) — ajusta o valor do item e da venda
router.post('/portal/item/:id/isentar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const it = db.prepare('SELECT id, venda_id, valor, producao, COALESCE(producao_custo,0) producao_custo, COALESCE(producao_isenta,0) producao_isenta FROM tmkt_venda_espacos WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  if (!it.producao) return res.status(400).json({ erro: 'Este item não tem produção de arte.' });
  const isenta = (req.body || {}).isenta === false ? 0 : 1; // default: isentar
  if (isenta === it.producao_isenta) return res.json({ ok: true, isenta: !!isenta }); // nada muda
  const custo = it.producao_custo || 150;
  const delta = isenta ? -custo : custo; // isentar tira o custo; voltar a cobrar soma
  const tx = db.transaction(() => {
    db.prepare('UPDATE tmkt_venda_espacos SET producao_isenta=?, valor=? WHERE id=?').run(isenta, Math.max(0, (it.valor || 0) + delta), it.id);
    db.prepare(`UPDATE tmkt_vendas SET valor=MAX(0, COALESCE(valor,0)+?), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(delta, it.venda_id, emp);
  });
  tx();
  res.json({ ok: true, isenta: !!isenta });
});
// aprovar pedido do portal (vira ação vigente)
router.post('/portal/pedido/:id/aprovar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT id, status FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const novo = req.body.status === 'vendido' ? 'vendido' : 'vigente';
  db.prepare(`UPDATE tmkt_vendas SET status=?, status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(novo, req.params.id, emp);
  res.json({ ok: true, status: novo });
});
router.post('/portal/pedido/:id/recusar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare(`UPDATE tmkt_vendas SET status='recusado', status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(req.params.id, emp);
  res.json({ ok: true });
});

// fornecedores LIBERADOS (allowlist de acesso ao portal)
router.get('/portal/liberados', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare('SELECT documento, nome, observacao, ativo, criado_em FROM tmkt_acesso_liberado WHERE empresa_id=? ORDER BY criado_em DESC').all(emp);
  res.json({ ok: true, liberados: rows });
});
router.post('/portal/liberados', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const doc = padCnpj(req.body.documento);
  if (doc.length !== 14) return res.status(400).json({ erro: 'Informe um CNPJ válido (14 dígitos).' });
  db.prepare(`INSERT INTO tmkt_acesso_liberado (empresa_id, documento, nome, observacao, ativo, criado_por)
      VALUES (?,?,?,?,1,?) ON CONFLICT(empresa_id,documento) DO UPDATE SET nome=excluded.nome, observacao=excluded.observacao, ativo=1`)
    .run(emp, doc, req.body.nome || null, req.body.observacao || null, req.usuario.nome || req.usuario.id || null);
  res.json({ ok: true });
});
router.delete('/portal/liberados/:doc', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_acesso_liberado WHERE empresa_id=? AND documento=?').run(req.usuario.empresa_id, padCnpj(req.params.doc));
  res.json({ ok: true });
});
// interessados (bloqueados na porta de entrada) + liberar com 1 clique
router.get('/portal/interesse', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare('SELECT id, cnpj, cpf, nome, telefone, email, motivo, liberado, criado_em FROM tmkt_interesse WHERE empresa_id=? ORDER BY liberado, criado_em DESC').all(emp);
  res.json({ ok: true, interessados: rows });
});
router.post('/portal/interesse/:id/liberar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const it = db.prepare('SELECT * FROM tmkt_interesse WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!it) return res.status(404).json({ erro: 'Interessado não encontrado.' });
  const doc = padCnpj(it.cnpj);
  if (doc.length === 14) {
    db.prepare(`INSERT INTO tmkt_acesso_liberado (empresa_id, documento, nome, observacao, ativo, criado_por)
        VALUES (?,?,?,?,1,?) ON CONFLICT(empresa_id,documento) DO UPDATE SET ativo=1`)
      .run(emp, doc, it.nome || null, 'Liberado da lista de interessados', req.usuario.nome || null);
  }
  db.prepare('UPDATE tmkt_interesse SET liberado=1 WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});

// definir/editar a POSIÇÃO à venda (quantidade de vagas, preço, disponível, destaque)
router.patch('/portal/espaco/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const e = db.prepare('SELECT id FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!e) return res.status(404).json({ erro: 'Espaço não encontrado.' });
  const sets = [], vals = [];
  if (b.quantidade != null) { sets.push('quantidade=?'); vals.push(Math.max(1, Number(b.quantidade) || 1)); }
  if (b.preco_unit != null) { sets.push('preco_unit=?'); vals.push(Number(b.preco_unit) || 0); }
  if (b.disponivel != null) { sets.push('disponivel=?'); vals.push(b.disponivel ? 1 : 0); }
  if (b.destaque != null) { sets.push('destaque=?'); vals.push(b.destaque ? 1 : 0); }
  if (b.midia != null) { sets.push('midia=?'); vals.push(['off', 'on', 'ambos'].includes(b.midia) ? b.midia : 'off'); }
  if (b.unidade != null) { sets.push('unidade=?'); vals.push(['mes', 'dia', 'semana', 'edicao', 'periodo'].includes(b.unidade) ? b.unidade : 'mes'); }
  if (b.modo_venda != null) { sets.push('modo_venda=?'); vals.push(b.modo_venda === 'insercao' ? 'insercao' : 'periodo'); }
  if (b.limite_dia != null) { sets.push('limite_dia=?'); vals.push(b.limite_dia === '' ? null : Math.max(0, Number(b.limite_dia) || 0)); }
  if (b.limite_mes != null) { sets.push('limite_mes=?'); vals.push(b.limite_mes === '' ? null : Math.max(0, Number(b.limite_mes) || 0)); }
  if (b.espaco != null) { const nome = String(b.espaco).trim(); if (nome) { sets.push('espaco=?'); vals.push(nome); } }
  if (b.tamanho != null) { sets.push('tamanho=?'); vals.push(String(b.tamanho).trim() || null); }
  if (b.descricao != null) { sets.push('descricao=?'); vals.push(String(b.descricao).trim() || null); }
  if (b.foto != null) { sets.push('foto=?'); vals.push((b.foto && /^data:image\//.test(b.foto)) ? String(b.foto).slice(0, 8_000_000) : null); }
  if (!sets.length) return res.status(400).json({ erro: 'Nada para atualizar.' });
  vals.push(req.params.id, emp);
  db.prepare(`UPDATE tmkt_espaco_loja SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals);
  res.json({ ok: true });
});

// replicar os valores de UMA posição p/ todas as lojas que têm uma posição com o mesmo nome (mesmo segmento)
// — atende "preencher por loja ou todas de uma vez" sem recadastrar loja por loja.
router.delete('/portal/espaco/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const info = db.prepare('DELETE FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  if (!info.changes) return res.status(404).json({ erro: 'Espaço não encontrado.' });
  res.json({ ok: true });
});
router.post('/portal/espaco/:id/replicar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const base = db.prepare('SELECT * FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!base) return res.status(404).json({ erro: 'Posição não encontrada.' });
  const upd = db.prepare(`UPDATE tmkt_espaco_loja SET preco_unit=?, quantidade=?, midia=?, modo_venda=?, unidade=?, disponivel=?
     WHERE empresa_id=? AND segmento=? AND espaco=? AND id<>?`);
  const r = upd.run(base.preco_unit, base.quantidade, base.midia, base.modo_venda, base.unidade, base.disponivel,
    emp, base.segmento, base.espaco, base.id);
  res.json({ ok: true, atualizadas: r.changes });
});

// criar uma nova posição comercializável
// token de acesso de PRÉVIA — a gestão embute o portal (/trade.html?edit=1) num iframe p/ o editor
// visual; este token persistente abre o catálogo sem precisar do portão de identificação.
router.get('/portal/preview-token', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const token = 'preview-gestao-' + emp;
  try {
    if (!db.prepare('SELECT token FROM tmkt_acesso_sessao WHERE token=?').get(token))
      db.prepare(`INSERT INTO tmkt_acesso_sessao (token, empresa_id, cnpj, cpf, nome, via, criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`).run(token, emp, '', '', 'Prévia da gestão (editor)', 'gestao');
  } catch (e) { return res.status(500).json({ erro: e.message }); }
  res.json({ ok: true, token });
});
router.post('/portal/espaco', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const seg = String(b.segmento || '').trim();
  const SEGS = ['off', 'allline', 'digital', 'encarte', 'ecommerce', 'crm', 'social', 'radio', 'endomarketing'];
  if (!SEGS.includes(seg)) return res.status(400).json({ erro: 'Módulo inválido.' });
  const espaco = String(b.espaco || '').trim();
  if (!espaco) return res.status(400).json({ erro: 'Dê um nome à posição.' });
  const REDE = ['encarte', 'ecommerce', 'crm', 'social', 'endomarketing'];
  // local: rede = ESCRITÓRIO; rádio interna = ESCRITÓRIO; demais = loja/cidade informada
  let loja_nome = String(b.loja_nome || '').trim();
  if (REDE.includes(seg)) loja_nome = loja_nome || 'ESCRITÓRIO'; // rede toda (ESCRITÓRIO) OU por bandeira
  else if (!loja_nome) loja_nome = seg === 'radio' ? 'Esplanada' : 'ESCRITÓRIO';
  const id = require('crypto').randomUUID();
  const fisico = ['off', 'allline', 'digital'].includes(seg);
  const midia = fisico ? (['off', 'on', 'ambos'].includes(b.midia) ? b.midia : 'ambos') : null;
  const modo_venda = b.modo_venda === 'insercao' ? 'insercao' : (['social', 'radio'].includes(seg) ? 'insercao' : 'periodo');
  const unidade = ['mes', 'dia', 'semana', 'edicao', 'periodo'].includes(b.unidade) ? b.unidade
    : (seg === 'encarte' ? 'edicao' : fisico ? 'periodo' : 'mes');
  const foto = (b.foto && /^data:image\//.test(b.foto)) ? String(b.foto).slice(0, 8_000_000) : null;
  db.prepare(`INSERT INTO tmkt_espaco_loja (id, empresa_id, segmento, area, espaco, tamanho, descricao, loja_nome, loja_id, preco_unit, quantidade, midia, modo_venda, unidade, foto, disponivel, destaque)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)`)
    .run(id, emp, seg, String(b.area || '').trim() || null, espaco, String(b.tamanho || '').trim() || null,
      String(b.descricao || '').trim() || null, loja_nome, b.loja_id || null,
      Number(b.preco_unit) || 0, Math.max(1, Number(b.quantidade) || 1), midia, modo_venda, unidade, foto);
  res.json({ ok: true, id });
});
// lista TUDO que é comercializável p/ a gestão configurar + disponibilidade
// (e-commerce/rádio/CRM/tabloide = PADRÃO DA REDE; espaços físicos = POR LOJA)
router.get('/portal/posicoes', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT id, segmento, area, espaco, tamanho, descricao, loja_nome, preco_unit, quantidade, COALESCE(modo_venda,'periodo') modo_venda, midia, COALESCE(unidade,'mes') unidade, limite_dia, limite_mes, (foto IS NOT NULL AND foto<>'') AS tem_foto, COALESCE(disponivel,1) disponivel, COALESCE(destaque,0) destaque
    FROM tmkt_espaco_loja WHERE empresa_id=?
    ORDER BY segmento, loja_nome, area, espaco`).all(emp);
  // ocupação atual (vagas já reservadas em vendas ativas, independentemente do período)
  const OCUPA = ['pedido', 'rascunho', 'negociacao', 'vendido', 'vigente', 'concluido'];
  const ph = OCUPA.map(() => '?').join(',');
  const ocup = db.prepare(`SELECT ve.espaco_id, COALESCE(SUM(ve.quantidade),0) q
    FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id
    WHERE ve.empresa_id=? AND v.status IN (${ph}) GROUP BY ve.espaco_id`).all(emp, ...OCUPA);
  const ocupMap = {}; ocup.forEach(o => { ocupMap[o.espaco_id] = o.q; });
  // comprometido com PLANO publicado (cota-weighted) — p/ só oferecer estoque livre não vinculado a plano
  let planoMap = {};
  try {
    const pl = db.prepare(`SELECT pe.espaco_id, SUM(pe.quantidade * COALESCE(
        (SELECT c.quantidade FROM tmkt_plano_cotas c WHERE c.id=pe.cota_id),
        (SELECT SUM(c2.quantidade) FROM tmkt_plano_cotas c2 WHERE c2.plano_id=p.id),
        p.cota_qtd, 1)) q
      FROM tmkt_plano_espacos pe JOIN tmkt_plano p ON p.id=pe.plano_id
      WHERE pe.empresa_id=? AND p.status IN ('publicado','vigente') GROUP BY pe.espaco_id`).all(emp);
    pl.forEach(x => { planoMap[x.espaco_id] = x.q; });
  } catch (e) { planoMap = {}; }
  const REDE = ['encarte', 'ecommerce', 'crm', 'social', 'endomarketing'];
  res.json({
    ok: true,
    posicoes: rows.map(r => {
      // rádio externa = por CIDADE (local = cidade); rádio interna + demais rede = ESCRITÓRIO; físicos = por loja
      const radioInterna = r.segmento === 'radio' && /interna/i.test(r.area || '');
      const rede = REDE.includes(r.segmento) || radioInterna;
      const radioExterna = r.segmento === 'radio' && !radioInterna;
      return {
        ...r,
        tem_foto: !!r.tem_foto,
        escopo: rede ? 'rede' : radioExterna ? 'cidade' : 'loja',
        local: rede ? (r.loja_nome || 'ESCRITÓRIO') : (r.loja_nome || '—'),
        ocupadas: ocupMap[r.id] || 0,
        comprometido_plano: planoMap[r.id] || 0,
        livres: Math.max(0, (Number(r.quantidade) || 1) - (ocupMap[r.id] || 0)),
        livre_real: Math.max(0, (Number(r.quantidade) || 1) - (ocupMap[r.id] || 0) - (planoMap[r.id] || 0))
      };
    })
  });
});

// ── PLANOS COMERCIAIS (gestão) ────────────────────────────────────────────
// campos de texto/numéricos editáveis direto
const PLANO_CAMPOS = ['nome', 'tema', 'ano', 'chamada', 'contexto', 'mercado', 'periodo', 'pracas', 'frequencia', 'formato',
  'cota_tipo', 'cota_qtd', 'cota_prazo', 'investimento', 'investimento_obs', 'observacoes', 'destaque', 'status', 'ordem',
  'veic_ini', 'veic_fim', 'por_que', 'o_que_mostrar', 'publico', 'produtos_foco', 'sellout_potencial',
  'oportunidades', 'conteudo_redes', 'midias_on', 'midias_off', 'midias_online'];
const PLANO_JSON = ['provas_json', 'formatos_json', 'lojas_json', 'faq_json']; // aceitam array no body ou string json
function planoBody(b) {
  const sets = [], vals = [];
  PLANO_CAMPOS.forEach(k => { if (b[k] !== undefined) { sets.push(`${k}=?`); vals.push(k === 'destaque' ? (b[k] ? 1 : 0) : (b[k] === '' ? null : b[k])); } });
  // aceita formatos/lojas/provas/faq como array OU string json
  [['formatos', 'formatos_json'], ['lojas', 'lojas_json'], ['provas', 'provas_json'], ['faq', 'faq_json']].forEach(([a, col]) => {
    if (b[a] !== undefined) { sets.push(`${col}=?`); vals.push(b[a] == null ? null : JSON.stringify(b[a]).slice(0, 8000)); }
    else if (b[col] !== undefined) { sets.push(`${col}=?`); vals.push(b[col] || null); }
  });
  return { sets, vals };
}
const parseJ = s => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

router.get('/portal/planos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const planos = db.prepare(`SELECT id, nome, tema, ano, periodo, chamada, investimento, destaque, status, ordem,
      (capa_foto IS NOT NULL AND capa_foto<>'') AS tem_capa FROM tmkt_plano WHERE empresa_id=? ORDER BY ordem, criado_em DESC`).all(emp);
  const nLink = db.prepare('SELECT plano_id, COUNT(*) n, COALESCE(SUM(quantidade),0) q FROM tmkt_plano_espacos WHERE empresa_id=? GROUP BY plano_id').all(emp);
  const map = {}; nLink.forEach(x => { map[x.plano_id] = x; });
  res.json({ ok: true, planos: planos.map(p => ({ ...p, tem_capa: !!p.tem_capa, posicoes: map[p.id] ? map[p.id].n : 0, vagas: map[p.id] ? map[p.id].q : 0 })) });
});
router.get('/portal/plano/:id', (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM tmkt_plano WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Plano não encontrado.' });
  const espacos = db.prepare(`SELECT pe.id, pe.espaco_id, pe.quantidade, pe.cota_id, el.espaco, el.loja_nome, el.segmento, el.preco_unit, el.modo_venda
      FROM tmkt_plano_espacos pe LEFT JOIN tmkt_espaco_loja el ON el.id=pe.espaco_id
      WHERE pe.empresa_id=? AND pe.plano_id=?`).all(emp, req.params.id);
  const cotas = db.prepare('SELECT id, nome, preco, quantidade, cor, ordem FROM tmkt_plano_cotas WHERE empresa_id=? AND plano_id=? ORDER BY ordem, criado_em').all(emp, req.params.id);
  const fotos = db.prepare('SELECT id, legenda, secao, ordem FROM tmkt_plano_fotos WHERE empresa_id=? AND plano_id=? ORDER BY ordem, criado_em').all(emp, req.params.id);
  res.json({ ok: true, plano: { ...p, tem_capa: !!(p.capa_foto && p.capa_foto !== ''), formatos: parseJ(p.formatos_json), provas: parseJ(p.provas_json), lojas: parseJ(p.lojas_json), faq: parseJ(p.faq_json) }, espacos, cotas, fotos });
});
// galeria de fotos do plano
router.get('/portal/plano/:id/foto/:fid', (req, res) => {
  const r = db.prepare('SELECT foto FROM tmkt_plano_fotos WHERE id=? AND plano_id=? AND empresa_id=?').get(req.params.fid, req.params.id, req.usuario.empresa_id);
  if (!r || !r.foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', 'image/jpeg'); res.send(Buffer.from(String(r.foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
router.post('/portal/plano/:id/foto', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.foto) return res.status(400).json({ erro: 'Anexe a imagem.' });
  const secao = b.secao ? String(b.secao).slice(0, 40) : null;
  // banner de bloco é 1 por seção → substitui o anterior; galeria geral (sem seção) acumula
  if (secao) db.prepare('DELETE FROM tmkt_plano_fotos WHERE empresa_id=? AND plano_id=? AND secao=?').run(emp, req.params.id, secao);
  const n = db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM tmkt_plano_fotos WHERE empresa_id=? AND plano_id=?').get(emp, req.params.id).m;
  const id = uuid();
  db.prepare('INSERT INTO tmkt_plano_fotos (id, empresa_id, plano_id, foto, legenda, secao, ordem, criado_em) VALUES (?,?,?,?,?,?,?, datetime(\'now\'))')
    .run(id, emp, req.params.id, String(b.foto).slice(0, 8_000_000), b.legenda || null, secao, n + 1);
  res.json({ ok: true, id });
});
router.delete('/portal/plano/:id/foto/:fid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_plano_fotos WHERE id=? AND plano_id=? AND empresa_id=?').run(req.params.fid, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.post('/portal/plano', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'Dê um nome ao plano.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_plano (id, empresa_id, nome, status, ano, destaque, ordem, criado_em)
     VALUES (?,?,?,?,?,?,?, datetime('now'))`).run(id, emp, b.nome, b.status || 'rascunho', b.ano || new Date().getFullYear() + 1, b.destaque ? 1 : 0, Number(b.ordem) || 0);
  const { sets, vals } = planoBody(b);
  if (sets.length) db.prepare(`UPDATE tmkt_plano SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, id, emp);
  res.json({ ok: true, id });
});
router.put('/portal/plano/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT id FROM tmkt_plano WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Plano não encontrado.' });
  const { sets, vals } = planoBody(req.body || {});
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE tmkt_plano SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});
router.post('/portal/plano/:id/capa', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.foto) return res.status(400).json({ erro: 'Anexe a imagem da capa.' });
  const r = db.prepare('UPDATE tmkt_plano SET capa_foto=? WHERE id=? AND empresa_id=?').run(String(b.foto).slice(0, 8_000_000), req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Plano não encontrado.' });
  res.json({ ok: true });
});
router.delete('/portal/plano/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_plano_espacos WHERE plano_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_plano WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});
// amarrar / desamarrar posições reais ao plano (trava o estoque quando o plano é comprado)
router.post('/portal/plano/:id/espacos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.espaco_id) return res.status(400).json({ erro: 'Escolha a posição.' });
  const ok = db.prepare('SELECT 1 FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(b.espaco_id, emp);
  if (!ok) return res.status(400).json({ erro: 'Posição inválida.' });
  db.prepare('INSERT INTO tmkt_plano_espacos (id, empresa_id, plano_id, espaco_id, quantidade, cota_id, criado_em) VALUES (?,?,?,?,?,?, datetime(\'now\'))')
    .run(uuid(), emp, req.params.id, b.espaco_id, Math.max(1, Number(b.quantidade) || 1), b.cota_id || null);
  res.json({ ok: true });
});
// cotas do plano (Ouro/Prata/Bronze) — cada uma com valor, quantidade e posições próprias
router.post('/portal/plano/:id/cotas', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'Dê um nome à cota (ex.: Ouro).' });
  const id = uuid();
  const n = db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM tmkt_plano_cotas WHERE empresa_id=? AND plano_id=?').get(emp, req.params.id).m;
  db.prepare('INSERT INTO tmkt_plano_cotas (id, empresa_id, plano_id, nome, preco, quantidade, cor, ordem, criado_em) VALUES (?,?,?,?,?,?,?,?, datetime(\'now\'))')
    .run(id, emp, req.params.id, b.nome, Number(b.preco) || 0, Math.max(1, Number(b.quantidade) || 1), b.cor || null, n + 1);
  res.json({ ok: true, id });
});
router.put('/portal/plano/:id/cotas/:cotaId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const sets = [], vals = [];
  ['nome', 'cor'].forEach(k => { if (b[k] !== undefined) { sets.push(`${k}=?`); vals.push(b[k] || null); } });
  if (b.preco !== undefined) { sets.push('preco=?'); vals.push(Number(b.preco) || 0); }
  if (b.quantidade !== undefined) { sets.push('quantidade=?'); vals.push(Math.max(1, Number(b.quantidade) || 1)); }
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE tmkt_plano_cotas SET ${sets.join(', ')} WHERE id=? AND plano_id=? AND empresa_id=?`).run(...vals, req.params.cotaId, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/portal/plano/:id/cotas/:cotaId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_plano_espacos WHERE cota_id=? AND plano_id=? AND empresa_id=?').run(req.params.cotaId, req.params.id, emp);
  db.prepare('DELETE FROM tmkt_plano_cotas WHERE id=? AND plano_id=? AND empresa_id=?').run(req.params.cotaId, req.params.id, emp);
  res.json({ ok: true });
});
router.put('/portal/plano/:id/espacos/:linkId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('UPDATE tmkt_plano_espacos SET quantidade=? WHERE id=? AND plano_id=? AND empresa_id=?')
    .run(Math.max(1, Number((req.body || {}).quantidade) || 1), req.params.linkId, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/portal/plano/:id/espacos/:linkId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_plano_espacos WHERE id=? AND plano_id=? AND empresa_id=?').run(req.params.linkId, req.params.id, emp);
  res.json({ ok: true });
});

// ── CALENDÁRIO DE TRADE (gestão) ──────────────────────────────────────────
const CAL_CAMPOS = ['nome', 'tipo', 'categoria', 'recorrencia', 'dia_semana', 'dia_mes', 'data', 'data_ini', 'data_fim',
  'descricao', 'cor', 'patrocinavel', 'no_trade', 'preco', 'plano_id', 'patrocinador_nome', 'patrocinador_cnpj', 'venda_id', 'status', 'ordem', 'escopo_tipo'];
function calBody(b) {
  const sets = [], vals = [], bool = ['patrocinavel', 'no_trade'];
  CAL_CAMPOS.forEach(k => { if (b[k] !== undefined) { sets.push(`${k}=?`); vals.push(bool.includes(k) ? (b[k] ? 1 : 0) : (b[k] === '' ? null : b[k])); } });
  if (b.escopo_ref !== undefined) { sets.push('escopo_ref=?'); vals.push(b.escopo_ref == null ? null : JSON.stringify(b.escopo_ref).slice(0, 8000)); }
  return { sets, vals };
}
router.get('/portal/calendario', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT id, nome, tipo, categoria, recorrencia, dia_semana, dia_mes, data, data_ini, data_fim,
      descricao, cor, COALESCE(patrocinavel,1) patrocinavel, COALESCE(no_trade,0) no_trade, preco, plano_id, patrocinador_nome, venda_id,
      escopo_tipo, escopo_ref, (comprov_foto IS NOT NULL) AS tem_comprov, (slogan_foto IS NOT NULL) AS tem_slogan, comprov_em, status, ordem
    FROM tmkt_calendario WHERE empresa_id=? ORDER BY COALESCE(data, data_ini), ordem, nome`).all(emp);
  res.json({ ok: true, eventos: rows.map(e => ({ ...e, patrocinavel: !!e.patrocinavel, no_trade: !!e.no_trade, tem_comprov: !!e.tem_comprov, tem_slogan: !!e.tem_slogan, escopo_ref: (() => { try { return JSON.parse(e.escopo_ref || '[]'); } catch { return []; } })() })) });
});
router.post('/portal/calendario', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'Dê um nome ao evento.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_calendario (id, empresa_id, nome, tipo, recorrencia, status, criado_em)
     VALUES (?,?,?,?,?,?, datetime('now'))`).run(id, emp, b.nome, b.tipo || 'acao', b.recorrencia || 'unico', b.status || 'ativo');
  const { sets, vals } = calBody(b);
  if (sets.length) db.prepare(`UPDATE tmkt_calendario SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, id, emp);
  res.json({ ok: true, id });
});
router.put('/portal/calendario/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const ok = db.prepare('SELECT id FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!ok) return res.status(404).json({ erro: 'Evento não encontrado.' });
  const { sets, vals } = calBody(req.body || {});
  if (sets.length) db.prepare(`UPDATE tmkt_calendario SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/portal/calendario/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_calendario_fotos WHERE evento_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_calendario WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});
// comprovação da ação (foto principal)
router.post('/portal/calendario/:id/comprovacao', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.foto) return res.status(400).json({ erro: 'Anexe a foto da ação.' });
  const r = db.prepare(`UPDATE tmkt_calendario SET comprov_foto=?, comprov_mime=?, comprov_em=datetime('now') WHERE id=? AND empresa_id=?`)
    .run(String(b.foto).slice(0, 8_000_000), b.mime || null, req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Evento não encontrado.' });
  res.json({ ok: true });
});
router.get('/portal/calendario/:id/comprovacao', (req, res) => {
  const r = db.prepare('SELECT comprov_foto, comprov_mime FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!r || !r.comprov_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.comprov_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.comprov_mime || 'image/jpeg'); res.send(Buffer.from(String(r.comprov_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
// foto do slogan/arte da ação
router.post('/portal/calendario/:id/slogan', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}; if (!b.foto) return res.status(400).json({ erro: 'Anexe a arte.' });
  const r = db.prepare('UPDATE tmkt_calendario SET slogan_foto=?, slogan_mime=? WHERE id=? AND empresa_id=?')
    .run(String(b.foto).slice(0, 8_000_000), b.mime || null, req.params.id, req.usuario.empresa_id);
  if (!r.changes) return res.status(404).json({ erro: 'Evento não encontrado.' });
  res.json({ ok: true });
});
router.get('/portal/calendario/:id/slogan', (req, res) => {
  const r = db.prepare('SELECT slogan_foto, slogan_mime FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!r || !r.slogan_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.slogan_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.slogan_mime || 'image/jpeg'); res.send(Buffer.from(String(r.slogan_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
// posições vinculadas ao evento (o que é comercializável nessa ação)
router.get('/portal/calendario/:id/espacos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT ce.id, ce.espaco_id, ce.quantidade, el.espaco, el.loja_nome, el.segmento, el.area, el.preco_unit, el.modo_venda
      FROM tmkt_calendario_espacos ce LEFT JOIN tmkt_espaco_loja el ON el.id=ce.espaco_id
      WHERE ce.empresa_id=? AND ce.evento_id=?`).all(emp, req.params.id);
  res.json({ ok: true, espacos: rows });
});
router.post('/portal/calendario/:id/espacos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.espaco_id) return res.status(400).json({ erro: 'Escolha a posição.' });
  if (!db.prepare('SELECT 1 FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(b.espaco_id, emp)) return res.status(400).json({ erro: 'Posição inválida.' });
  db.prepare('INSERT INTO tmkt_calendario_espacos (id, empresa_id, evento_id, espaco_id, quantidade, criado_em) VALUES (?,?,?,?,?, datetime(\'now\'))')
    .run(uuid(), emp, req.params.id, b.espaco_id, Math.max(1, Number(b.quantidade) || 1));
  res.json({ ok: true });
});
router.put('/portal/calendario/:id/espacos/:linkId', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('UPDATE tmkt_calendario_espacos SET quantidade=? WHERE id=? AND evento_id=? AND empresa_id=?')
    .run(Math.max(1, Number((req.body || {}).quantidade) || 1), req.params.linkId, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.delete('/portal/calendario/:id/espacos/:linkId', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_calendario_espacos WHERE id=? AND evento_id=? AND empresa_id=?').run(req.params.linkId, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── BRIEFING da negociação (chat + anexos + comprovação) ──────────────────
function briefingLista(emp, vendaId) {
  return db.prepare(`SELECT id, autor, autor_nome, COALESCE(tipo,'msg') tipo, texto, (anexo_b64 IS NOT NULL) AS tem_anexo, anexo_mime, anexo_nome, criado_em
    FROM tmkt_venda_briefing WHERE empresa_id=? AND venda_id=? ORDER BY criado_em`).all(emp, vendaId)
    .map(m => ({ ...m, tem_anexo: !!m.tem_anexo }));
}
router.get('/portal/venda/:id/briefing', (req, res) => {
  res.json({ ok: true, mensagens: briefingLista(req.usuario.empresa_id, req.params.id) });
});
router.post('/portal/venda/:id/briefing', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.texto && !b.anexo) return res.status(400).json({ erro: 'Escreva algo ou anexe um arquivo.' });
  if (!db.prepare('SELECT 1 FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp)) return res.status(404).json({ erro: 'Negociação não encontrada.' });
  db.prepare(`INSERT INTO tmkt_venda_briefing (id, empresa_id, venda_id, autor, autor_nome, tipo, texto, anexo_b64, anexo_mime, anexo_nome, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))`)
    .run(uuid(), emp, req.params.id, 'gestao', req.usuario.nome || null, b.tipo === 'comprovacao' ? 'comprovacao' : 'msg',
      b.texto ? String(b.texto).slice(0, 4000) : null, b.anexo ? String(b.anexo).slice(0, 8_000_000) : null, b.mime || null, b.nome || null);
  res.json({ ok: true });
});
router.get('/portal/briefing/:bid/anexo', (req, res) => {
  const r = db.prepare('SELECT anexo_b64, anexo_mime FROM tmkt_venda_briefing WHERE id=? AND empresa_id=?').get(req.params.bid, req.usuario.empresa_id);
  if (!r || !r.anexo_b64) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.anexo_b64 || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.anexo_mime || 'application/octet-stream'); res.send(Buffer.from(String(r.anexo_b64).replace(/^data:[^,]+,/, ''), 'base64'));
});

// sell-out (vendas ao consumidor) por escopo, no período da ação
async function vendasPorEscopo(tipo, refs, ini, fim) {
  if (!habilitado() || !Array.isArray(refs) || !refs.length) return { qtd: 0, valor: 0 };
  const base = `FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN embalagem e ON e.id=iv.embalagemid`;
  const per = `v.status='F' AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)`;
  let sql, params;
  try {
    if (tipo === 'produto') { const eans = refs.map(r => r.ean).filter(Boolean); if (!eans.length) return { qtd: 0, valor: 0 }; sql = `SELECT COALESCE(SUM(iv.quantidade),0) q, COALESCE(SUM(iv.valortotal),0) v ${base} WHERE e.codigobarras = ANY($1::text[]) AND ${per}`; params = [eans, ini, fim]; }
    else if (tipo === 'laboratorio') { sql = `SELECT COALESCE(SUM(iv.quantidade),0) q, COALESCE(SUM(iv.valortotal),0) v ${base} JOIN produto pr ON pr.id=e.produtoid WHERE pr.fabricanteid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else if (tipo === 'classificacao') { sql = `SELECT COALESCE(SUM(iv.quantidade),0) q, COALESCE(SUM(iv.valortotal),0) v ${base} JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid WHERE cp.classificacaoid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else return { qtd: 0, valor: 0 };
    const r = await erpQuery(sql, params); return { qtd: Number(r[0].q) || 0, valor: Number(r[0].v) || 0 };
  } catch { return { qtd: 0, valor: 0 }; }
}
router.get('/portal/calendario/:id/sellout', async (req, res) => {
  const emp = req.usuario.empresa_id;
  const ev = db.prepare('SELECT escopo_tipo, escopo_ref, data, data_ini, data_fim FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!ev) return res.status(404).json({ erro: 'Evento não encontrado.' });
  if (!ev.escopo_tipo) return res.json({ ok: true, semEscopo: true });
  if (!['produto', 'laboratorio', 'classificacao'].includes(ev.escopo_tipo)) return res.json({ ok: true, naoSuportado: ev.escopo_tipo });
  let refs = []; try { refs = JSON.parse(ev.escopo_ref || '[]'); } catch { }
  const hoje = new Date().toISOString().slice(0, 10);
  let ini, fim;
  if (ev.data) { ini = ev.data; fim = ev.data; }
  else if (ev.data_ini) { ini = ev.data_ini; fim = ev.data_fim || hoje; }
  else { const n = new Date(); ini = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10); fim = new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10); }
  if (fim > hoje) fim = hoje;
  const dias = Math.max(1, Math.round((new Date(fim) - new Date(ini)) / 864e5) + 1);
  const antFim = new Date(new Date(ini).getTime() - 864e5).toISOString().slice(0, 10);
  const antIni = new Date(new Date(antFim).getTime() - (dias - 1) * 864e5).toISOString().slice(0, 10);
  const atual = await vendasPorEscopo(ev.escopo_tipo, refs, ini, fim);
  const antes = await vendasPorEscopo(ev.escopo_tipo, refs, antIni, antFim);
  const variacao = antes.valor ? Math.round((atual.valor - antes.valor) / antes.valor * 100) : null;
  res.json({ ok: true, periodo: { ini, fim }, anterior: { ini: antIni, fim: antFim }, atual, antes, variacao, escopo_tipo: ev.escopo_tipo });
});

module.exports = router;
