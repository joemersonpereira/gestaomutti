// publico.js — endpoints PÚBLICOS (sem login) do Banco de Talentos de estágio.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { v4: uuid } = require('uuid');
const EMP = 'empresa-mutti-001';

// Questões do teste (sem revelar a resposta correta)
router.get('/estagio/questoes', (req, res) => {
  const rows = db.prepare(`SELECT id, pergunta, alt_json FROM estagio_teste_questao WHERE empresa_id=? AND ativo=1 ORDER BY criado_em`).all(EMP);
  res.json(rows.map(q => ({ id: q.id, pergunta: q.pergunta, alternativas: (() => { try { return JSON.parse(q.alt_json || '[]'); } catch { return []; } })() })));
});

// Candidato se inscreve + envia respostas → corrige e salva no banco de talentos
router.post('/estagio/candidato', (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'Informe o nome.' });
  const qs = db.prepare(`SELECT id, correta FROM estagio_teste_questao WHERE empresa_id=? AND ativo=1`).all(EMP);
  const resp = b.respostas || {};
  let acertos = 0; qs.forEach(q => { if (String(resp[q.id]) === String(q.correta)) acertos++; });
  const total = qs.length; const nota = total ? Math.round(acertos / total * 1000) / 10 : 0;
  const tipoVaga = (b.tipo_vaga === 'efetivo') ? 'efetivo' : 'estagio';
  db.prepare(`INSERT INTO estagio_candidato (id,empresa_id,nome,cpf,email,telefone,escola,curso,serie,boletim,frequencia,teste_nota,teste_total,teste_respostas_json,status,tipo_vaga)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'novo', ?)`)
    .run(uuid(), EMP, b.nome, b.cpf || null, b.email || null, b.telefone || null, b.escola || null, b.curso || null, b.serie || null,
      Number(b.boletim) || null, Number(b.frequencia) || null, nota, total, JSON.stringify(resp), tipoVaga);
  res.json({ ok: true, nota, acertos, total });
});

// ── Dados bancários preenchidos pelo próprio estagiário (link por ficha) ──
router.get('/estagio/ficha/:id', (req, res) => {
  const f = db.prepare(`SELECT nome, banco, agencia, conta, tipo_conta, pix, dados_bancarios_em FROM estagio_ficha WHERE id=? AND empresa_id=?`).get(req.params.id, EMP);
  if (!f) return res.status(404).json({ erro: 'Ficha não encontrada.' });
  const msg = db.prepare(`SELECT valor FROM estagio_config WHERE empresa_id=? AND chave='estagio_banco_msg'`).get(EMP);
  res.json({ nome: f.nome, banco: f.banco || '', agencia: f.agencia || '', conta: f.conta || '', tipo_conta: f.tipo_conta || '', pix: f.pix || '', ja_informou: !!f.dados_bancarios_em, mensagem: msg ? msg.valor : '' });
});
router.post('/estagio/ficha/:id/bancarios', (req, res) => {
  const b = req.body || {};
  const f = db.prepare(`SELECT id FROM estagio_ficha WHERE id=? AND empresa_id=?`).get(req.params.id, EMP);
  if (!f) return res.status(404).json({ erro: 'Ficha não encontrada.' });
  if (!b.pix && !(b.banco && b.conta)) return res.status(400).json({ erro: 'Informe os dados bancários (banco + conta) ou ao menos uma chave PIX.' });
  const temBanco = !!(b.banco && b.conta);
  // só marca "dados bancários informados" quando vierem os dados completos do banco (PIX sozinho não encerra a pendência)
  db.prepare(`UPDATE estagio_ficha SET banco=?, agencia=?, conta=?, tipo_conta=?, pix=?, ${temBanco ? "dados_bancarios_em=datetime('now')," : ''} atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`)
    .run(b.banco || null, b.agencia || null, b.conta || null, b.tipo_conta || null, b.pix || null, req.params.id, EMP);
  res.json({ ok: true, pendente: !temBanco });
});

module.exports = router;
