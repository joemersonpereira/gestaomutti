// mercado.js — Meu Mercado (loja interna). Suporte importa NF do ERP (estoque+custo),
// gerentes pedem materiais/fardamento (fluxo pedido→separação→enviado→entregue),
// brindes têm controle de entrada/saída (gerente não acessa). Custo por loja.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { erpQuery, habilitado } = require('../db/erp');

router.use(auth);

const CATEGORIAS = ['limpeza', 'escritorio', 'fardamento', 'brinde'];
const ADMIN = ['Suporte', 'Gestor Geral', 'Diretor Geral', 'Controladoria'];
const ehAdmin = u => ADMIN.includes(u.funcao_nome);
const podeBrinde = u => ehAdmin(u); // gerente NÃO acessa brindes
const registraMov = (emp, prodId, tipo, qtd, custo, origem, ref, lojaId, colabId, destino, obs, variacaoId) =>
  db.prepare(`INSERT INTO mercado_movimentos (id,empresa_id,produto_id,variacao_id,tipo,quantidade,custo_unit,origem,referencia,loja_id,destino,colaborador_id,obs,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(uuidv4(), emp, prodId, variacaoId || null, tipo, qtd, custo || 0, origem || null, ref || null, lojaId || null, destino || null, colabId || null, obs || null);

// Anexa variações aos produtos (e, quando tem_variacoes, usa a soma como estoque exibido).
const anexarVariacoes = (emp, produtos) => {
  const stmt = db.prepare(`SELECT id, nome, ean, custo, preco, estoque, ativo FROM mercado_variacoes WHERE empresa_id=? AND produto_id=? AND ativo=1 ORDER BY criado_em`);
  return produtos.map(p => {
    if (!p.tem_variacoes) return { ...p, variacoes: [] };
    const variacoes = stmt.all(emp, p.id);
    const estoque = variacoes.reduce((a, v) => a + (v.estoque || 0), 0);
    return { ...p, variacoes, estoque };
  });
};

// ── Catálogo ─────────────────────────────────────────────────────────────────────
router.get('/produtos', (req, res) => {
  const cat = req.query.categoria;
  let rows;
  if (cat && CATEGORIAS.includes(cat)) {
    if (cat === 'brinde' && !podeBrinde(req.usuario)) return res.status(403).json({ erro: 'Sem acesso a brindes.' });
    rows = db.prepare(`SELECT * FROM mercado_produtos WHERE empresa_id=? AND categoria=? AND ativo=1 ORDER BY nome`).all(req.usuario.empresa_id, cat);
  } else {
    const cats = podeBrinde(req.usuario) ? CATEGORIAS : CATEGORIAS.filter(c => c !== 'brinde');
    rows = db.prepare(`SELECT * FROM mercado_produtos WHERE empresa_id=? AND ativo=1 AND categoria IN (${cats.map(() => '?').join(',')}) ORDER BY categoria, nome`).all(req.usuario.empresa_id, ...cats);
  }
  res.json({ produtos: anexarVariacoes(req.usuario.empresa_id, rows), pode_admin: ehAdmin(req.usuario), pode_brinde: podeBrinde(req.usuario) });
});

router.post('/produtos', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Só o suporte gerencia o mercado.' });
  const { categoria, nome } = req.body;
  if (!CATEGORIAS.includes(categoria) || !nome) return res.status(400).json({ erro: 'Categoria e nome obrigatórios.' });
  const id = uuidv4();
  const resg = ['brinde', 'fardamento'].includes(categoria) && req.body.resgatavel ? 1 : 0;
  const variacoes = Array.isArray(req.body.variacoes) ? req.body.variacoes.filter(v => v && String(v.nome || '').trim()) : [];
  const temVar = req.body.tem_variacoes && variacoes.length ? 1 : 0;
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO mercado_produtos (id,empresa_id,categoria,nome,unidade,ean,fornecedor,imagem,custo,preco,estoque,tem_variacoes,resgatavel,pontos,ativo,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'))`)
      .run(id, req.usuario.empresa_id, categoria, String(nome).slice(0, 160), (req.body.unidade || 'UN').slice(0, 10), req.body.ean || null,
        (req.body.fornecedor || '').toString().slice(0, 120) || null, (req.body.imagem || '').toString().slice(0, 700000) || null,
        Number(req.body.custo) || 0, Number(req.body.preco) || 0,
        temVar ? 0 : (Number(req.body.estoque) || 0), temVar, resg, resg ? (Number(req.body.pontos) || 0) : 0);
    if (temVar) for (const v of variacoes) inserirVariacao(req.usuario.empresa_id, id, v);
  });
  tx();
  res.status(201).json({ ok: true, id });
});

