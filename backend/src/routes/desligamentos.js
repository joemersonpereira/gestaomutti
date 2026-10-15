// desligamentos.js — RH registra o desligamento (inativa o colaborador) e envia um link
// de PESQUISA DE DESLIGAMENTO (exit survey). As respostas viram indicadores para a gestão.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

const RH = ['RH', 'Gestor Geral', 'Diretor Geral'];
const TIPOS = ['voluntario', 'involuntario', 'fim_contrato', 'outro'];
const MOTIVOS = ['melhor_oportunidade', 'salario', 'lideranca', 'ambiente', 'crescimento', 'pessoal_familia', 'mudanca', 'insatisfacao', 'saude', 'outro'];
const DIMS = ['s_geral', 's_lideranca', 's_ambiente', 's_remuneracao', 's_crescimento', 's_reconhecimento', 's_carga', 's_ferramentas'];

// ══════════════ PÚBLICO — o colaborador responde a pesquisa (sem login) ══════════════
router.get('/pesquisa/:token', (req, res) => {
  const d = db.prepare(`SELECT d.colaborador_nome, d.pesquisa_status, e.nome empresa FROM desligamentos d JOIN empresas e ON e.id=d.empresa_id WHERE d.token=?`).get(req.params.token);
  if (!d) return res.status(404).json({ erro: 'Link inválido.' });
  res.json({ empresa: d.empresa, nome: d.colaborador_nome, ja_respondida: d.pesquisa_status === 'respondida' });
});

router.post('/pesquisa/:token', (req, res) => {
  const d = db.prepare(`SELECT id, pesquisa_status FROM desligamentos WHERE token=?`).get(req.params.token);
  if (!d) return res.status(404).json({ erro: 'Link inválido.' });
  if (d.pesquisa_status === 'respondida') return res.status(409).json({ erro: 'Esta pesquisa já foi respondida. Obrigado!' });
  const b = req.body || {};
  const nota = v => { const n = parseInt(v); return n >= 1 && n <= 5 ? n : null; };
  const enps = (() => { const n = parseInt(b.enps); return n >= 0 && n <= 10 ? n : null; })();
  db.prepare(`UPDATE desligamentos SET pesquisa_status='respondida', respondida_em=datetime('now'),
      motivo_saida=?, s_geral=?, s_lideranca=?, s_ambiente=?, s_remuneracao=?, s_crescimento=?, s_reconhecimento=?, s_carga=?, s_ferramentas=?,
      enps=?, voltaria=?, comentario=?, sugestoes=? WHERE id=?`)
    .run(MOTIVOS.includes(b.motivo_saida) ? b.motivo_saida : null,
      nota(b.s_geral), nota(b.s_lideranca), nota(b.s_ambiente), nota(b.s_remuneracao), nota(b.s_crescimento), nota(b.s_reconhecimento), nota(b.s_carga), nota(b.s_ferramentas),
      enps, ['sim', 'talvez', 'nao'].includes(b.voltaria) ? b.voltaria : null,
      (b.comentario || '').toString().slice(0, 2000) || null, (b.sugestoes || '').toString().slice(0, 2000) || null, d.id);
  res.status(201).json({ ok: true, mensagem: 'Obrigado pela sua sinceridade! Sua resposta ajuda a empresa a melhorar. 💚' });
});

// ══════════════ RH (com login) ══════════════
router.use(auth);

// Registra o desligamento e gera o link da pesquisa. Inativa o colaborador.
router.post('/', exigePerfil(...RH), (req, res) => {
  const { colaborador_id } = req.body;
  const c = db.prepare(`SELECT c.id, c.nome, c.loja_id, (SELECT nome FROM funcoes WHERE id=c.funcao_id) funcao FROM colaboradores c WHERE c.id=? AND c.empresa_id=?`).get(colaborador_id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const jaAtivo = db.prepare(`SELECT id FROM desligamentos WHERE colaborador_id=? AND empresa_id=?`).get(c.id, req.usuario.empresa_id);
  if (jaAtivo) return res.status(409).json({ erro: 'Este colaborador já tem desligamento registrado.' });
  const id = uuidv4();
  const token = crypto.randomBytes(18).toString('base64url');
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO desligamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,funcao,tipo,data_desligamento,motivo_rh,obs_rh,registrado_por,token,pesquisa_status,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pendente', datetime('now'))`)
      .run(id, req.usuario.empresa_id, c.id, c.nome, c.loja_id, c.funcao, TIPOS.includes(req.body.tipo) ? req.body.tipo : 'outro',
        (req.body.data_desligamento || '').toString().slice(0, 10) || null, (req.body.motivo_rh || '').toString().slice(0, 300) || null,
        (req.body.obs_rh || '').toString().slice(0, 1000) || null, req.usuario.nome, token);
    db.prepare(`UPDATE colaboradores SET ativo=0, situacao='desligado' WHERE id=?`).run(c.id);
  });
  tx();
  res.status(201).json({ ok: true, id, token, link: `/pesquisa-desligamento?t=${token}` });
});

router.get('/', exigePerfil(...RH), (req, res) => {
  const rows = db.prepare(`SELECT d.*, (SELECT nome FROM lojas WHERE id=d.loja_id) loja FROM desligamentos d
    WHERE d.empresa_id=? ORDER BY d.criado_em DESC LIMIT 300`).all(req.usuario.empresa_id);
  res.json({ desligamentos: rows, tipos: TIPOS, motivos: MOTIVOS });
});

// Indicadores agregados p/ a gestão.
router.get('/analytics', exigePerfil(...RH), (req, res) => {
  const emp = req.usuario.empresa_id;
  const all = db.prepare(`SELECT * FROM desligamentos WHERE empresa_id=?`).all(emp);
  const resp = all.filter(d => d.pesquisa_status === 'respondida');
  const media = campo => { const v = resp.map(r => r[campo]).filter(n => n != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
  const cont = (arr, campo) => { const o = {}; arr.forEach(r => { const k = r[campo] || 'nao_informado'; o[k] = (o[k] || 0) + 1; }); return o; };
  // eNPS = %promotores(9-10) - %detratores(0-6)
  const enpsVals = resp.map(r => r.enps).filter(n => n != null);
  let enps = null;
  if (enpsVals.length) { const pro = enpsVals.filter(n => n >= 9).length, det = enpsVals.filter(n => n <= 6).length; enps = Math.round((pro - det) / enpsVals.length * 100); }
  res.json({
    total: all.length,
    respondidas: resp.length, pendentes: all.length - resp.length,
    por_tipo: cont(all, 'tipo'),
    por_motivo: cont(resp, 'motivo_saida'),
    voltaria: cont(resp.filter(r => r.voltaria), 'voltaria'),
    medias: Object.fromEntries(DIMS.map(d => [d, media(d)])),
    enps,
  });
});

router.get('/:id', exigePerfil(...RH), (req, res) => {
  const d = db.prepare(`SELECT d.*, (SELECT nome FROM lojas WHERE id=d.loja_id) loja FROM desligamentos d WHERE d.id=? AND d.empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!d) return res.status(404).json({ erro: 'Não encontrado.' });
  res.json(d);
});

module.exports = router;
