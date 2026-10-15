// documentos.js — Documentos pessoais (holerite / informe de rendimento).
// Fluxo em DUAS ETAPAS para não errar a distribuição (dado individual e sigiloso):
//   1) POST /analisar  → RH sobe o PDF; o sistema divide por CPF e mostra a PRÉVIA
//      (quem recebe o quê, quem não foi encontrado). NADA é entregue ainda.
//   2) POST /lote/:id/confirmar → RH confere e confirma; só então cada pessoa recebe
//      SÓ as páginas dela e uma tarefa de ciência.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const holerites = require('../lib/holerites');

router.use(auth);

const soDigitos = s => String(s || '').replace(/\D/g, '');
const ehRH = u => ['RH', 'Gestor Geral', 'Diretor Geral'].includes(u.funcao_nome);
const TIPOS = { holerite: 'Holerite', informe: 'Informe de rendimento' };
const tituloDoc = (tipo, comp) => tipo === 'informe' ? `Informe de rendimento ${comp}` : `Holerite ${comp}`;

// Casa um CPF com colaborador ativo. Retorna { ok, colaborador } ou motivo.
function casarCpf(empresaId, cpf) {
  const rows = db.prepare(`SELECT id, nome, cpf FROM colaboradores WHERE empresa_id=? AND ativo=1
    AND replace(replace(replace(cpf,'.',''),'-',''),' ','')=?`).all(empresaId, cpf);
  if (rows.length === 1) return { ok: true, colaborador: rows[0] };
  if (rows.length === 0) return { ok: false, motivo: 'nao_encontrado' };
  return { ok: false, motivo: 'ambiguo', qtd: rows.length };
}

// ── 1) ANÁLISE (RH) — divide o PDF, casa por CPF e devolve a prévia ─────────────
// body: { tipo:'holerite'|'informe', competencia, arquivo_nome, base64 }
router.post('/analisar', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), async (req, res) => {
  const { tipo, competencia, arquivo_nome } = req.body;
  const base64 = String(req.body.base64 || '').replace(/^data:.*;base64,/, '');
  if (!TIPOS[tipo]) return res.status(400).json({ erro: 'Tipo inválido (holerite ou informe).' });
  if (!competencia) return res.status(400).json({ erro: 'Informe a competência (mês/ano ou ano).' });
  if (!base64) return res.status(400).json({ erro: 'Envie o PDF.' });

  let buffer;
  try { buffer = Buffer.from(base64, 'base64'); } catch { return res.status(400).json({ erro: 'PDF inválido.' }); }
  if (buffer.slice(0, 4).toString() !== '%PDF') return res.status(400).json({ erro: 'O arquivo não é um PDF válido.' });

  let divisao;
  try { divisao = await holerites.dividirPorCpf(buffer); }
  catch (e) { console.error('[documentos] falha ao dividir:', e.message); return res.status(400).json({ erro: 'Não foi possível ler o PDF. Verifique se tem texto (não pode ser imagem escaneada).' }); }

  const loteId = uuidv4();
  const itens = [], insereRascunho = db.prepare(`INSERT INTO documentos_pessoais
    (id, empresa_id, lote_id, colaborador_id, cpf, tipo, competencia, titulo, arquivo_nome, mime, dados, paginas, status, criado_por, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'rascunho', ?, datetime('now'))`);

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO documento_lotes (id, empresa_id, tipo, competencia, arquivo_nome, total_paginas, total_pessoas, distribuidos, nao_encontrados, ambiguos, status, criado_por, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'previa', ?, datetime('now'))`)
      .run(loteId, req.usuario.empresa_id, tipo, String(competencia), arquivo_nome || null,
        divisao.totalPaginas, divisao.grupos.length, 0, 0, 0, req.usuario.id);

    let distribuidos = 0, naoEnc = 0, ambiguos = 0;
    for (const g of divisao.grupos) {
      const match = casarCpf(req.usuario.empresa_id, g.cpf);
      if (match.ok) {
        // já tem esse documento (mesma pessoa/tipo/competência)?
        const jaTem = db.prepare(`SELECT status FROM documentos_pessoais WHERE colaborador_id=? AND tipo=? AND competencia=? AND status IN ('pendente','ciente')`)
          .get(match.colaborador.id, tipo, String(competencia));
        const docId = uuidv4();
        insereRascunho.run(docId, req.usuario.empresa_id, loteId, match.colaborador.id, g.cpf, tipo, String(competencia),
          tituloDoc(tipo, competencia), arquivo_nome || null, 'application/pdf', g.pdfBase64, g.paginas.length, req.usuario.id);
        itens.push({ doc_id: docId, cpf: g.cpf, colaborador_id: match.colaborador.id, colaborador_nome: match.colaborador.nome, paginas: g.paginas, status: jaTem ? 'ja_existe' : 'ok', ja_status: jaTem ? jaTem.status : null });
        distribuidos++;
      } else if (match.motivo === 'ambiguo') {
        itens.push({ cpf: g.cpf, colaborador_nome: null, paginas: g.paginas, status: 'ambiguo', qtd: match.qtd });
        ambiguos++;
      } else {
        itens.push({ cpf: g.cpf, colaborador_nome: null, paginas: g.paginas, status: 'nao_encontrado' });
        naoEnc++;
      }
    }
    db.prepare(`UPDATE documento_lotes SET distribuidos=?, nao_encontrados=?, ambiguos=? WHERE id=?`)
      .run(distribuidos, naoEnc, ambiguos, loteId);
  });
  tx();

  res.json({
    lote_id: loteId, tipo, competencia,
    total_paginas: divisao.totalPaginas, total_pessoas: divisao.grupos.length,
    itens, pendencias_paginas: divisao.pendencias,
    resumo: {
      distribuir: itens.filter(i => i.status === 'ok').length,
      ja_existem: itens.filter(i => i.status === 'ja_existe').length,
      nao_encontrados: itens.filter(i => i.status === 'nao_encontrado').length,
      ambiguos: itens.filter(i => i.status === 'ambiguo').length,
    },
  });
});

// Prévia de um lote (mascara CPF; mostra quem recebe).
router.get('/lote/:id', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lote = db.prepare(`SELECT * FROM documento_lotes WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!lote) return res.status(404).json({ erro: 'Lote não encontrado.' });
  const docs = db.prepare(`SELECT d.id, d.cpf, d.paginas, d.status, c.nome FROM documentos_pessoais d JOIN colaboradores c ON c.id=d.colaborador_id WHERE d.lote_id=?`).all(lote.id);
  res.json({ lote, docs });
});

