// faltas.js — Lista de faltas: a loja (perfumista) pede o que faltou; o comprador vê,
// compra e a loja acompanha. Confronto com o ERP: avisa se já há pedido pendente.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { buscarProduto, confrontoLote } = require('../lib/faltasErp');

router.use(auth);

const COMPRADOR = ['Comprador Beleza', 'Comprador Bem-estar', 'Gestor Geral', 'Diretor Geral', 'Suporte'];
const ehComprador = u => COMPRADOR.includes(u.funcao_nome);
const uniDaLoja = lojaId => { const l = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId); return l && l.erp_unidadenegocio_id; };

// AMARRAÇÃO AUTOMÁTICA com o ERP: falta vira 'em_pedido' quando surge pedido de compra
// pendente daquele item na loja; vira 'entregue' quando chega NF da mercadoria (com data
// >= a data em que a falta foi lançada). Não faz downgrade. Roda ao listar (throttle) e a cada 5 min.
let _ultimaAuto = 0;
async function autoAtualizarFaltas(empresaId, force) {
  if (!force && Date.now() - _ultimaAuto < 2 * 60 * 1000) return;
  _ultimaAuto = Date.now();
  const faltas = db.prepare(`SELECT id, loja_id, embalagem_id, status, date(criado_em) dia FROM lista_faltas
    WHERE empresa_id=? AND status IN ('aberta','em_pedido') AND embalagem_id IS NOT NULL`).all(empresaId);
  if (!faltas.length) return;
  const porLoja = {}; faltas.forEach(f => (porLoja[f.loja_id] = porLoja[f.loja_id] || []).push(f));
  const upd = db.prepare(`UPDATE lista_faltas SET status=?, atualizado_em=datetime('now') WHERE id=?`);
  for (const [lojaId, fs] of Object.entries(porLoja)) {
    const uni = uniDaLoja(lojaId); if (!uni) continue;
    let conf; try { conf = await confrontoLote(uni, fs.map(f => f.embalagem_id)); } catch { continue; }
    for (const f of fs) {
      const c = conf[f.embalagem_id]; if (!c) continue;
      let novo = null;
      if (c.ultima_entrada && c.ultima_entrada >= f.dia) novo = 'entregue';       // chegou depois de pedir
      else if (c.pedido_pendente && f.status === 'aberta') novo = 'em_pedido';     // comprador já pediu
      if (novo && novo !== f.status) upd.run(novo, f.id);
    }
  }
}
setInterval(() => {
  try { [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))].forEach(e => autoAtualizarFaltas(e, true).catch(() => {})); } catch { /* ignora */ }
}, 5 * 60 * 1000).unref();

// Busca de produto no ERP (código de barras ou descrição).
router.get('/produtos', async (req, res) => {
  try { res.json({ produtos: await buscarProduto(req.query.q, 25) }); }
  catch (e) { res.status(400).json({ erro: 'Falha na busca. ' + e.message }); }
});

// Lança uma falta.
router.post('/', async (req, res) => {
  const { embalagem_id, ean, descricao, marca, produto_id } = req.body;
  const qtd = Math.max(1, parseInt(req.body.quantidade) || 1);
  if (!descricao) return res.status(400).json({ erro: 'Escolha um produto.' });
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  // evita duplicar a mesma embalagem aberta na mesma loja — soma a quantidade
  const existente = embalagem_id ? db.prepare(`SELECT id, quantidade FROM lista_faltas WHERE loja_id=? AND embalagem_id=? AND status='aberta'`).get(lojaId, embalagem_id) : null;
  if (existente) {
    db.prepare(`UPDATE lista_faltas SET quantidade=quantidade+?, atualizado_em=datetime('now') WHERE id=?`).run(qtd, existente.id);
    return res.status(200).json({ ok: true, somado: true });
  }
  db.prepare(`INSERT INTO lista_faltas (id,empresa_id,loja_id,colaborador_id,colaborador_nome,embalagem_id,produto_id,ean,descricao,marca,quantidade,observacao,status,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'aberta', datetime('now'))`)
    .run(uuidv4(), req.usuario.empresa_id, lojaId, req.usuario.id, req.usuario.nome,
      embalagem_id || null, produto_id || null, ean || null, String(descricao).slice(0, 300), marca || 'Sem marca', qtd, (req.body.observacao || '').toString().slice(0, 300) || null);
  res.status(201).json({ ok: true });
});

