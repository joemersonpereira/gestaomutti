// pedemeia.js — Pé de Meia do colaborador: converte pontos em R$ (10 pts = R$1), recebe vale-compras,
// e permite 1 saque por ano, só no fim do ano.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

const PONTOS_POR_REAL = 10;         // 10 pontos = R$ 1
const MES_SAQUE = 12;               // saque liberado a partir de dezembro
const anoAtual = () => new Date().getFullYear();
const mesAtual = () => new Date().getMonth() + 1;

router.use(auth);

function saldoPontos(emp, colab) {
  const g = db.prepare('SELECT COALESCE(SUM(pontos),0) c FROM pontos_lancamentos WHERE empresa_id=? AND colaborador_id=?').get(emp, colab).c;
  const r = db.prepare("SELECT COALESCE(SUM(pontos),0) c FROM pontos_resgates WHERE empresa_id=? AND colaborador_id=? AND status<>'cancelado'").get(emp, colab).c;
  return g - r;
}
function saldoPedemeia(emp, colab) {
  return db.prepare('SELECT COALESCE(SUM(valor),0) s FROM pedemeia_movimentos WHERE empresa_id=? AND colaborador_id=?').get(emp, colab).s || 0;
}
function valeAberto(emp, colab) {
  return db.prepare("SELECT COALESCE(SUM(valor),0) v FROM beneficios WHERE empresa_id=? AND colaborador_id=? AND tipo='vale_compras' AND status IN ('a_receber','entregue')").get(emp, colab).v || 0;
}
function saqueAno(emp, colab, ano) {
  return db.prepare("SELECT 1 FROM pedemeia_movimentos WHERE empresa_id=? AND colaborador_id=? AND tipo='saque' AND ano=?").get(emp, colab, ano);
}

router.get('/', (req, res) => {
  const emp = req.usuario.empresa_id, colab = req.usuario.id, ano = anoAtual();
  const saldo = saldoPedemeia(emp, colab);
  const jaSacou = !!saqueAno(emp, colab, ano);
  const movs = db.prepare('SELECT tipo, valor, pontos, obs, criado_em FROM pedemeia_movimentos WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em DESC LIMIT 100').all(emp, colab);
  res.json({
    saldo, saldoPontos: saldoPontos(emp, colab), valeAberto: valeAberto(emp, colab),
    pontosPorReal: PONTOS_POR_REAL, mesSaque: MES_SAQUE, ano,
    podeSacar: saldo > 0 && !jaSacou && mesAtual() >= MES_SAQUE, jaSacou,
    motivoBloqueio: jaSacou ? 'Você já sacou este ano.' : mesAtual() < MES_SAQUE ? `O saque libera em dezembro.` : saldo <= 0 ? 'Sem saldo.' : null,
    movimentos: movs,
  });
});

// Converte pontos → R$ no pé de meia.
router.post('/converter-pontos', (req, res) => {
  const emp = req.usuario.empresa_id, colab = req.usuario.id;
  let pontos = Math.floor(Number(req.body.pontos) || 0);
  if (pontos < PONTOS_POR_REAL) return res.status(400).json({ erro: `Mínimo de ${PONTOS_POR_REAL} pontos.` });
  pontos = pontos - (pontos % PONTOS_POR_REAL); // múltiplo de 10
  if (pontos > saldoPontos(emp, colab)) return res.status(400).json({ erro: 'Pontos insuficientes.' });
  const reais = pontos / PONTOS_POR_REAL;
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO pontos_resgates (id,empresa_id,colaborador_id,colaborador_nome,loja_id,produto_id,produto_nome,pontos,status,criado_em)
      VALUES (?,?,?,?,?,'pedemeia','Pé de Meia (R$)',?,'separado',datetime('now'))`).run(uuid(), emp, colab, req.usuario.nome, req.usuario.loja_id || null, pontos);
    db.prepare(`INSERT INTO pedemeia_movimentos (id,empresa_id,colaborador_id,colaborador_nome,tipo,valor,pontos,ano,obs,criado_por,criado_em)
      VALUES (?,?,?,?,'deposito_pontos',?,?,?,?,?,datetime('now'))`).run(uuid(), emp, colab, req.usuario.nome, reais, pontos, anoAtual(), `${pontos} pontos convertidos`, colab);
  });
  tx();
  res.json({ ok: true, reais, pontos, saldo: saldoPedemeia(emp, colab) });
});

// Move o vale-compras em aberto para o pé de meia.
router.post('/mover-vale', (req, res) => {
  const emp = req.usuario.empresa_id, colab = req.usuario.id;
  const vales = db.prepare("SELECT id, valor FROM beneficios WHERE empresa_id=? AND colaborador_id=? AND tipo='vale_compras' AND status IN ('a_receber','entregue') AND valor>0").all(emp, colab);
  const total = vales.reduce((a, v) => a + (v.valor || 0), 0);
  if (total <= 0) return res.status(400).json({ erro: 'Você não tem vale-compras em aberto.' });
  const tx = db.transaction(() => {
    for (const v of vales) db.prepare("UPDATE beneficios SET status='usado', usado_em=datetime('now'), obs=COALESCE(obs,'')||' · movido p/ Pé de Meia', registrado_por=? WHERE id=?").run(colab, v.id);
    db.prepare(`INSERT INTO pedemeia_movimentos (id,empresa_id,colaborador_id,colaborador_nome,tipo,valor,ano,obs,criado_por,criado_em)
      VALUES (?,?,?,?,'deposito_vale',?,?,?,?,datetime('now'))`).run(uuid(), emp, colab, req.usuario.nome, total, anoAtual(), `Vale-compras (${vales.length}) movido`, colab);
  });
  tx();
  res.json({ ok: true, movido: total, saldo: saldoPedemeia(emp, colab) });
});

// Saque (1x/ano, só a partir de dezembro). Registra o saque; a entrega do dinheiro é operacional (RH/financeiro).
router.post('/sacar', (req, res) => {
  const emp = req.usuario.empresa_id, colab = req.usuario.id, ano = anoAtual();
  const saldo = saldoPedemeia(emp, colab);
  if (saldo <= 0) return res.status(400).json({ erro: 'Sem saldo para sacar.' });
  if (saqueAno(emp, colab, ano)) return res.status(400).json({ erro: 'Você já sacou este ano.' });
  if (mesAtual() < MES_SAQUE) return res.status(400).json({ erro: 'O saque só libera em dezembro.' });
  db.prepare(`INSERT INTO pedemeia_movimentos (id,empresa_id,colaborador_id,colaborador_nome,tipo,valor,ano,obs,criado_por,criado_em)
    VALUES (?,?,?,?,'saque',?,?,?,?,datetime('now'))`).run(uuid(), emp, colab, req.usuario.nome, -saldo, ano, 'Saque anual do Pé de Meia', colab);
  res.json({ ok: true, sacado: saldo });
});

// Visão do RH/gestão: saques do ano a pagar.
router.get('/saques', exigePerfil('Diretor Geral', 'Gestor Geral', 'Controladoria', 'Analista de RH', 'Supervisor'), (req, res) => {
  const rows = db.prepare("SELECT colaborador_nome, -valor valor, ano, criado_em FROM pedemeia_movimentos WHERE empresa_id=? AND tipo='saque' ORDER BY criado_em DESC LIMIT 200").all(req.usuario.empresa_id);
  res.json({ saques: rows });
});

module.exports = router;