// ── 2) CONFIRMAÇÃO (RH) — entrega os documentos e abre a ciência ────────────────
router.post('/lote/:id/confirmar', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lote = db.prepare(`SELECT * FROM documento_lotes WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!lote) return res.status(404).json({ erro: 'Lote não encontrado.' });
  if (lote.status !== 'previa') return res.status(400).json({ erro: 'Este lote já foi processado.' });

  const rascunhos = db.prepare(`SELECT * FROM documentos_pessoais WHERE lote_id=? AND status='rascunho'`).all(lote.id);
  let entregues = 0, ignorados = 0;
  const tx = db.transaction(() => {
    for (const d of rascunhos) {
      // DEFESA: reconfere que o CPF do documento ainda casa com o colaborador.
      const c = db.prepare(`SELECT id, cpf, loja_id FROM colaboradores WHERE id=? AND empresa_id=? AND ativo=1`).get(d.colaborador_id, req.usuario.empresa_id);
      if (!c || soDigitos(c.cpf) !== d.cpf) { db.prepare(`UPDATE documentos_pessoais SET status='cancelado' WHERE id=?`).run(d.id); ignorados++; continue; }
      // Se a pessoa já tem esse doc (pendente/ciente), cancela o novo (não sobrescreve às cegas).
      const jaTem = db.prepare(`SELECT id FROM documentos_pessoais WHERE colaborador_id=? AND tipo=? AND competencia=? AND status IN ('pendente','ciente') AND id<>?`)
        .get(d.colaborador_id, d.tipo, d.competencia, d.id);
      if (jaTem) { db.prepare(`UPDATE documentos_pessoais SET status='cancelado' WHERE id=?`).run(d.id); ignorados++; continue; }

      db.prepare(`UPDATE documentos_pessoais SET status='pendente' WHERE id=?`).run(d.id);
      gerarTarefa({
        empresa_id: req.usuario.empresa_id, loja_id: c.loja_id || null, tipo: 'tarefa', origem: 'documento', referencia_id: d.id,
        titulo: `Dar ciência — ${d.titulo}`,
        descricao: `Seu ${TIPOS[d.tipo].toLowerCase()} de ${d.competencia} está disponível em "Meus documentos". Confira e marque ciência.`,
        responsavel_id: d.colaborador_id, urgente: 0, sla_horas: 120, criado_por: req.usuario.id,
      });
      entregues++;
    }
    db.prepare(`UPDATE documento_lotes SET status='distribuido', distribuido_em=datetime('now'), distribuidos=? WHERE id=?`).run(entregues, lote.id);
  });
  tx();
  res.json({ mensagem: `Distribuído para ${entregues} pessoa(s).`, entregues, ignorados });
});

// Cancela uma prévia (apaga os rascunhos).
router.post('/lote/:id/cancelar', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lote = db.prepare(`SELECT * FROM documento_lotes WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!lote) return res.status(404).json({ erro: 'Lote não encontrado.' });
  if (lote.status !== 'previa') return res.status(400).json({ erro: 'Só é possível cancelar uma prévia.' });
  db.prepare(`DELETE FROM documentos_pessoais WHERE lote_id=? AND status='rascunho'`).run(lote.id);
  db.prepare(`UPDATE documento_lotes SET status='cancelado' WHERE id=?`).run(lote.id);
  res.json({ mensagem: 'Prévia cancelada.' });
});

