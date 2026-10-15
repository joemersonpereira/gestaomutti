const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');

router.use(auth);

// Horas restantes a partir de um prazo ISO (negativo = vencido)
function horasRestantes(prazo) {
  if (!prazo) return null;
  const ms = new Date(prazo.replace(' ', 'T')) - new Date();
  return Math.round(ms / 36e5);
}

// GET /aprovacoes — fila unificada do Diretor (metas + certificados) com timer
router.get('/', exigePerfil('Diretor Geral', 'Gestor Geral'), (req, res) => {
  const { empresa_id } = req.usuario;

  // Metas pendentes — timer vem da tarefa de aprovação vinculada (sla 24h)
  const metas = db.prepare(`
    SELECT m.id, m.loja_id, m.mes, m.ano, m.valor_meta, m.valor_super_meta, m.criado_em, l.nome as loja_nome
    FROM metas m JOIN lojas l ON l.id=m.loja_id
    WHERE m.empresa_id=? AND m.colaborador_id IS NULL AND m.status_aprovacao='pendente'
    ORDER BY m.criado_em
  `).all(empresa_id).map(m => {
    const t = db.prepare(`SELECT prazo FROM tarefas WHERE empresa_id=? AND loja_id=? AND origem='aprovacao_meta' AND status!='concluido' ORDER BY criado_em DESC LIMIT 1`).get(empresa_id, m.loja_id);
    return {
      tipo: 'meta', ref_id: m.id, titulo: `Meta ${m.loja_nome} — ${String(m.mes).padStart(2,'0')}/${m.ano}`,
      detalhe: `Meta R$ ${Number(m.valor_meta).toLocaleString('pt-BR')} · Super R$ ${Number(m.valor_super_meta).toLocaleString('pt-BR')}`,
      horas_restantes: horasRestantes(t?.prazo), prazo: t?.prazo || null,
    };
  });

  // Certificados aguardando validação do Diretor
  const certs = db.prepare(`
    SELECT c.id, c.tipo, c.titulo, c.criado_em, col.nome as colaborador_nome
    FROM certificados c JOIN colaboradores col ON col.id=c.colaborador_id
    WHERE c.empresa_id=? AND c.validado=0 ORDER BY c.criado_em
  `).all(empresa_id).map(c => ({
    tipo: 'certificado', ref_id: c.id, titulo: `Certificado: ${c.titulo}`,
    detalhe: `${c.colaborador_nome} · ${c.tipo}`, horas_restantes: null, prazo: null,
  }));

  // Avaliações de tarefa com nota baixa (≤2) que geram acompanhamento do Diretor
  const avaliacoesBaixas = db.prepare(`
    SELECT at.id, at.nota, t.titulo, t.loja_id
    FROM avaliacoes_tarefa at JOIN tarefas t ON t.id=at.tarefa_id
    WHERE t.empresa_id=? AND at.nota<=2 ORDER BY at.id DESC LIMIT 20
  `).all(empresa_id).map(a => ({
    tipo: 'avaliacao_baixa', ref_id: a.id, titulo: `Avaliação baixa (${a.nota}/5)`,
    detalhe: a.titulo, horas_restantes: null, prazo: null,
  }));

  const fila = [...metas, ...certs];
  // ordena por urgência (menos horas restantes primeiro; nulls ao fim)
  fila.sort((a, b) => (a.horas_restantes ?? 1e9) - (b.horas_restantes ?? 1e9));

  res.json({
    fila,
    acompanhamentos: avaliacoesBaixas,
    resumo: {
      metas_pendentes: metas.length,
      certificados_pendentes: certs.length,
      vencendo_24h: fila.filter(f => f.horas_restantes != null && f.horas_restantes <= 24).length,
      vencidos: fila.filter(f => f.horas_restantes != null && f.horas_restantes < 0).length,
    },
  });
});

// POST /aprovacoes/certificado/:id — Diretor valida certificado
router.post('/certificado/:id', exigePerfil('Diretor Geral', 'Gestor Geral'), (req, res) => {
  const { aprovado } = req.body;
  const cert = db.prepare('SELECT * FROM certificados WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!cert) return res.status(404).json({ erro: 'Certificado não encontrado.' });
  if (aprovado) {
    db.prepare('UPDATE certificados SET validado=1 WHERE id=?').run(req.params.id);
    res.json({ mensagem: 'Certificado validado.' });
  } else {
    db.prepare('DELETE FROM certificados WHERE id=?').run(req.params.id);
    res.json({ mensagem: 'Certificado recusado.' });
  }
});

module.exports = router;