// ── Variações (tamanho/cor) — só admin ───────────────────────────────────────────
function inserirVariacao(emp, produtoId, v) {
  const vid = uuidv4();
  db.prepare(`INSERT INTO mercado_variacoes (id,empresa_id,produto_id,nome,ean,custo,preco,estoque,ativo,criado_em)
    VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))`)
    .run(vid, emp, produtoId, String(v.nome).slice(0, 60), v.ean || null, Number(v.custo) || 0, Number(v.preco) || 0, Number(v.estoque) || 0);
  return vid;
}

router.post('/produtos/:id/variacoes', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const prod = db.prepare(`SELECT id FROM mercado_produtos WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!prod) return res.status(404).json({ erro: 'Produto não encontrado.' });
  if (!String(req.body.nome || '').trim()) return res.status(400).json({ erro: 'Informe o nome da variação (ex.: G, GG).' });
  const vid = inserirVariacao(req.usuario.empresa_id, prod.id, req.body);
  db.prepare(`UPDATE mercado_produtos SET tem_variacoes=1, atualizado_em=datetime('now') WHERE id=?`).run(prod.id);
  res.status(201).json({ ok: true, id: vid });
});

router.patch('/variacoes/:id', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const v = db.prepare(`SELECT * FROM mercado_variacoes WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!v) return res.status(404).json({ erro: 'Variação não encontrada.' });
  db.prepare(`UPDATE mercado_variacoes SET nome=?, custo=?, preco=?, estoque=?, ativo=? WHERE id=?`)
    .run(req.body.nome ?? v.nome, req.body.custo != null ? Number(req.body.custo) : v.custo, req.body.preco != null ? Number(req.body.preco) : v.preco,
      req.body.estoque != null ? Number(req.body.estoque) : v.estoque, req.body.ativo != null ? (req.body.ativo ? 1 : 0) : v.ativo, v.id);
  res.json({ ok: true });
});

