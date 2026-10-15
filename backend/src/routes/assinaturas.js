const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');

router.use(auth);

db.exec(`CREATE TABLE IF NOT EXISTS assinaturas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT, colaborador_id TEXT NOT NULL,
  tipo TEXT, referencia_id TEXT, titulo TEXT, texto TEXT,
  foto_base64 TEXT, ip TEXT, user_agent TEXT, assinado_em TEXT,
  baixado_por_id TEXT, baixado_em TEXT, criado_em TEXT DEFAULT (datetime('now'))
);`);
db.exec(`CREATE TABLE IF NOT EXISTS ciencias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, assinatura_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL, papel TEXT, ip TEXT, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(assinatura_id, colaborador_id)
);`);

const RH_APOIO = ['RH', 'Gestor Geral', 'Diretor Geral'];
function primeiroRH(empresaId) {
  for (const nome of RH_APOIO) {
    const r = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND f.nome=? AND c.ativo=1 ORDER BY c.nome LIMIT 1`).get(empresaId, nome);
    if (r) return r.id;
  }
  return null;
}

// Helper central de assinatura: cria o registro + o card no Kanban com o RH SEMPRE como apoio
// (toda assinatura precisa ser documentada e guardada). Outros fluxos podem reutilizar.
function criarAssinatura({ empresaId, colaboradorId, lojaId, tipo, referenciaId, titulo, texto, criadoPor, cienciaGestao }) {
  const id = uuidv4();
  const rh = primeiroRH(empresaId);
  const tarefaId = gerarTarefa({
    empresa_id: empresaId, loja_id: lojaId || null, tipo: 'tarefa', origem: 'assinatura', referencia_id: id,
    titulo: titulo || 'Assinatura / ciência',
    descricao: texto || 'Confirme a ciência com sua assinatura (foto).',
    responsavel_id: colaboradorId, apoio_id: rh && rh !== colaboradorId ? rh : null, criado_por: criadoPor || null,
  });
  db.prepare(`INSERT INTO assinaturas (id,empresa_id,tarefa_id,colaborador_id,tipo,referencia_id,titulo,texto)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, empresaId, tarefaId, colaboradorId, tipo || null, referenciaId || null, titulo || null, texto || null);

  // Notificações de ciência para a gestão (Diretor, Supervisor, Gerente e Subgerente da loja).
  // Só recebem a notificação para dar ciência — o registro fica no histórico da tarefa.
  if (cienciaGestao) {
    const alvos = [];
    const lojaGestao = lojaId ? db.prepare(`SELECT c.id, f.nome as funcao FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.loja_id=? AND f.nome IN ('Gerente','Subgerente') AND c.ativo=1`).all(empresaId, lojaId) : [];
    lojaGestao.forEach(g => alvos.push({ id: g.id, papel: g.funcao }));
    for (const nome of ['Supervisor', 'Diretor Geral']) {
      const p = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND f.nome=? AND c.ativo=1 ORDER BY c.nome LIMIT 1`).get(empresaId, nome);
      if (p) alvos.push({ id: p.id, papel: nome });
    }
    alvos.forEach(a => {
      if (a.id === colaboradorId) return;
      gerarTarefa({
        empresa_id: empresaId, loja_id: lojaId || null, tipo: 'notificacao', origem: 'ciencia_gestao', referencia_id: id,
        titulo: `Ciência: ${titulo || 'documento'}`,
        descricao: `${texto || 'Confirme que está ciente.'} (Confirme sua ciência — fica registrada no histórico.)`,
        responsavel_id: a.id, criado_por: criadoPor || null,
      });
    });
  }
  return id;
}

function ipDoPedido(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || req.ip || '';
}

// GET /assinaturas/:id — detalhe (pro card) + histórico de ciências
router.get('/:id', (req, res) => {
  const a = db.prepare(`SELECT a.*, c.nome as colaborador_nome, b.nome as baixado_por_nome
    FROM assinaturas a JOIN colaboradores c ON c.id=a.colaborador_id LEFT JOIN colaboradores b ON b.id=a.baixado_por_id
    WHERE a.id=? AND a.empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Assinatura não encontrada.' });
  const historico = db.prepare(`SELECT cz.papel, cz.ip, cz.criado_em, c.nome FROM ciencias cz JOIN colaboradores c ON c.id=cz.colaborador_id WHERE cz.assinatura_id=? ORDER BY cz.criado_em`).all(a.id);
  // O titular assinou com foto: entra no topo do histórico.
  const hist = [];
  if (a.assinado_em) hist.push({ nome: a.colaborador_nome, papel: 'Titular (assinatura com foto)', ip: a.ip, criado_em: a.assinado_em });
  historico.forEach(h => hist.push(h));
  res.json({
    id: a.id, colaborador_id: a.colaborador_id, colaborador_nome: a.colaborador_nome, titulo: a.titulo, texto: a.texto,
    assinado: !!a.assinado_em, assinado_em: a.assinado_em, ip: a.ip, foto_base64: a.foto_base64,
    baixado: !!a.baixado_em, baixado_em: a.baixado_em, baixado_por_nome: a.baixado_por_nome,
    sou_titular: a.colaborador_id === req.usuario.id,
    sou_rh: RH_APOIO.includes(req.usuario.funcao_nome),
    historico: hist,
  });
});

// POST /assinaturas/:id/ciencia-gestao — gestão dá ciência (registra no histórico) e conclui sua notificação
router.post('/:id/ciencia-gestao', (req, res) => {
  const a = db.prepare(`SELECT * FROM assinaturas WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Assinatura não encontrada.' });
  try {
    db.prepare(`INSERT OR IGNORE INTO ciencias (id,empresa_id,assinatura_id,colaborador_id,papel,ip) VALUES (?,?,?,?,?,?)`)
      .run(uuidv4(), req.usuario.empresa_id, a.id, req.usuario.id, req.usuario.funcao_nome, ipDoPedido(req));
  } catch (e) { /* já registrado */ }
  // conclui a notificação de ciência dessa pessoa
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now')
    WHERE empresa_id=? AND origem='ciencia_gestao' AND referencia_id=? AND responsavel_id=? AND status!='concluido'`)
    .run(req.usuario.empresa_id, a.id, req.usuario.id);
  res.json({ mensagem: 'Ciência registrada.' });
});

// POST /assinaturas/:id/assinar — titular assina (foto da câmera); IP/hora capturados no servidor
router.post('/:id/assinar', (req, res) => {
  const a = db.prepare(`SELECT * FROM assinaturas WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Assinatura não encontrada.' });
  if (a.colaborador_id !== req.usuario.id) return res.status(403).json({ erro: 'Só o titular pode assinar.' });
  if (a.assinado_em) return res.json({ mensagem: 'Já assinado.' });
  const { foto } = req.body;
  if (!foto || !/^data:image\/(png|jpeg);base64,/.test(foto)) return res.status(400).json({ erro: 'Foto da ciência é obrigatória.' });

  db.prepare(`UPDATE assinaturas SET foto_base64=?, ip=?, user_agent=?, assinado_em=datetime('now') WHERE id=?`)
    .run(foto, ipDoPedido(req), (req.headers['user-agent'] || '').slice(0, 300), a.id);

  // Notifica o RH (não conclui a tarefa — ela só conclui quando o RH baixar o documento)
  const rh = primeiroRH(req.usuario.empresa_id);
  if (rh) gerarTarefa({
    empresa_id: req.usuario.empresa_id, loja_id: a.tarefa_id ? null : null, tipo: 'notificacao', origem: 'assinatura',
    titulo: `Assinatura registrada · ${req.usuario.nome}`,
    descricao: `${a.titulo || 'Ciência'} assinada. Baixe e arquive o documento (PDF) para concluir.`,
    responsavel_id: rh, criado_por: req.usuario.id,
  });
  res.json({ mensagem: 'Assinatura registrada. O RH vai arquivar o documento.' });
});

// GET /assinaturas/:id/pdf — RH baixa o PDF (foto+IP+hora). Ao baixar, conclui a tarefa.
router.get('/:id/pdf', (req, res) => {
  if (!RH_APOIO.includes(req.usuario.funcao_nome)) return res.status(403).json({ erro: 'Só o RH/diretoria baixa o documento.' });
  const a = db.prepare(`SELECT a.*, c.nome as colaborador_nome FROM assinaturas a JOIN colaboradores c ON c.id=a.colaborador_id WHERE a.id=? AND a.empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Assinatura não encontrada.' });
  if (!a.assinado_em) return res.status(400).json({ erro: 'Ainda não assinado.' });

  let PDFDocument;
  try { PDFDocument = require('pdfkit'); } catch (e) { return res.status(500).json({ erro: 'Biblioteca de PDF não instalada no servidor (rode npm install).' }); }

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ciencia-${a.colaborador_nome.replace(/\s+/g, '_')}-${a.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).text('Comprovante de Ciência / Assinatura', { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).fillColor('#333');
  doc.text(`Documento: ${a.titulo || a.tipo || 'Ciência'}`);
  doc.text(`Colaborador: ${a.colaborador_nome}`);
  doc.text(`Data/hora do aceite: ${a.assinado_em} (UTC)`);
  doc.text(`IP do aceite: ${a.ip || '—'}`);
  doc.moveDown();
  if (a.texto) { doc.fontSize(11).text('Termo:', { underline: true }); doc.fontSize(10).fillColor('#444').text(a.texto); doc.moveDown(); }

  doc.fontSize(11).fillColor('#333').text('Foto da ciência:');
  try {
    const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(a.foto_base64 || '');
    if (m) doc.image(Buffer.from(m[2], 'base64'), { fit: [300, 300] });
    else doc.fontSize(10).fillColor('#999').text('(sem foto)');
  } catch (e) { doc.fontSize(10).fillColor('#999').text('(não foi possível renderizar a foto)'); }

  doc.moveDown();
  // Histórico de ciências (quem estava ciente — registro para questionamentos futuros)
  const hist = db.prepare(`SELECT cz.papel, cz.ip, cz.criado_em, c.nome FROM ciencias cz JOIN colaboradores c ON c.id=cz.colaborador_id WHERE cz.assinatura_id=? ORDER BY cz.criado_em`).all(a.id);
  if (hist.length) {
    doc.fontSize(11).fillColor('#333').text('Histórico de ciências:', { underline: true });
    hist.forEach(h => doc.fontSize(9).fillColor('#444').text(`• ${h.nome} (${h.papel || '—'}) · ${h.criado_em} UTC · IP ${h.ip || '—'}`));
    doc.moveDown();
  }
  doc.fontSize(8).fillColor('#999').text(`Gerado em ${new Date().toISOString()} · Sistema Grupo Mutti`, { align: 'center' });
  doc.end();

  // Marca baixado e conclui a tarefa de assinatura
  db.prepare(`UPDATE assinaturas SET baixado_por_id=?, baixado_em=datetime('now') WHERE id=?`).run(req.usuario.id, a.id);
  if (a.tarefa_id) db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND status!='concluido'`).run(a.tarefa_id);
});

module.exports = router;
module.exports.criarAssinatura = criarAssinatura;
