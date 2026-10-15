// patrimonio.js — patrimônio da loja + empréstimo/reserva com período, tarefa de devolução e fila.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { auth, exigePerfil } = require('../middleware/auth');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Gerente', 'Subgerente', 'Controladoria'];
router.use(auth);

const lojaNome = id => id === 'adm' ? '🏢 Administrativo' : ((db.prepare('SELECT nome FROM lojas WHERE id=?').get(id) || {}).nome || null);

// Gera reservas vencidas → tarefa de devolução (idempotente).
function checarVencimentos(emp) {
  const vencidas = db.prepare(`SELECT r.*, p.nome patr FROM patrimonio_reserva r JOIN patrimonio p ON p.id=r.patrimonio_id
    WHERE r.empresa_id=? AND r.status='ativa' AND r.data_fim < date('now') AND r.tarefa_id IS NULL`).all(emp);
  for (const r of vencidas) {
    const tid = uuid();
    db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
      VALUES (?,?, 'tarefa','patrimonio',?,?,?,?,'aberto',datetime('now'),datetime('now'))`)
      .run(tid, emp, 'patr:' + r.id, `↩️ Devolver patrimônio — ${r.patr}`.slice(0, 140),
        `A reserva de "${r.patr}" por ${r.colaborador_nome || 'colaborador'} venceu em ${(r.data_fim || '').split('-').reverse().join('/')}. Cobrar a devolução.`,
        r.colaborador_id || null);
    db.prepare('UPDATE patrimonio_reserva SET tarefa_id=? WHERE id=?').run(tid, r.id);
  }
  return vencidas.length;
}

// Colaboradores (para escolher quem retira/recebe o bem).
router.get('/colaboradores', (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.nome, l.nome loja FROM colaboradores c LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE c.empresa_id=? AND c.ativo=1 ORDER BY c.nome`).all(req.usuario.empresa_id);
  res.json({ colaboradores: rows });
});

router.get('/', (req, res) => {
  const emp = req.usuario.empresa_id;
  checarVencimentos(emp);
  const itens = db.prepare(`SELECT * FROM patrimonio WHERE empresa_id=? ${req.query.loja ? 'AND loja_id=?' : ''} ORDER BY nome`)
    .all(...(req.query.loja ? [emp, req.query.loja] : [emp]));
  const resStmt = db.prepare(`SELECT * FROM patrimonio_reserva WHERE id=?`);
  const filaStmt = db.prepare(`SELECT colaborador_nome, desde_ini, desde_fim FROM patrimonio_fila WHERE patrimonio_id=? ORDER BY ordem`);
  const histStmt = db.prepare(`SELECT tipo, de_loja_id, para_loja_id, colaborador_nome, obs, criado_em FROM patrimonio_historico WHERE patrimonio_id=? ORDER BY criado_em DESC LIMIT 20`);
  res.json({
    patrimonios: itens.map(p => {
      const reserva = p.reserva_atual_id ? resStmt.get(p.reserva_atual_id) : null;
      if (reserva) { reserva.temAssinaturaRetirada = !!reserva.assinatura_retirada; delete reserva.assinatura_retirada; delete reserva.assinatura_devolucao; }
      return {
        ...p, loja: lojaNome(p.loja_id), reserva, fila: filaStmt.all(p.id),
        historico: histStmt.all(p.id).map(h => ({ ...h, deLoja: lojaNome(h.de_loja_id), paraLoja: lojaNome(h.para_loja_id) })),
      };
    }),
  });
});

// Transferir o bem para outra loja (com histórico).
router.post('/:id/transferir-loja', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM patrimonio WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Patrimônio não encontrado.' });
  const { loja_id, obs } = req.body;
  if (!loja_id) return res.status(400).json({ erro: 'Informe a loja de destino.' });
  db.prepare('UPDATE patrimonio SET loja_id=? WHERE id=?').run(loja_id, p.id);
  db.prepare(`INSERT INTO patrimonio_historico (id,empresa_id,patrimonio_id,tipo,de_loja_id,para_loja_id,colaborador_id,colaborador_nome,obs,criado_em)
    VALUES (?,?,?,'transferencia',?,?,?,?,?,datetime('now'))`)
    .run(uuid(), emp, p.id, p.loja_id || null, loja_id, req.usuario.id, req.usuario.nome, obs || null);
  res.json({ ok: true });
});

// Assinatura (base64) de uma reserva.
router.get('/reserva/:rid/assinatura', (req, res) => {
  const r = db.prepare('SELECT assinatura_retirada, assinatura_devolucao FROM patrimonio_reserva WHERE id=? AND empresa_id=?').get(req.params.rid, req.usuario.empresa_id);
  if (!r) return res.status(404).json({ erro: 'Reserva não encontrada.' });
  res.json({ retirada: r.assinatura_retirada || null, devolucao: r.assinatura_devolucao || null });
});

