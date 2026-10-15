const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);

// GET /regras/premiacao?funcao_id=func-caixa — regra de premiação de uma função (3 faixas por %)
router.get('/premiacao', (req, res) => {
  const funcaoId = req.query.funcao_id;
  const r = db.prepare('SELECT * FROM regras_premiacao WHERE empresa_id=? AND area=?').get(req.usuario.empresa_id, funcaoId);
  res.json({ regra: r || { faixa1_valor: 0, faixa2_valor: 0, faixa3_valor: 0, faixa4_valor: 0, aceitavel: 90, area: funcaoId } });
});

// GET /regras/premiacao-todas — todas as funções com (ou sem) regra cadastrada
router.get('/premiacao-todas', (req, res) => {
  const funcoes = db.prepare('SELECT id, nome FROM funcoes WHERE empresa_id=? AND ativa=1 ORDER BY nome').all(req.usuario.empresa_id);
  const regras = db.prepare('SELECT * FROM regras_premiacao WHERE empresa_id=?').all(req.usuario.empresa_id);
  const map = {}; regras.forEach(r => { map[r.area] = r; });
  res.json({ funcoes: funcoes.map(f => ({ ...f, regra: map[f.id] || null })) });
});

// POST /regras/premiacao — cadastra/atualiza a regra de uma função
// body: { funcao_id, faixa1_valor, faixa2_valor, faixa3_valor }
router.post('/premiacao', exigePerfil('RH', 'Supervisor', 'Tesouraria', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const area = req.body.funcao_id;
  if (!area) return res.status(400).json({ erro: 'Função obrigatória.' });
  const f1 = Number(req.body.faixa1_valor) || 0, f2 = Number(req.body.faixa2_valor) || 0, f3 = Number(req.body.faixa3_valor) || 0, f4 = Number(req.body.faixa4_valor) || 0;
  const aceitavel = Number(req.body.aceitavel) || 90;
  db.prepare(`INSERT INTO regras_premiacao (id,empresa_id,area,faixa1_valor,faixa2_valor,faixa3_valor,faixa4_valor,aceitavel) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(empresa_id,area) DO UPDATE SET faixa1_valor=excluded.faixa1_valor, faixa2_valor=excluded.faixa2_valor, faixa3_valor=excluded.faixa3_valor, faixa4_valor=excluded.faixa4_valor, aceitavel=excluded.aceitavel`)
    .run(uuidv4(), req.usuario.empresa_id, area, f1, f2, f3, f4, aceitavel);
  res.json({ mensagem: 'Regra de premiação salva.' });
});

// ── Percentuais de premiação sobre vendas (antes fixos no código) ────────────
const premiacaoConfig = require('../lib/premiacaoConfig');
// GET /regras/premiacao-pct — % do vendedor (parcial/meta/super + limiar) e faixas do gerente
router.get('/premiacao-pct', (req, res) => {
  res.json({
    vendedor: premiacaoConfig.getVendedor(req.usuario.empresa_id),
    gerente: premiacaoConfig.getGerente(req.usuario.empresa_id),
    padrao: { vendedor: premiacaoConfig.VEND_DEF, gerente: premiacaoConfig.GER_DEF },
  });
});
// PUT /regras/premiacao-pct — salva os percentuais
router.put('/premiacao-pct', exigePerfil('RH', 'Supervisor', 'Tesouraria', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const out = {};
  if (req.body.vendedor) out.vendedor = premiacaoConfig.setVendedor(req.usuario.empresa_id, req.body.vendedor);
  if (req.body.gerente) out.gerente = premiacaoConfig.setGerente(req.usuario.empresa_id, req.body.gerente);
  res.json({ mensagem: 'Percentuais de premiação salvos.', ...out });
});

// ── Faixas de premiação de VITAMINAS (R$/unidade por faixa) ──────────────────
// GET /regras/vitaminas — lista as faixas cadastradas (ordenadas por quantidade)
router.get('/vitaminas', (req, res) => {
  const faixas = db.prepare('SELECT id, min_un, valor FROM premiacao_vitaminas WHERE empresa_id=? ORDER BY min_un')
    .all(req.usuario.empresa_id);
  res.json({ faixas });
});

// POST /regras/vitaminas — substitui TODAS as faixas por uma nova lista
// body: { faixas: [{ min_un, valor }, ...] }
router.post('/vitaminas', exigePerfil('RH', 'Supervisor', 'Tesouraria', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lista = Array.isArray(req.body.faixas) ? req.body.faixas : [];
  const limpas = lista
    .map(f => ({ min_un: Math.max(0, parseInt(f.min_un, 10) || 0), valor: Math.max(0, Number(f.valor) || 0) }))
    .filter((f, i, arr) => arr.findIndex(x => x.min_un === f.min_un) === i) // sem min_un duplicado
    .sort((a, b) => a.min_un - b.min_un);
  const eid = req.usuario.empresa_id;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM premiacao_vitaminas WHERE empresa_id=?').run(eid);
    const ins = db.prepare('INSERT INTO premiacao_vitaminas (id,empresa_id,min_un,valor) VALUES (?,?,?,?)');
    for (const f of limpas) ins.run(uuidv4(), eid, f.min_un, f.valor);
  });
  tx();
  res.json({ mensagem: 'Faixas de vitaminas salvas.', faixas: limpas });
});

module.exports = router;
