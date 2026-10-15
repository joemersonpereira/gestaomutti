// termos.js — assinatura online de termos. Endpoints /public/* NÃO exigem login (o paciente assina).
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

const token6 = () => uuid().replace(/-/g, '').slice(0, 10);

// Criar um pedido de assinatura (farmacêutico) → devolve o token/link.
router.post('/', auth, (req, res) => {
  const u = req.usuario;
  const { paciente_id, paciente_nome, tipo, termo_texto, servico_id } = req.body;
  if (!termo_texto || !termo_texto.trim()) return res.status(400).json({ erro: 'Sem texto de termo.' });
  const lojaNome = u.loja_id ? db.prepare('SELECT nome FROM lojas WHERE id=?').get(u.loja_id)?.nome || null : null;
  const nome = paciente_nome || (paciente_id ? db.prepare('SELECT nome FROM pacientes_farmac WHERE id=?').get(paciente_id)?.nome : null) || null;
  const id = uuid(); const token = token6();
  db.prepare(`INSERT INTO termo_assinaturas (id,empresa_id,token,paciente_id,paciente_nome,tipo,termo_texto,servico_id,loja_nome,status,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?, 'pendente', ?)`)
    .run(id, u.empresa_id, token, paciente_id || null, nome, (tipo || '').trim() || null, termo_texto.trim(), servico_id || null, lojaNome, u.id);
  res.json({ ok: true, id, token });
});

// Status (farmacêutico) — pra saber se já assinou.
router.get('/:id', auth, (req, res) => {
  const t = db.prepare('SELECT id, status, assinante_nome, assinado_em, token FROM termo_assinaturas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!t) return res.status(404).json({ erro: 'Não encontrado.' });
  res.json(t);
});

// ── PÚBLICO (paciente, sem login) ────────────────────────────────────────────
router.get('/public/:token', (req, res) => {
  const t = db.prepare('SELECT tipo, paciente_nome, termo_texto, loja_nome, status, assinado_em, assinante_nome FROM termo_assinaturas WHERE token=?').get(req.params.token);
  if (!t) return res.status(404).json({ erro: 'Termo não encontrado ou link inválido.' });
  res.json(t);
});
router.post('/public/:token/assinar', (req, res) => {
  const t = db.prepare('SELECT * FROM termo_assinaturas WHERE token=?').get(req.params.token);
  if (!t) return res.status(404).json({ erro: 'Termo não encontrado.' });
  if (t.status === 'assinado') return res.status(409).json({ erro: 'Este termo já foi assinado.' });
  const { assinante_nome, assinante_cpf, assinatura, aceite } = req.body;
  if (!assinante_nome || !assinante_nome.trim()) return res.status(400).json({ erro: 'Informe seu nome completo.' });
  if (!aceite) return res.status(400).json({ erro: 'É preciso marcar o aceite do termo.' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim().slice(0, 60);
  db.prepare(`UPDATE termo_assinaturas SET status='assinado', assinante_nome=?, assinante_cpf=?, assinatura=?, assinado_em=datetime('now'), assinado_ip=? WHERE token=?`)
    .run(assinante_nome.trim(), (assinante_cpf || '').trim() || null, (assinatura || '').slice(0, 200000) || null, ip, t.token);
  // marca o serviço vinculado como termo aceito
  if (t.servico_id) db.prepare("UPDATE servicos_farmaceuticos SET termo_aceito=1, termo_aceito_em=datetime('now') WHERE id=? AND empresa_id=?").run(t.servico_id, t.empresa_id);
  res.json({ ok: true });
});

// PDF do termo assinado (comprovante) — auth. Gera com pdfkit, inclui a assinatura.
router.get('/:id/pdf', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM termo_assinaturas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!t) return res.status(404).json({ erro: 'Não encontrado.' });
  if (t.status !== 'assinado') return res.status(409).json({ erro: 'Termo ainda não assinado.' });
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="termo-${(t.assinante_nome || 'assinado').replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.pdf"`);
  doc.pipe(res);
  const fmtDT = s => { if (!s) return ''; const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')); return isNaN(d) ? s : d.toLocaleString('pt-BR'); };

  doc.fontSize(16).font('Helvetica-Bold').text('Termo de Responsabilidade — Cuidado Farmacêutico', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#666')
    .text(`${t.tipo || 'Serviço farmacêutico'}${t.loja_nome ? ' · ' + t.loja_nome : ''}`, { align: 'center' });
  doc.moveDown(1).fillColor('#000');
  if (t.paciente_nome) { doc.fontSize(11).font('Helvetica-Bold').text('Paciente: ', { continued: true }).font('Helvetica').text(t.paciente_nome); doc.moveDown(0.4); }

  doc.fontSize(11.5).font('Helvetica').text(t.termo_texto || '', { align: 'justify', lineGap: 3 });
  doc.moveDown(1.2);

  // Bloco da assinatura
  doc.fontSize(11).font('Helvetica-Bold').text('Assinatura eletrônica');
  doc.moveDown(0.3);
  if (t.assinatura && /^data:image\//.test(t.assinatura)) {
    try { doc.image(Buffer.from(t.assinatura.split(',')[1], 'base64'), { fit: [220, 90] }); }
    catch { /* imagem inválida — ignora */ }
  }
  doc.moveDown(0.3).fontSize(10.5).font('Helvetica')
    .text(`Assinado por: ${t.assinante_nome || '—'}${t.assinante_cpf ? ' · CPF ' + t.assinante_cpf : ''}`)
    .text(`Data/hora: ${fmtDT(t.assinado_em)}`)
    .text(`IP de origem: ${t.assinado_ip || '—'}`)
    .fillColor('#888').fontSize(8.5).text(`Documento gerado eletronicamente pelo sistema Mutti · token ${t.token}`, { align: 'left' });
  doc.end();
});

module.exports = router;
