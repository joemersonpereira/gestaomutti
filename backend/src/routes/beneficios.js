// beneficios.js — Controle de benefícios concedidos aos colaboradores.
// Com a loja de pontos, aniversário/anos de casa NÃO geram mais vale-compras/brinde
// automáticos (só pontos + day off). O RH concede manualmente: brinde do estoque,
// day off ou vale-pontos (credita pontos na loja). Status a_receber→entregue→usado.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { lancarPontos } = require('./pontos');

const TIPOS = { vale_pontos: 'Vale-pontos', brinde: 'Brinde', day_off: 'Day off', vale_compras: 'Vale-compras', outro: 'Outro' };
const STATUS = ['a_receber', 'entregue', 'usado', 'cancelado'];
const RH = ['RH', 'Gestor Geral', 'Diretor Geral', 'Controladoria'];
const ehRH = u => RH.includes(u.funcao_nome);

// Concede um benefício se ainda não existir (dedup por ref). Usado pelo Mural e por
// concessão manual. Retorna true se criou. Defensivo: nunca lança (não pode quebrar o feed).
function concederBeneficio(empresaId, b) {
  try {
    if (b.ref && db.prepare('SELECT 1 FROM beneficios WHERE empresa_id=? AND ref=?').get(empresaId, b.ref)) return false;
    db.prepare(`INSERT INTO beneficios
      (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,valor,motivo,competencia,ref,status,concedido_em,registrado_por,obs)
      VALUES (?,?,?,?,?,?,?,?,?,?,'a_receber',datetime('now'),?,?)`)
      .run(uuidv4(), empresaId, b.colaborador_id || null, b.colaborador_nome || null, b.loja_id || null,
        b.tipo, Number(b.valor) || 0, b.motivo || null, b.competencia || null, b.ref || null,
        b.registrado_por || null, b.obs || null);
    return true;
  } catch (e) { console.error('[beneficios] concessão falhou:', e.message); return false; }
}

router.use(auth);

const lojaNome = "(SELECT nome FROM lojas WHERE lojas.id=b.loja_id)";

// ── Lista (RH) ────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  if (!ehRH(req.usuario)) return res.status(403).json({ erro: 'Apenas o RH acessa o controle de benefícios.' });
  const { status, tipo, motivo, loja_id, ano } = req.query;
  const q = (req.query.q || '').trim();
  const where = ['b.empresa_id=?']; const params = [req.usuario.empresa_id];
  if (status && STATUS.includes(status)) { where.push('b.status=?'); params.push(status); }
  if (tipo && TIPOS[tipo]) { where.push('b.tipo=?'); params.push(tipo); }
  if (motivo) { where.push('b.motivo=?'); params.push(motivo); }
  if (loja_id) { where.push('b.loja_id=?'); params.push(loja_id); }
  if (ano) { where.push('b.competencia=?'); params.push(String(ano)); }
  if (q) { where.push('b.colaborador_nome LIKE ?'); params.push(`%${q}%`); }
  const rows = db.prepare(`SELECT b.*, ${lojaNome} loja FROM beneficios b
    WHERE ${where.join(' AND ')} ORDER BY (b.status='a_receber') DESC, b.concedido_em DESC LIMIT 500`).all(...params);
  res.json({ beneficios: rows, tipos: TIPOS });
});

// ── Resumo / dashboard (RH) ─────────────────────────────────────────────────────────
router.get('/resumo', (req, res) => {
  if (!ehRH(req.usuario)) return res.status(403).json({ erro: 'Sem acesso.' });
  const emp = req.usuario.empresa_id;
  const porStatus = db.prepare(`SELECT status, COUNT(*) qtd, COALESCE(SUM(valor),0) valor
    FROM beneficios WHERE empresa_id=? GROUP BY status`).all(emp);
  const porTipo = db.prepare(`SELECT tipo, status, COUNT(*) qtd, COALESCE(SUM(valor),0) valor
    FROM beneficios WHERE empresa_id=? GROUP BY tipo, status`).all(emp);
  const aReceber = db.prepare(`SELECT COUNT(*) qtd, COALESCE(SUM(valor),0) valor
    FROM beneficios WHERE empresa_id=? AND status='a_receber'`).get(emp);
  const valeAberto = db.prepare(`SELECT COALESCE(SUM(valor),0) v FROM beneficios
    WHERE empresa_id=? AND tipo='vale_compras' AND status IN ('a_receber','entregue')`).get(emp).v;
  res.json({ por_status: porStatus, por_tipo: porTipo, a_receber: aReceber, vale_compras_em_aberto: valeAberto, tipos: TIPOS });
});

// ── Meus benefícios (qualquer colaborador) ──────────────────────────────────────────
router.get('/meus', (req, res) => {
  const rows = db.prepare(`SELECT id,tipo,valor,motivo,competencia,status,concedido_em,usado_em,obs,produto_nome
    FROM beneficios WHERE empresa_id=? AND colaborador_id=? ORDER BY concedido_em DESC`)
    .all(req.usuario.empresa_id, req.usuario.id);
  res.json({ beneficios: rows, tipos: TIPOS });
});