// Lista as faltas (por loja), agrupadas por marca, com confronto ao vivo do ERP.
// Comprador pode ver todas as lojas (?loja_id=todas).
router.get('/', async (req, res) => {
  try { await autoAtualizarFaltas(req.usuario.empresa_id); } catch { /* ignora */ }
  const ehRede = ehComprador(req.usuario);
  const querTodas = ehRede && (req.query.loja_id === 'todas');
  const status = req.query.status || 'aberta';
  let rows;
  if (querTodas) {
    rows = db.prepare(`SELECT f.*, l.nome AS loja_nome FROM lista_faltas f JOIN lojas l ON l.id=f.loja_id
      WHERE f.empresa_id=? AND f.status=? ORDER BY f.marca, f.descricao`).all(req.usuario.empresa_id, status);
  } else {
    const lojaId = (ehRede && req.query.loja_id) ? req.query.loja_id : req.usuario.loja_id;
    rows = db.prepare(`SELECT f.*, l.nome AS loja_nome FROM lista_faltas f JOIN lojas l ON l.id=f.loja_id
      WHERE f.empresa_id=? AND f.loja_id=? AND f.status=? ORDER BY f.marca, f.descricao`).all(req.usuario.empresa_id, lojaId, status);
  }
  // confronto ERP (por loja, pois a unidade muda)
  const porLoja = {};
  rows.forEach(r => { (porLoja[r.loja_id] = porLoja[r.loja_id] || []).push(r.embalagem_id); });
  const confrontoPorEmb = {};
  for (const [lojaId, embs] of Object.entries(porLoja)) {
    const uni = uniDaLoja(lojaId);
    if (!uni) continue;
    const c = await confrontoLote(uni, embs);
    Object.assign(confrontoPorEmb, Object.fromEntries(Object.entries(c).map(([k, v]) => [`${lojaId}:${k}`, v])));
  }
  // agrupa por marca
  const marcas = {};
  rows.forEach(r => {
    const conf = confrontoPorEmb[`${r.loja_id}:${r.embalagem_id}`] || null;
    const item = {
      id: r.id, loja_id: r.loja_id, loja_nome: r.loja_nome, embalagem_id: r.embalagem_id, ean: r.ean,
      descricao: r.descricao, quantidade: r.quantidade, observacao: r.observacao, status: r.status,
      colaborador_nome: r.colaborador_nome, criado_em: r.criado_em, confronto: conf,
    };
    (marcas[r.marca || 'Sem marca'] = marcas[r.marca || 'Sem marca'] || []).push(item);
  });
  const lista = Object.keys(marcas).sort().map(m => ({ marca: m, itens: marcas[m] }));
  res.json({ pode_comprar: ehRede, escopo: querTodas ? 'rede' : 'loja', total: rows.length, marcas: lista });
});

// Atualiza status (comprador: em_pedido/entregue; autor/gestão: cancela).
router.patch('/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM lista_faltas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!f) return res.status(404).json({ erro: 'Item não encontrado.' });
  const status = req.body.status;
  if (!['aberta', 'em_pedido', 'entregue', 'cancelada'].includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
  const ehDono = f.colaborador_id === req.usuario.id;
  if ((status === 'em_pedido' || status === 'entregue') && !ehComprador(req.usuario)) return res.status(403).json({ erro: 'Só o comprador altera esse status.' });
  if (status === 'cancelada' && !ehDono && !ehComprador(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare(`UPDATE lista_faltas SET status=?, atendido_por=?, atualizado_em=datetime('now') WHERE id=?`)
    .run(status, ehComprador(req.usuario) ? req.usuario.id : f.atendido_por, f.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const f = db.prepare('SELECT colaborador_id FROM lista_faltas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!f) return res.status(404).json({ erro: 'Item não encontrado.' });
  if (f.colaborador_id !== req.usuario.id && !ehComprador(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare('DELETE FROM lista_faltas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
