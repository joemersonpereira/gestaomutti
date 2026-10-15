// trademkt.js — Trade Marketing: aluguel de espaços da loja a fornecedores (áreas/espaços, vendas, parcelas, sell-out do ERP).
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { auth, exigePerfil } = require('../middleware/auth');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing'];
const STATUS = ['rascunho', 'negociacao', 'vigente', 'encerrado', 'cancelado'];
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
  res.json({
    kpis: {
      total: tot.total, vendidos: tot.vendidos, disponiveis: tot.total - tot.vendidos,
      ocupacao: tot.total ? Math.round(tot.vendidos / tot.total * 100) : 0,
      potencial: tot.potencial, potencialPerdido: tot.potencial - tot.receita, receita: tot.receita, monitorados,
    },
    lojas,
  });
});

// Espaços por loja (quantidade + preço) — o "AreasEEspacosDaLoja" do TradeMkt.
// Vagas ocupadas por espaço-loja = venda_espacos de vendas ativas (não cancelada/encerrada).
const OCUPA_STATUS = "('rascunho','negociacao','vigente','concluido')";
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
function parcelasVenda(id) { return db.prepare('SELECT * FROM tmkt_parcelas WHERE venda_id=? ORDER BY numero').all(id); }
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
  v.espacos = db.prepare('SELECT * FROM tmkt_venda_espacos WHERE venda_id=?').all(v.id);
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

module.exports = router;