// ── Concessão manual (RH) ───────────────────────────────────────────────────────────
// Lista os brindes do estoque (Meu Mercado) para o RH escolher ao conceder — o RH não
// tem acesso direto ao módulo Mercado, então expomos aqui.
router.get('/brindes', (req, res) => {
  if (!ehRH(req.usuario)) return res.status(403).json({ erro: 'Sem acesso.' });
  const emp = req.usuario.empresa_id;
  const varStmt = db.prepare(`SELECT id, nome, estoque FROM mercado_variacoes WHERE empresa_id=? AND produto_id=? AND ativo=1 ORDER BY criado_em`);
  const rows = db.prepare(`SELECT id, nome, imagem, estoque, tem_variacoes FROM mercado_produtos WHERE empresa_id=? AND categoria='brinde' AND ativo=1 ORDER BY nome`).all(emp)
    .map(p => ({ ...p, variacoes: p.tem_variacoes ? varStmt.all(emp, p.id) : [] }));
  res.json({ brindes: rows });
});

router.post('/', (req, res) => {
  if (!ehRH(req.usuario)) return res.status(403).json({ erro: 'Apenas o RH concede benefícios.' });
  const { colaborador_id, tipo } = req.body;
  if (!colaborador_id || !TIPOS[tipo]) return res.status(400).json({ erro: 'Colaborador e tipo são obrigatórios.' });
  const c = db.prepare('SELECT id,nome,loja_id FROM colaboradores WHERE id=? AND empresa_id=?').get(colaborador_id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  // Brinde: opcionalmente vincula um item do estoque do Meu Mercado (+ variação).
  let prodId = null, varId = null, prodNome = null;
  if (tipo === 'brinde' && req.body.produto_id) {
    const p = db.prepare(`SELECT id, nome, tem_variacoes FROM mercado_produtos WHERE id=? AND empresa_id=? AND categoria='brinde'`).get(req.body.produto_id, req.usuario.empresa_id);
    if (p) {
      prodId = p.id; prodNome = p.nome;
      if (p.tem_variacoes && req.body.variacao_id) {
        const v = db.prepare(`SELECT id, nome FROM mercado_variacoes WHERE id=? AND produto_id=?`).get(req.body.variacao_id, p.id);
        if (v) { varId = v.id; prodNome = `${p.nome} (${v.nome})`; }
      }
    }
  }
  const id = uuidv4();
  // Vale-pontos: credita pontos direto na loja de pontos (já entregue).
  const ehValePontos = tipo === 'vale_pontos';
  const pontos = ehValePontos ? Math.round(Number(req.body.valor) || 0) : 0;
  if (ehValePontos && pontos <= 0) return res.status(400).json({ erro: 'Informe quantos pontos.' });
  const statusInicial = ehValePontos ? 'entregue' : 'a_receber';
  db.prepare(`INSERT INTO beneficios
    (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,valor,motivo,competencia,ref,status,concedido_em,registrado_por,obs,produto_id,variacao_id,produto_nome)
    VALUES (?,?,?,?,?,?,?, 'manual', ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)`)
    .run(id, req.usuario.empresa_id, c.id, c.nome, c.loja_id, tipo, Number(req.body.valor) || 0,
      String(new Date().getFullYear()), `manual:${id}`, statusInicial, req.usuario.nome, (req.body.obs || '').slice(0, 300) || null, prodId, varId, prodNome);
  if (ehValePontos) lancarPontos(req.usuario.empresa_id, { colaborador_id: c.id, colaborador_nome: c.nome, loja_id: c.loja_id, tipo: 'manual', descricao: 'Vale-pontos (benefício)', pontos, origem: 'manual', ref: `benef:${id}`, criado_por: req.usuario.nome });
  res.status(201).json({ ok: true, id });
});

// ── Muda status: entregue / usado / cancelado / a_receber (RH) ───────────────────────
router.patch('/:id', (req, res) => {
  if (!ehRH(req.usuario)) return res.status(403).json({ erro: 'Sem acesso.' });
  const { status } = req.body;
  if (!STATUS.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
  const b = db.prepare('SELECT * FROM beneficios WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!b) return res.status(404).json({ erro: 'Benefício não encontrado.' });
  const tx = db.transaction(() => {
    // Brinde entregue → baixa o estoque do Meu Mercado (uma vez, ao entregar).
    if (b.tipo === 'brinde' && b.produto_id && status === 'entregue' && b.status !== 'entregue') {
      if (b.variacao_id) db.prepare(`UPDATE mercado_variacoes SET estoque=estoque-1 WHERE id=?`).run(b.variacao_id);
      else db.prepare(`UPDATE mercado_produtos SET estoque=estoque-1, atualizado_em=datetime('now') WHERE id=?`).run(b.produto_id);
      try {
        db.prepare(`INSERT INTO mercado_movimentos (id,empresa_id,produto_id,variacao_id,tipo,quantidade,custo_unit,origem,referencia,loja_id,destino,colaborador_id,obs,criado_em)
          VALUES (?,?,?,?, 'saida', 1, 0, 'beneficio', ?, ?, ?, ?, ?, datetime('now'))`)
          .run(uuidv4(), b.empresa_id, b.produto_id, b.variacao_id || null, b.id, b.loja_id || null, b.colaborador_nome, b.colaborador_id, 'Benefício brinde');
      } catch { /* ignora se mov indisponível */ }
    }
    const usadoEm = status === 'usado' ? "datetime('now')" : (status === 'a_receber' ? 'NULL' : 'usado_em');
    db.prepare(`UPDATE beneficios SET status=?, registrado_por=?, usado_em=${usadoEm} WHERE id=?`).run(status, req.usuario.nome, req.params.id);
  });
  tx();
  res.json({ ok: true });
});

router.concederBeneficio = concederBeneficio;
module.exports = router;
module.exports.concederBeneficio = concederBeneficio;