router.post('/', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body; if (!b.nome) return res.status(400).json({ erro: 'Informe o nome.' });
  const id = uuid();
  db.prepare(`INSERT INTO patrimonio (id,empresa_id,loja_id,nome,descricao,categoria,origem,nf_ref,tombamento,valor,status,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,'disponivel',?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.loja_id || req.usuario.loja_id || null, b.nome, b.descricao || null, b.categoria || null,
      b.origem || 'manual', b.nf_ref || null, b.tombamento || null, Number(b.valor) || null, req.usuario.id);
  res.json({ ok: true, id });
});

router.put('/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const campos = ['nome', 'descricao', 'categoria', 'valor', 'tombamento', 'loja_id', 'status'];
  const set = [], vals = [];
  campos.forEach(c => { if (c in req.body) { set.push(`${c}=?`); vals.push(req.body[c] === '' ? null : req.body[c]); } });
  if (!set.length) return res.json({ ok: true });
  db.prepare(`UPDATE patrimonio SET ${set.join(',')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});

// Reservar/emprestar com período. Se ocupado, entra na fila.
router.post('/:id/reservar', (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM patrimonio WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Patrimônio não encontrado.' });
  const { data_ini, data_fim, finalidade } = req.body;
  if (!data_ini || !data_fim) return res.status(400).json({ erro: 'Informe o período (início e fim).' });
  const nome = req.body.colaborador_nome || req.usuario.nome;
  const colab = req.body.colaborador_id || req.usuario.id;

  if (p.status === 'disponivel') {
    const rid = uuid();
    db.prepare(`INSERT INTO patrimonio_reserva (id,empresa_id,patrimonio_id,colaborador_id,colaborador_nome,finalidade,data_ini,data_fim,status,recebedor_nome,assinatura_retirada,criado_em)
      VALUES (?,?,?,?,?,?,?,?,'ativa',?,?,datetime('now'))`).run(rid, emp, p.id, colab, nome, finalidade || null, data_ini, data_fim, req.body.recebedor_nome || nome, req.body.assinatura || null);
    db.prepare("UPDATE patrimonio SET status='emprestado', reserva_atual_id=? WHERE id=?").run(rid, p.id);
    db.prepare(`INSERT INTO patrimonio_historico (id,empresa_id,patrimonio_id,tipo,colaborador_id,colaborador_nome,obs,criado_em)
      VALUES (?,?,?,'retirada',?,?,?,datetime('now'))`).run(uuid(), emp, p.id, colab, req.body.recebedor_nome || nome, finalidade || null);
    return res.json({ ok: true, reservaId: rid });
  }
  // ocupado → fila
  const ordem = (db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM patrimonio_fila WHERE patrimonio_id=?').get(p.id).m || 0) + 1;
  db.prepare(`INSERT INTO patrimonio_fila (id,empresa_id,patrimonio_id,colaborador_id,colaborador_nome,desde_ini,desde_fim,ordem,criado_em)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).run(uuid(), emp, p.id, colab, nome, data_ini, data_fim, ordem);
  res.json({ ok: true, fila: true, posicao: ordem });
});

// Devolver: encerra a reserva e libera (ou passa ao próximo da fila).
router.post('/:id/devolver', (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM patrimonio WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p || !p.reserva_atual_id) return res.status(400).json({ erro: 'Não há reserva ativa.' });
  db.prepare(`UPDATE patrimonio_reserva SET status='concluida', devolvido_em=datetime('now'),
      devolvedor_nome=?, recebedor_devolucao_nome=?, assinatura_devolucao=? WHERE id=?`)
    .run(req.body.devolvedor_nome || null, req.body.recebedor_devolucao_nome || req.usuario.nome, req.body.assinatura || null, p.reserva_atual_id);
  db.prepare(`INSERT INTO patrimonio_historico (id,empresa_id,patrimonio_id,tipo,colaborador_id,colaborador_nome,obs,criado_em)
    VALUES (?,?,?,'devolucao',?,?,?,datetime('now'))`).run(uuid(), emp, p.id, req.usuario.id, req.body.devolvedor_nome || null, 'Recebido por ' + (req.body.recebedor_devolucao_nome || req.usuario.nome));
  const prox = db.prepare('SELECT * FROM patrimonio_fila WHERE patrimonio_id=? ORDER BY ordem LIMIT 1').get(p.id);
  if (prox) {
    const rid = uuid();
    db.prepare(`INSERT INTO patrimonio_reserva (id,empresa_id,patrimonio_id,colaborador_id,colaborador_nome,data_ini,data_fim,status,criado_em)
      VALUES (?,?,?,?,?,?,?,'ativa',datetime('now'))`).run(rid, emp, p.id, prox.colaborador_id, prox.colaborador_nome, prox.desde_ini || req.body.data_ini || null, prox.desde_fim || req.body.data_fim || null);
    db.prepare('DELETE FROM patrimonio_fila WHERE id=?').run(prox.id);
    db.prepare("UPDATE patrimonio SET status='emprestado', reserva_atual_id=? WHERE id=?").run(rid, p.id);
    return res.json({ ok: true, proximo: prox.colaborador_nome });
  }
  db.prepare("UPDATE patrimonio SET status='disponivel', reserva_atual_id=NULL WHERE id=?").run(p.id);
  res.json({ ok: true });
});

// ── Cadastro via NF do ERP ───────────────────────────────────────────────
router.get('/nf-erp', exigePerfil(...GESTAO), async (req, res) => {
  const numero = (req.query.numero || '').toString().replace(/\D/g, '');
  const lojaId = req.query.loja || req.usuario.loja_id;
  if (!numero) return res.status(400).json({ erro: 'Informe o número da NF.' });
  if (!habilitado()) return res.status(503).json({ erro: 'ERP indisponível.' });
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  if (!loja || !loja.erp_unidadenegocio_id) return res.status(400).json({ erro: 'Loja sem vínculo com o ERP.' });
  try {
    const nfs = await erpQuery(`SELECT nf.id, nf.numero, forn.nome fornecedor FROM notafiscal nf
      LEFT JOIN pessoa forn ON forn.id=nf.fornecedorid WHERE nf.numero=$1 AND nf.unidadenegocioid=$2 ORDER BY nf.datahorainclusao DESC LIMIT 3`, [Number(numero), loja.erp_unidadenegocio_id]);
    if (!nfs.length) return res.json({ encontrada: false });
    const itens = await erpQuery(`SELECT COALESCE(i.descricao,'') descricao, i.quantidade, i.valorunitario
      FROM itemnotafiscal i WHERE i.notafiscalid=$1 ORDER BY i.descricao`, [nfs[0].id]);
    res.json({ encontrada: true, fornecedor: nfs[0].fornecedor, numero: nfs[0].numero,
      itens: itens.map(i => ({ descricao: i.descricao, quantidade: Number(i.quantidade) || 1, valor: Number(i.valorunitario) || 0 })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

router.post('/importar-nf', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const { numero, itens, loja_id } = req.body;
  if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ erro: 'Nenhum item selecionado.' });
  const ins = db.prepare(`INSERT INTO patrimonio (id,empresa_id,loja_id,nome,categoria,origem,nf_ref,valor,status,criado_por,criado_em)
    VALUES (?,?,?,?,?,'nf',?,?,'disponivel',?,datetime('now'))`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const it of itens) {
      if (!it.descricao) continue;
      const qtd = Math.max(1, Math.min(20, Number(it.quantidade) || 1));
      for (let k = 0; k < qtd; k++) { ins.run(uuid(), emp, loja_id || req.usuario.loja_id || null, String(it.descricao).slice(0, 160), it.categoria || null, 'NF ' + (numero || ''), Number(it.valor) || null, req.usuario.id); n++; }
    }
  });
  tx();
  res.json({ ok: true, criados: n });
});

// ── Transferência do Meu Mercado → Patrimônio ────────────────────────────
router.get('/mercado-itens', exigePerfil(...GESTAO), (req, res) => {
  const rows = db.prepare(`SELECT id, nome, categoria, custo, estoque FROM mercado_produtos WHERE empresa_id=? AND ativo=1 AND estoque>0 ORDER BY nome`).all(req.usuario.empresa_id);
  res.json({ itens: rows });
});

router.post('/transferir-mercado', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const { produto_id, loja_id, quantidade } = req.body;
  const prod = db.prepare('SELECT * FROM mercado_produtos WHERE id=? AND empresa_id=?').get(produto_id, emp);
  if (!prod) return res.status(404).json({ erro: 'Item do mercado não encontrado.' });
  const qtd = Math.max(1, Number(quantidade) || 1);
  if (prod.estoque < qtd) return res.status(400).json({ erro: 'Estoque insuficiente no Meu Mercado.' });
  const criados = [];
  const tx = db.transaction(() => {
    db.prepare('UPDATE mercado_produtos SET estoque=estoque-?, atualizado_em=datetime(\'now\') WHERE id=?').run(qtd, prod.id);
    db.prepare(`INSERT INTO mercado_movimentos (id,empresa_id,produto_id,tipo,quantidade,custo_unit,origem,referencia,loja_id,destino,colaborador_id,obs,criado_em)
      VALUES (?,?,?,'saida',?,?,'patrimonio',?,?,?,?,?,datetime('now'))`)
      .run(uuid(), emp, prod.id, qtd, prod.custo || 0, 'patrimonio', loja_id || null, 'Patrimônio', req.usuario.id, 'Transferido p/ patrimônio');
    const ins = db.prepare(`INSERT INTO patrimonio (id,empresa_id,loja_id,nome,categoria,origem,valor,status,criado_por,criado_em)
      VALUES (?,?,?,?,?,'mercado',?,'disponivel',?,datetime('now'))`);
    for (let k = 0; k < qtd; k++) { const id = uuid(); ins.run(id, emp, loja_id || null, prod.nome, prod.categoria || null, prod.custo || null, req.usuario.id); criados.push(id); }
  });
  tx();
  res.json({ ok: true, criados: criados.length });
});

router.delete('/:id/fila/:filaId', (req, res) => {
  db.prepare('DELETE FROM patrimonio_fila WHERE id=? AND patrimonio_id=? AND empresa_id=?').run(req.params.filaId, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

module.exports = router;
