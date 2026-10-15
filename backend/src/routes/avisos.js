// avisos.js — Central de notificações: agrega o que precisa da atenção do usuário logado
// (tarefas pendentes, comunicados sem ciência, benefícios a receber, documentos a confirmar).
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', (req, res) => {
  const { id, empresa_id, loja_id } = req.usuario;
  const c = (sql, ...p) => { try { return db.prepare(sql).get(...p).n || 0; } catch { return 0; } };
  const itens = [];

  const tarefas = c(`SELECT COUNT(*) n FROM tarefas WHERE responsavel_id=? AND empresa_id=? AND status NOT IN ('concluido','cancelado')`, id, empresa_id);
  if (tarefas) itens.push({ tipo: 'tarefas', icone: '✅', titulo: 'Tarefas pendentes', count: tarefas, destino: 'tarefas' });

  const vencidas = c(`SELECT COUNT(*) n FROM tarefas WHERE responsavel_id=? AND empresa_id=? AND status NOT IN ('concluido','cancelado') AND prazo IS NOT NULL AND prazo < datetime('now')`, id, empresa_id);
  if (vencidas) itens.push({ tipo: 'atrasadas', icone: '⏰', titulo: 'Tarefas atrasadas', count: vencidas, destino: 'tarefas', urgente: true });

  const comunicados = c(`SELECT COUNT(*) n FROM mural_posts p
    WHERE p.empresa_id=? AND p.tipo='comunicado' AND p.exige_leitura=1
      AND (p.loja_id IS NULL OR p.loja_id=?)
      AND (p.publicar_em IS NULL OR p.publicar_em <= strftime('%Y-%m-%d %H:%M','now','localtime'))
      AND NOT EXISTS (SELECT 1 FROM mural_leituras l WHERE l.post_id=p.id AND l.colaborador_id=?)`, empresa_id, loja_id, id);
  if (comunicados) itens.push({ tipo: 'comunicados', icone: '📢', titulo: 'Comunicados sem ciência', count: comunicados, destino: 'comunidade' });

  const beneficios = c(`SELECT COUNT(*) n FROM beneficios WHERE colaborador_id=? AND empresa_id=? AND status='a_receber'`, id, empresa_id);
  if (beneficios) itens.push({ tipo: 'beneficios', icone: '🎁', titulo: 'Benefícios a receber', count: beneficios, destino: 'meurh' });

  const documentos = c(`SELECT COUNT(*) n FROM documentos_pessoais WHERE colaborador_id=? AND status='pendente'`, id);
  if (documentos) itens.push({ tipo: 'documentos', icone: '📄', titulo: 'Documentos para confirmar', count: documentos, destino: 'meus-documentos' });

  // Pesquisa de clima aberta que eu ainda não respondi
  try {
    const camp = db.prepare(`SELECT id FROM clima_campanhas WHERE empresa_id=? AND status='aberta' ORDER BY criado_em DESC LIMIT 1`).get(empresa_id);
    if (camp && !db.prepare(`SELECT 1 FROM clima_participou WHERE campanha_id=? AND colaborador_id=?`).get(camp.id, id))
      itens.push({ tipo: 'clima', icone: '📊', titulo: 'Responder pesquisa de clima', count: 1, destino: 'meurh' });
  } catch { /* tabela nova */ }

  // total ignora "atrasadas" (que é subconjunto de tarefas) na soma para não contar 2x
  const total = itens.filter(i => i.tipo !== 'atrasadas').reduce((a, i) => a + i.count, 0);
  res.json({ total, itens });
});

module.exports = router;
