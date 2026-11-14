// meuSetorArea.js — Meu Setor + Metas por ÁREA (online | suporte). Apuração dos pilares + config das
// metas (cadastrável pela gestão/diretoria).
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const ms = require('../lib/meuSetorArea');
const { lojasEmpresa } = require('../lib/escopoCompras');
const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Supervisor'];

router.use(auth);
const areaOk = a => !!(ms.PILARES && ms.PILARES[a]); // qualquer área definida no catálogo (online/suporte/marketing/…)

router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));

// Apuração dos pilares (nota por pilar + geral) no período.
router.get('/:area/apurar', async (req, res) => {
  if (!areaOk(req.params.area)) return res.status(400).json({ erro: 'Área inválida.' });
  try { res.json(await ms.apurar(req.usuario.empresa_id, req.params.area, { dias: Number(req.query.dias) || 30, ini: req.query.ini || '', fim: req.query.fim || '', lojaId: req.query.loja || '' })); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});
// Config dos indicadores (meta/peso/direção/ativo) — a aba Metas.
router.get('/:area/config', (req, res) => {
  if (!areaOk(req.params.area)) return res.status(400).json({ erro: 'Área inválida.' });
  res.json({ pilares: ms.PILARES[req.params.area], indicadores: ms.config(req.usuario.empresa_id, req.params.area) });
});
router.post('/:area/config', exigePerfil(...GESTAO), (req, res) => {
  if (!areaOk(req.params.area)) return res.status(400).json({ erro: 'Área inválida.' });
  try { res.json(ms.setConfig(req.usuario.empresa_id, req.params.area, req.body || {})); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

// Premiação (teto R$ por pilar + bônus %) — igual caixas.
router.get('/:area/premio', (req, res) => {
  if (!areaOk(req.params.area)) return res.status(400).json({ erro: 'Área inválida.' });
  const emp = req.usuario.empresa_id, a = req.params.area;
  res.json({ premioValor: ms.premioPilar(emp, a), bonusPct: ms.premioBonusPct(emp, a), pessoas: ms.listPessoas(emp, a) });
});
router.put('/:area/premio', exigePerfil(...GESTAO), (req, res) => {
  if (!areaOk(req.params.area)) return res.status(400).json({ erro: 'Área inválida.' });
  try { res.json(ms.setPremio(req.usuario.empresa_id, req.params.area, req.body || {})); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
// Pessoas vinculadas por fator (faixas do prêmio).
router.post('/:area/pessoas', exigePerfil(...GESTAO), (req, res) => {
  if (!areaOk(req.params.area)) return res.status(400).json({ erro: 'Área inválida.' });
  try { res.json(ms.addPessoa(req.usuario.empresa_id, req.params.area, req.body || {})); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
router.delete('/:area/pessoas/:id', exigePerfil(...GESTAO), (req, res) => {
  if (!areaOk(req.params.area)) return res.status(400).json({ erro: 'Área inválida.' });
  try { res.json(ms.rmPessoa(req.usuario.empresa_id, req.params.area, req.params.id)); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

module.exports = router;
