// hoptodesk.js — chamados do HopToDesk no Suporte Loja. Webhook PÚBLICO (assinado) + listagem/resumo
// autenticados. PULL opcional pela API (precisa HOPTODESK_API_KEY no .env).
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const hd = require('../lib/hoptodeskLib');
const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Supervisor', 'Suporte'];

// WEBHOOK (público): HopToDesk faz POST aqui. Valida a assinatura com o segredo (req.rawBody vem do
// express.json verify). Em dev/sem segredo, aceita mesmo assim (pra testar), mas loga.
router.post('/webhook', (req, res) => {
  const sig = req.get('X-Webhook-Signature');
  const temSegredo = !!process.env.HOPTODESK_WEBHOOK_SECRET;
  if (temSegredo && !hd.assinaturaOk(req.rawBody, sig)) return res.status(401).json({ erro: 'Assinatura inválida.' });
  try { const r = hd.processarEvento(req.body || {}); res.json(r); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

router.use(auth);
router.get('/tickets', (req, res) => res.json({ tickets: hd.listar({ status: req.query.status || '', prioridade: req.query.prioridade || '', busca: req.query.busca || '' }) }));
router.get('/resumo', (req, res) => res.json(hd.resumo({ dias: Number(req.query.dias) || 30 })));
router.post('/sincronizar', exigePerfil(...GESTAO), async (req, res) => {
  try { res.json(await hd.sincronizar({})); } catch (e) { res.status(500).json({ erro: e.message }); }
});
router.post('/semear', exigePerfil(...GESTAO), (req, res) => { try { res.json(hd.semearExemplo()); } catch (e) { res.status(500).json({ erro: e.message }); } });

// ── Acesso remoto: dispositivos (computadores) do HopToDesk ──
const db = require('../db/connection');
router.get('/dispositivos', exigePerfil(...GESTAO), (req, res) => {
  res.json({ dispositivos: hd.listarDispositivos(req.usuario.empresa_id) });
});
// Importa a lista exportada do dashboard (CSV cru no corpo, como texto).
router.post('/dispositivos/importar', exigePerfil(...GESTAO), (req, res) => {
  const csv = typeof req.body === 'string' ? req.body : (req.body && req.body.csv) || '';
  const r = hd.importarDispositivos(req.usuario.empresa_id, csv);
  if (!r.ok) return res.status(400).json(r);
  res.json({ ...r, dispositivos: hd.listarDispositivos(req.usuario.empresa_id) });
});
// Adiciona/atualiza UM dispositivo (ao digitar um ID direto no balão — fica salvo).
router.post('/dispositivos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const id = String((req.body.device_id || '')).replace(/\s+/g, '').trim();
  if (!id) return res.status(400).json({ erro: 'Informe o ID do dispositivo.' });
  const nome = (req.body.nome || '').trim();
  db.prepare(`INSERT INTO hoptodesk_device (empresa_id, device_id, nome, status, atualizado_em)
    VALUES (?,?,?, 'manual', datetime('now'))
    ON CONFLICT(empresa_id, device_id) DO UPDATE SET nome=COALESCE(NULLIF(excluded.nome,''), hoptodesk_device.nome), atualizado_em=datetime('now')`).run(emp, id, nome);
  res.json({ ok: true, dispositivos: hd.listarDispositivos(emp) });
});
// Renomeia um dispositivo.
router.put('/dispositivos/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const id = String(req.params.id || '').replace(/\s+/g, '').trim();
  db.prepare('UPDATE hoptodesk_device SET nome=?, atualizado_em=datetime(\'now\') WHERE empresa_id=? AND device_id=?').run((req.body.nome || '').trim(), emp, id);
  res.json({ ok: true, dispositivos: hd.listarDispositivos(emp) });
});
router.delete('/dispositivos/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM hoptodesk_device WHERE empresa_id=? AND device_id=?').run(emp, String(req.params.id || '').replace(/\s+/g, '').trim());
  res.json({ ok: true, dispositivos: hd.listarDispositivos(emp) });
});

module.exports = router;