// Lista de lotes já processados (RH).
router.get('/lotes', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lotes = db.prepare(`SELECT l.*, (SELECT COUNT(*) FROM documentos_pessoais d WHERE d.lote_id=l.id AND d.status='ciente') AS cientes
    FROM documento_lotes l WHERE l.empresa_id=? AND l.status<>'cancelado' ORDER BY l.criado_em DESC LIMIT 100`).all(req.usuario.empresa_id);
  res.json({ lotes });
});

// ── Colaborador: seus documentos ────────────────────────────────────────────────
router.get('/meus', (req, res) => {
  const docs = db.prepare(`SELECT id, tipo, competencia, titulo, arquivo_nome, paginas, status, ciente_em, criado_em
    FROM documentos_pessoais WHERE colaborador_id=? AND status IN ('pendente','ciente') ORDER BY criado_em DESC`).all(req.usuario.id);
  res.json({ documentos: docs });
});

// Baixar/ver o PDF — só o DONO (ou RH). Reconfere o CPF do dono contra o documento.
router.get('/:id/arquivo', (req, res) => {
  const d = db.prepare(`SELECT * FROM documentos_pessoais WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!d || d.status === 'cancelado' || d.status === 'rascunho') return res.status(404).json({ erro: 'Documento não encontrado.' });
  const dono = d.colaborador_id === req.usuario.id;
  if (!dono && !ehRH(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  // Segurança extra: se for o dono, o CPF dele tem que bater com o do documento.
  if (dono && soDigitos(req.usuario.cpf) !== d.cpf) return res.status(403).json({ erro: 'Divergência de CPF — acesso bloqueado por segurança.' });
  const buf = Buffer.from(d.dados, 'base64');
  res.setHeader('Content-Type', d.mime || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(d.titulo || 'documento').replace(/[^\w .-]/g, '_')}.pdf"`);
  res.send(buf);
});

// Marcar ciência — só o dono, e só se estiver pendente.
router.post('/:id/ciente', (req, res) => {
  const d = db.prepare(`SELECT * FROM documentos_pessoais WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!d) return res.status(404).json({ erro: 'Documento não encontrado.' });
  if (d.colaborador_id !== req.usuario.id) return res.status(403).json({ erro: 'Só o titular dá ciência.' });
  if (soDigitos(req.usuario.cpf) !== d.cpf) return res.status(403).json({ erro: 'Divergência de CPF — bloqueado.' });
  if (d.status === 'ciente') return res.json({ mensagem: 'Ciência já registrada.' });
  if (d.status !== 'pendente') return res.status(400).json({ erro: 'Documento indisponível.' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
  db.prepare(`UPDATE documentos_pessoais SET status='ciente', ciente_em=datetime('now'), ciente_ip=? WHERE id=?`).run(ip, d.id);
  // encerra a tarefa de ciência, se houver
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE origem='documento' AND referencia_id=? AND status<>'concluido'`).run(d.id);
  res.json({ mensagem: 'Ciência registrada. Obrigado!' });
});

module.exports = router;