router.post('/variacoes/:id/ajuste', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const v = db.prepare(`SELECT * FROM mercado_variacoes WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!v) return res.status(404).json({ erro: 'Não encontrada.' });
  const q = Number(req.body.quantidade); if (!q) return res.status(400).json({ erro: 'Informe a quantidade (+/-).' });
  db.prepare(`UPDATE mercado_variacoes SET estoque=estoque+? WHERE id=?`).run(q, v.id);
  registraMov(req.usuario.empresa_id, v.produto_id, 'ajuste', q, v.custo, 'manual', null, null, req.usuario.id, null, req.body.obs, v.id);
  res.json({ ok: true });
});

router.delete('/variacoes/:id', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare(`UPDATE mercado_variacoes SET ativo=0 WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

router.patch('/produtos/:id', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const p = db.prepare(`SELECT * FROM mercado_produtos WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Produto não encontrado.' });
  db.prepare(`UPDATE mercado_produtos SET nome=?, fornecedor=?, imagem=?, custo=?, preco=?, resgatavel=?, pontos=?, ativo=?, atualizado_em=datetime('now') WHERE id=?`)
    .run(req.body.nome ?? p.nome, req.body.fornecedor !== undefined ? (req.body.fornecedor || null) : p.fornecedor,
      req.body.imagem !== undefined ? ((req.body.imagem || '').toString().slice(0, 700000) || null) : p.imagem,
      req.body.custo != null ? Number(req.body.custo) : p.custo, req.body.preco != null ? Number(req.body.preco) : p.preco,
      req.body.resgatavel != null ? (req.body.resgatavel ? 1 : 0) : p.resgatavel, req.body.pontos != null ? Number(req.body.pontos) : p.pontos,
      req.body.ativo != null ? (req.body.ativo ? 1 : 0) : p.ativo, p.id);
  res.json({ ok: true });
});

// Ajuste manual de estoque (suporte).
router.post('/produtos/:id/ajuste', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const p = db.prepare(`SELECT * FROM mercado_produtos WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Não encontrado.' });
  const q = Number(req.body.quantidade); if (!q) return res.status(400).json({ erro: 'Informe a quantidade (+/-).' });
  db.prepare(`UPDATE mercado_produtos SET estoque=estoque+?, atualizado_em=datetime('now') WHERE id=?`).run(q, p.id);
  registraMov(req.usuario.empresa_id, p.id, 'ajuste', q, p.custo, 'manual', null, null, req.usuario.id, null, req.body.obs);
  res.json({ ok: true });
});

// ── Importar NF do ERP (suporte) → alimenta estoque + custo ──────────────────────
router.get('/nf-erp', async (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const numero = (req.query.numero || '').toString().replace(/\D/g, '');
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  if (!numero) return res.status(400).json({ erro: 'Informe o número da NF.' });
  if (!habilitado()) return res.status(503).json({ erro: 'ERP indisponível.' });
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  if (!loja || !loja.erp_unidadenegocio_id) return res.status(400).json({ erro: 'Loja sem vínculo com o ERP.' });
  try {
    const nfs = await erpQuery(`SELECT nf.id, nf.numero, nf.serie, nf.valortotal, forn.nome AS fornecedor
      FROM notafiscal nf LEFT JOIN pessoa forn ON forn.id = nf.fornecedorid
      WHERE nf.numero = $1 AND nf.unidadenegocioid = $2 ORDER BY nf.datahorainclusao DESC LIMIT 5`, [Number(numero), loja.erp_unidadenegocio_id]);
    if (!nfs.length) return res.json({ encontrada: false });
    const nf = nfs[0];
    const itens = await erpQuery(`SELECT COALESCE(i.descricao,'') AS descricao, i.codigobarras AS ean, i.quantidade, i.valorunitario
      FROM itemnotafiscal i WHERE i.notafiscalid = $1 ORDER BY i.descricao`, [nf.id]);
    res.json({
      encontrada: true, nf: { numero: nf.numero, serie: nf.serie, fornecedor: nf.fornecedor, valor_total: Number(nf.valortotal) || 0 },
      itens: itens.map(i => ({ ean: i.ean || null, descricao: i.descricao, quantidade: Number(i.quantidade) || 0, custo: Number(i.valorunitario) || 0 })),
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/importar-nf', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const { nf_numero, itens } = req.body;
  const fornec = (req.body.fornecedor || '').toString().slice(0, 120) || null;
  if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ erro: 'Nenhum item para importar.' });
  const emp = req.usuario.empresa_id;
  let n = 0;
  const tx = db.transaction(() => {
    for (const it of itens) {
      const cat = CATEGORIAS.includes(it.categoria) ? it.categoria : 'limpeza';
      const qtd = Number(it.quantidade) || 0, custo = Number(it.custo) || 0;
      if (!it.descricao || qtd <= 0) continue;
      // acha produto existente por EAN (na categoria) ou por nome
      let prod = it.ean ? db.prepare(`SELECT * FROM mercado_produtos WHERE empresa_id=? AND categoria=? AND ean=?`).get(emp, cat, it.ean) : null;
      if (!prod) prod = db.prepare(`SELECT * FROM mercado_produtos WHERE empresa_id=? AND categoria=? AND nome=?`).get(emp, cat, String(it.descricao).slice(0, 160));
      if (prod) {
        const novoEst = (prod.estoque || 0) + qtd;
        const novoCusto = novoEst > 0 ? ((prod.custo || 0) * (prod.estoque || 0) + custo * qtd) / novoEst : custo;
        db.prepare(`UPDATE mercado_produtos SET estoque=?, custo=?, ean=COALESCE(ean,?), fornecedor=COALESCE(fornecedor,?), atualizado_em=datetime('now') WHERE id=?`)
          .run(novoEst, Math.round(novoCusto * 10000) / 10000, it.ean || null, fornec, prod.id);
        registraMov(emp, prod.id, 'entrada', qtd, custo, 'nf_erp', nf_numero || null, null, req.usuario.id, null, null);
      } else {
        const id = uuidv4();
        db.prepare(`INSERT INTO mercado_produtos (id,empresa_id,categoria,nome,unidade,ean,fornecedor,custo,preco,estoque,ativo,criado_em)
          VALUES (?,?,?,?, 'UN', ?,?,?,0,?,1,datetime('now'))`).run(id, emp, cat, String(it.descricao).slice(0, 160), it.ean || null, fornec, custo, qtd);
        registraMov(emp, id, 'entrada', qtd, custo, 'nf_erp', nf_numero || null, null, req.usuario.id, null, null);
      }
      n++;
    }
  });
  tx();
  res.json({ ok: true, importados: n });
});

// Lista NFs recentes de um fornecedor (nome) numa loja — para quem não sabe o número.
router.get('/nfs-erp', async (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const fornec = (req.query.fornecedor || '').toString().trim();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  if (fornec.length < 2) return res.status(400).json({ erro: 'Informe ao menos 2 letras do fornecedor.' });
  if (!habilitado()) return res.status(503).json({ erro: 'ERP indisponível.' });
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  if (!loja || !loja.erp_unidadenegocio_id) return res.status(400).json({ erro: 'Loja sem vínculo com o ERP.' });
  try {
    const nfs = await erpQuery(`SELECT nf.numero, nf.serie, nf.valortotal, forn.nome AS fornecedor,
        to_char(nf.datahoraentrada,'YYYY-MM-DD') AS entrada
      FROM notafiscal nf JOIN pessoa forn ON forn.id = nf.fornecedorid
      WHERE nf.unidadenegocioid = $1 AND unaccent(lower(forn.nome)) LIKE unaccent(lower($2))
      ORDER BY nf.datahoraentrada DESC NULLS LAST LIMIT 20`, [loja.erp_unidadenegocio_id, `%${fornec}%`]);
    res.json({ nfs: nfs.map(n => ({ numero: n.numero, serie: n.serie, fornecedor: n.fornecedor, valor_total: Number(n.valortotal) || 0, entrada: n.entrada })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── Pedidos (gerente/colaborador) com fluxo ──────────────────────────────────────
router.post('/pedidos', (req, res) => {
  const categoria = req.body.categoria === 'fardamento' ? 'fardamento' : 'materiais';
  const itens = Array.isArray(req.body.itens) ? req.body.itens.filter(i => i.produto_id && Number(i.quantidade) > 0) : [];
  if (!itens.length) return res.status(400).json({ erro: 'Adicione ao menos um item.' });
  const id = uuidv4();
  let inseridos = 0;
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO mercado_pedidos (id,empresa_id,loja_id,solicitante_id,solicitante_nome,categoria,status,obs,criado_em)
      VALUES (?,?,?,?,?,?, 'pedido', ?, datetime('now'))`)
      .run(id, req.usuario.empresa_id, req.usuario.loja_id || null, req.usuario.id, req.usuario.nome, categoria, (req.body.obs || '').toString().slice(0, 300) || null);
    const insI = db.prepare(`INSERT INTO mercado_pedido_itens (id,pedido_id,produto_id,variacao_id,variacao_nome,nome,quantidade,atendida) VALUES (?,?,?,?,?,?,?,0)`);
    for (const it of itens) {
      const p = db.prepare(`SELECT nome, categoria, tem_variacoes FROM mercado_produtos WHERE id=? AND empresa_id=?`).get(it.produto_id, req.usuario.empresa_id);
      if (!p || p.categoria === 'brinde') continue; // não pede brinde
      let varId = null, varNome = null;
      if (p.tem_variacoes) {
        const v = it.variacao_id ? db.prepare(`SELECT id, nome FROM mercado_variacoes WHERE id=? AND produto_id=? AND empresa_id=?`).get(it.variacao_id, it.produto_id, req.usuario.empresa_id) : null;
        if (!v) continue; // produto com variação exige escolher a variação
        varId = v.id; varNome = v.nome;
      }
      insI.run(uuidv4(), id, it.produto_id, varId, varNome, p.nome, Number(it.quantidade));
      inseridos++;
    }
    if (!inseridos) throw new Error('Nenhum item válido (produtos com variação exigem escolher o tamanho/cor).');
  });
  try { tx(); } catch (e) { return res.status(400).json({ erro: e.message }); }
  res.status(201).json({ ok: true, id });
});

router.get('/pedidos', (req, res) => {
  const admin = ehAdmin(req.usuario);
  const status = req.query.status;
  let rows;
  if (admin) {
    rows = db.prepare(`SELECT p.*, l.nome loja_nome FROM mercado_pedidos p LEFT JOIN lojas l ON l.id=p.loja_id
      WHERE p.empresa_id=? ${status ? 'AND p.status=?' : "AND p.status<>'cancelado'"} ORDER BY p.criado_em DESC LIMIT 100`).all(...(status ? [req.usuario.empresa_id, status] : [req.usuario.empresa_id]));
  } else {
    rows = db.prepare(`SELECT p.*, l.nome loja_nome FROM mercado_pedidos p LEFT JOIN lojas l ON l.id=p.loja_id
      WHERE p.empresa_id=? AND p.solicitante_id=? ORDER BY p.criado_em DESC LIMIT 60`).all(req.usuario.empresa_id, req.usuario.id);
  }
  const pedidos = rows.map(p => ({ ...p, itens: db.prepare(`SELECT id, nome, variacao_nome, quantidade, atendida FROM mercado_pedido_itens WHERE pedido_id=?`).all(p.id) }));
  res.json({ pedidos, pode_admin: admin });
});

const FLUXO = ['pedido', 'separacao', 'enviado', 'entregue'];
router.patch('/pedidos/:id/status', (req, res) => {
  const p = db.prepare(`SELECT * FROM mercado_pedidos WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const novo = req.body.status;
  if (novo === 'cancelado') {
    if (p.solicitante_id !== req.usuario.id && !ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
    db.prepare(`UPDATE mercado_pedidos SET status='cancelado', atualizado_em=datetime('now') WHERE id=?`).run(p.id);
    return res.json({ ok: true });
  }
  if (!FLUXO.includes(novo)) return res.status(400).json({ erro: 'Status inválido.' });
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Só o suporte movimenta o pedido.' });
  // Atendimento parcial: { itens: [{id, atendida}] } — envia menos do que foi pedido.
  const atendMap = {};
  if (Array.isArray(req.body.itens)) req.body.itens.forEach(i => { if (i && i.id != null) atendMap[i.id] = Math.max(0, Number(i.atendida)); });
  const tx = db.transaction(() => {
    // ao ENTREGAR: baixa estoque só do que foi enviado + registra saída (custo por loja)
    if (novo === 'entregue' && p.status !== 'entregue') {
      const itens = db.prepare(`SELECT * FROM mercado_pedido_itens WHERE pedido_id=?`).all(p.id);
      for (const it of itens) {
        if (!it.produto_id) continue;
        const prod = db.prepare(`SELECT custo, estoque FROM mercado_produtos WHERE id=?`).get(it.produto_id);
        let q = atendMap[it.id] != null && !Number.isNaN(atendMap[it.id]) ? Math.min(atendMap[it.id], it.quantidade) : it.quantidade;
        let custo = prod ? prod.custo : 0;
        if (q > 0) {
          if (it.variacao_id) {
            const v = db.prepare(`SELECT custo FROM mercado_variacoes WHERE id=?`).get(it.variacao_id);
            if (v) custo = v.custo || custo;
            db.prepare(`UPDATE mercado_variacoes SET estoque=estoque-? WHERE id=?`).run(q, it.variacao_id);
          } else {
            db.prepare(`UPDATE mercado_produtos SET estoque=estoque-?, atualizado_em=datetime('now') WHERE id=?`).run(q, it.produto_id);
          }
          registraMov(p.empresa_id, it.produto_id, 'saida', q, custo, 'pedido', p.id, p.loja_id, p.solicitante_id, null, null, it.variacao_id);
        }
        db.prepare(`UPDATE mercado_pedido_itens SET atendida=? WHERE id=?`).run(q, it.id);
      }
    }
    db.prepare(`UPDATE mercado_pedidos SET status=?, atendido_por=?, atualizado_em=datetime('now') WHERE id=?`).run(novo, req.usuario.id, p.id);
  });
  tx();
  res.json({ ok: true });
});

// ── Brindes: saída (suporte) ─────────────────────────────────────────────────────
router.post('/brindes/saida', (req, res) => {
  if (!podeBrinde(req.usuario)) return res.status(403).json({ erro: 'Sem acesso a brindes.' });
  const prod = db.prepare(`SELECT * FROM mercado_produtos WHERE id=? AND empresa_id=? AND categoria='brinde'`).get(req.body.produto_id, req.usuario.empresa_id);
  if (!prod) return res.status(404).json({ erro: 'Brinde não encontrado.' });
  const q = Number(req.body.quantidade); if (!(q > 0)) return res.status(400).json({ erro: 'Quantidade inválida.' });
  let varId = null;
  if (prod.tem_variacoes) {
    const v = req.body.variacao_id ? db.prepare(`SELECT id FROM mercado_variacoes WHERE id=? AND produto_id=?`).get(req.body.variacao_id, prod.id) : null;
    if (!v) return res.status(400).json({ erro: 'Escolha a variação do brinde.' });
    varId = v.id;
    db.prepare(`UPDATE mercado_variacoes SET estoque=estoque-? WHERE id=?`).run(q, varId);
  } else {
    db.prepare(`UPDATE mercado_produtos SET estoque=estoque-?, atualizado_em=datetime('now') WHERE id=?`).run(q, prod.id);
  }
  registraMov(req.usuario.empresa_id, prod.id, 'saida', q, prod.custo, 'brinde', null, req.body.loja_id || null, req.usuario.id, (req.body.destino || '').toString().slice(0, 160), (req.body.obs || '').toString().slice(0, 200), varId);
  res.json({ ok: true });
});

// ── Custo por loja (relatório) ───────────────────────────────────────────────────
router.get('/custos', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const hoje = new Date(); const mes = String(parseInt(req.query.mes) || hoje.getMonth() + 1).padStart(2, '0'); const ano = String(parseInt(req.query.ano) || hoje.getFullYear());
  const rows = db.prepare(`SELECT m.loja_id, l.nome loja, p.categoria, SUM(m.quantidade * m.custo_unit) valor, SUM(m.quantidade) qtd
    FROM mercado_movimentos m JOIN mercado_produtos p ON p.id=m.produto_id LEFT JOIN lojas l ON l.id=m.loja_id
    WHERE m.empresa_id=? AND m.tipo='saida' AND strftime('%m',m.criado_em)=? AND strftime('%Y',m.criado_em)=?
    GROUP BY m.loja_id, l.nome, p.categoria ORDER BY valor DESC`).all(req.usuario.empresa_id, mes, ano);
  const porLoja = {};
  rows.forEach(r => { const k = r.loja || 'Sem loja'; (porLoja[k] = porLoja[k] || { loja: k, total: 0, categorias: {} }); porLoja[k].total += r.valor; porLoja[k].categorias[r.categoria] = (porLoja[k].categorias[r.categoria] || 0) + r.valor; });
  res.json({ mes: +mes, ano: +ano, lojas: Object.values(porLoja).sort((a, b) => b.total - a.total), total_geral: rows.reduce((a, r) => a + r.valor, 0) });
});

// ── Meus gastos do mês (gerente): consumo da própria loja + últimos 6 meses ──────
router.get('/meus-gastos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  if (!lojaId) return res.json({ semLoja: true, total: 0, categorias: [], meses: [] });
  const hoje = new Date();
  const mes = String(parseInt(req.query.mes) || hoje.getMonth() + 1).padStart(2, '0');
  const ano = String(parseInt(req.query.ano) || hoje.getFullYear());
  const cats = db.prepare(`SELECT p.categoria, SUM(m.quantidade * m.custo_unit) valor, SUM(m.quantidade) qtd
    FROM mercado_movimentos m JOIN mercado_produtos p ON p.id=m.produto_id
    WHERE m.empresa_id=? AND m.loja_id=? AND m.tipo='saida' AND strftime('%m',m.criado_em)=? AND strftime('%Y',m.criado_em)=?
    GROUP BY p.categoria ORDER BY valor DESC`).all(emp, lojaId, mes, ano);
  const total = cats.reduce((a, r) => a + (r.valor || 0), 0);
  // últimos 6 meses (tendência de gasto)
  const meses = db.prepare(`SELECT strftime('%Y-%m', m.criado_em) comp, SUM(m.quantidade * m.custo_unit) valor
    FROM mercado_movimentos m WHERE m.empresa_id=? AND m.loja_id=? AND m.tipo='saida'
      AND m.criado_em >= date('now','-6 months') GROUP BY comp ORDER BY comp`).all(emp, lojaId);
  res.json({ mes: +mes, ano: +ano, total, categorias: cats, meses });
});

module.exports = router;
