const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const { GRUPOS_VENDA, GRUPO_KEYS } = require('../lib/gruposVenda');
const vendasErp = require('../lib/vendasErp');
const calc = require('../lib/calculosVendas');

router.use(auth);

// Salva os grupos de uma meta e devolve {total_meta, total_super}. grupos = [{grupo,valor_meta,valor_super}]
function salvarGruposMeta(empresaId, metaId, grupos) {
  db.prepare('DELETE FROM meta_grupos WHERE meta_id = ?').run(metaId);
  let tm = 0, ts = 0;
  const ins = db.prepare(`INSERT INTO meta_grupos (id,empresa_id,meta_id,grupo,valor_meta,valor_super) VALUES (?,?,?,?,?,?)`);
  for (const g of grupos || []) {
    if (!GRUPO_KEYS.includes(g.grupo)) continue;
    const vm = Number(g.valor_meta) || 0, vs = Number(g.valor_super) || 0;
    if (vm === 0 && vs === 0) continue;
    ins.run(uuidv4(), empresaId, metaId, g.grupo, vm, vs);
    tm += vm; ts += vs;
  }
  return { total_meta: tm, total_super: ts };
}
function gruposDaMeta(metaId) {
  return db.prepare('SELECT grupo, valor_meta, valor_super FROM meta_grupos WHERE meta_id = ?').all(metaId);
}

// GET /metas?loja_id=&mes=&ano=
router.get('/', (req, res) => {
  const { empresa_id, funcao_nome, loja_id: minhaLoja } = req.usuario;
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  let q = `
    SELECT m.*, l.nome as loja_nome, c.nome as colaborador_nome
    FROM metas m
    JOIN lojas l ON l.id = m.loja_id
    LEFT JOIN colaboradores c ON c.id = m.colaborador_id
    WHERE m.empresa_id = ? AND m.mes = ? AND m.ano = ?
  `;
  const params = [empresa_id, mes, ano];
  if (req.query.loja_id) { q += ' AND m.loja_id = ?'; params.push(req.query.loja_id); }
  else if (['Gerente'].includes(funcao_nome)) { q += ' AND m.loja_id = ?'; params.push(minhaLoja); }
  q += ' ORDER BY m.colaborador_id IS NOT NULL, l.nome';

  let metas = db.prepare(q).all(...params);
  // Vendedor não vê valores absolutos das metas
  if (funcao_nome === 'Vendedor') {
    metas = metas.map(({ valor_meta, valor_super_meta, ...r }) => ({ ...r, valores_ocultos: true }));
  }
  res.json({ mes, ano, metas });
});

// POST /metas — gerente/supervisor propõe meta da loja (vai para aprovação do Diretor)
// body: { loja_id, mes, ano, valor_meta, valor_super_meta }
// Libera uma campanha aprovada: avisa o gerente (ciência) e pede aceite ao responsável (5 dias).
function liberar(empresaId, meta, criadoPor) {
  const loja = db.prepare('SELECT nome FROM lojas WHERE id = ?').get(meta.loja_id);
  const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id='func-gerente' AND ativo=1 LIMIT 1`).get(empresaId, meta.loja_id);
  const responsavel = meta.responsavel_id || gerente?.id;
  const nome = meta.nome_campanha || `Campanha ${meta.mes}/${meta.ano}`;
  if (gerente) {
    gerarTarefa({
      empresa_id: empresaId, loja_id: meta.loja_id, tipo: 'notificacao', origem: 'premiacao',
      titulo: `Meta liberada — ${nome}`,
      descricao: `Meta de R$ ${Number(meta.valor_meta).toLocaleString('pt-BR')} liberada para ${loja?.nome || ''}. Confirme a ciência.`,
      responsavel_id: gerente.id, urgente: 0, sla_horas: 120, criado_por: criadoPor,
    });
  }
  if (responsavel) {
    gerarTarefa({
      empresa_id: empresaId, loja_id: meta.loja_id, tipo: 'tarefa', origem: 'premiacao_aceite', referencia_id: meta.id,
      titulo: `Aceitar participação — ${nome}`,
      descricao: `Aceite participar da campanha "${nome}" em até 5 dias. Sem aceite, o acompanhamento fica travado.`,
      responsavel_id: responsavel, urgente: 0, sla_horas: 120, criado_por: criadoPor,
    });
  }
}

router.post('/', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { empresa_id } = req.usuario;
  const { loja_id, nome, responsavel_id, grupos } = req.body;
  const modo = req.body.modo === 'grupo' ? 'grupo' : 'geral';
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  let valor_meta = req.body.valor_meta, valor_super_meta = req.body.valor_super_meta;
  if (modo === 'grupo') {
    const tot = (grupos || []).reduce((a, g) => ({ m: a.m + (Number(g.valor_meta) || 0), s: a.s + (Number(g.valor_super) || 0) }), { m: 0, s: 0 });
    valor_meta = tot.m; valor_super_meta = tot.s;
  }
  if (!loja_id || !valor_meta) return res.status(400).json({ erro: 'Loja e valor da meta obrigatórios.' });
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'A campanha precisa de um nome (ex.: "Campanha Junho – Premiado").' });

  const superMeta = valor_super_meta || Math.round(valor_meta * 1.05);
  const id = uuidv4();
  const autoAprova = req.usuario.funcao_nome === 'Diretor Geral';
  const status = autoAprova ? 'aprovado' : 'pendente';
  // responsável padrão: gerente da loja
  const ger = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id='func-gerente' AND ativo=1 LIMIT 1`).get(empresa_id, loja_id);
  const resp = responsavel_id || ger?.id || null;

  db.prepare(`
    INSERT INTO metas (id,empresa_id,loja_id,colaborador_id,mes,ano,valor_meta,valor_super_meta,peso,status_aprovacao,nome_campanha,responsavel_id,status_aceite,reanalisado,modo,criado_em)
    VALUES (?,?,?,NULL,?,?,?,?,1.0,?,?,?, 'pendente',0,?,datetime('now'))
  `).run(id, empresa_id, loja_id, mes, ano, valor_meta, superMeta, status, nome.trim(), resp, modo);
  if (modo === 'grupo') salvarGruposMeta(empresa_id, id, grupos);

  const metaRow = db.prepare('SELECT * FROM metas WHERE id = ?').get(id);
  let aprovacao_pendente = false;
  if (autoAprova) {
    liberar(empresa_id, metaRow, req.usuario.id); // Diretor já libera
  } else {
    const diretor = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND funcao_id = 'func-diretor' AND ativo = 1 LIMIT 1`).get(empresa_id);
    const loja = db.prepare('SELECT nome FROM lojas WHERE id = ?').get(loja_id);
    if (diretor) {
      gerarTarefa({
        empresa_id, loja_id, tipo: 'tarefa', origem: 'aprovacao_meta',
        titulo: `Aprovar campanha — ${nome.trim()} (${mes}/${ano})`,
        descricao: `${loja?.nome || ''} · Meta R$ ${Number(valor_meta).toLocaleString('pt-BR')} · Super R$ ${Number(superMeta).toLocaleString('pt-BR')}. Aprove ou peça reanálise em até 24h.`,
        responsavel_id: diretor.id, urgente: 1, sla_horas: 24, criado_por: req.usuario.id,
      });
      aprovacao_pendente = true;
    }
  }
  res.status(201).json({ mensagem: autoAprova ? 'Campanha criada, aprovada e liberada.' : 'Campanha enviada para aprovação do Diretor.', id, aprovacao_pendente });
});

// POST /metas/lote — lança a MESMA campanha para várias lojas de uma vez
// body: { nome, mes, ano, lojas: [{ loja_id, valor_meta, valor_super_meta }] }
router.post('/lote', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { empresa_id } = req.usuario;
  const { nome, lojas } = req.body;
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'A campanha precisa de um nome (igual para todas as lojas).' });
  if (!Array.isArray(lojas) || !lojas.length) return res.status(400).json({ erro: 'Informe ao menos uma loja com meta.' });
  const autoAprova = req.usuario.funcao_nome === 'Diretor Geral';
  const status = autoAprova ? 'aprovado' : 'pendente';
  const diretor = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-diretor' AND ativo=1 LIMIT 1`).get(empresa_id);
  let criadas = 0;
  const tx = db.transaction(() => {
    for (const l of lojas) {
      const valor_meta = Number(l.valor_meta) || 0;
      if (!l.loja_id || valor_meta <= 0) continue; // pula lojas sem meta preenchida
      const superMeta = Number(l.valor_super_meta) || Math.round(valor_meta * 1.05);
      const ger = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id='func-gerente' AND ativo=1 LIMIT 1`).get(empresa_id, l.loja_id);
      const id = uuidv4();
      db.prepare(`INSERT INTO metas (id,empresa_id,loja_id,colaborador_id,mes,ano,valor_meta,valor_super_meta,peso,status_aprovacao,nome_campanha,responsavel_id,status_aceite,reanalisado,modo,criado_em)
        VALUES (?,?,?,NULL,?,?,?,?,1.0,?,?,?, 'pendente',0,'geral',datetime('now'))`)
        .run(id, empresa_id, l.loja_id, mes, ano, valor_meta, superMeta, status, nome.trim(), ger?.id || null);
      const metaRow = db.prepare('SELECT * FROM metas WHERE id=?').get(id);
      if (autoAprova) {
        liberar(empresa_id, metaRow, req.usuario.id);
      } else if (diretor) {
        const loja = db.prepare('SELECT nome FROM lojas WHERE id=?').get(l.loja_id);
        gerarTarefa({ empresa_id, loja_id: l.loja_id, tipo: 'tarefa', origem: 'aprovacao_meta',
          titulo: `Aprovar campanha — ${nome.trim()} (${mes}/${ano})`,
          descricao: `${loja?.nome || ''} · Meta R$ ${valor_meta.toLocaleString('pt-BR')} · Super R$ ${superMeta.toLocaleString('pt-BR')}. Aprove ou peça reanálise.`,
          responsavel_id: diretor.id, urgente: 0, sla_horas: 24, criado_por: req.usuario.id });
      }
      criadas++;
    }
  });
  tx();
  if (!criadas) return res.status(400).json({ erro: 'Nenhuma loja com meta válida foi informada.' });
  res.status(201).json({ mensagem: autoAprova ? `${criadas} meta(s) criadas e liberadas.` : `${criadas} meta(s) enviadas para aprovação do Diretor.`, criadas });
});

// POST /metas/:id/aprovar — Diretor aprova ou solicita correção
// body: { decisao: 'aprovado'|'correcao', comentario }
router.post('/:id/aprovar', exigePerfil('Diretor Geral', 'Gestor Geral'), (req, res) => {
  const { decisao, comentario } = req.body;
  if (!['aprovado', 'correcao'].includes(decisao)) return res.status(400).json({ erro: 'Decisão inválida.' });

  const meta = db.prepare('SELECT * FROM metas WHERE id = ? AND empresa_id = ?').get(req.params.id, req.usuario.empresa_id);
  if (!meta) return res.status(404).json({ erro: 'Meta não encontrada.' });

  db.prepare('UPDATE metas SET status_aprovacao = ?, comentario_diretor = ? WHERE id = ?')
    .run(decisao, comentario || '', req.params.id);

  if (decisao === 'aprovado') {
    liberar(req.usuario.empresa_id, meta, req.usuario.id); // ciência ao gerente + aceite ao responsável
  } else {
    // Reanálise na criação da campanha = apenas devolução para ajuste (sem impacto de pontuação;
    // a regra de "metade após reanálise" vale só para os fluxos administrativos).
    const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND loja_id = ? AND funcao_id = 'func-gerente' AND ativo = 1 LIMIT 1`)
      .get(req.usuario.empresa_id, meta.loja_id);
    if (gerente) {
      gerarTarefa({
        empresa_id: req.usuario.empresa_id, loja_id: meta.loja_id, tipo: 'tarefa', origem: 'aprovacao_meta',
        titulo: `Reanalisar campanha (${meta.mes}/${meta.ano})`,
        descricao: `O Diretor pediu reanálise: ${comentario || 'sem comentário'}. Ajuste e reenvie.`,
        responsavel_id: gerente.id, urgente: 1, sla_horas: 24, criado_por: req.usuario.id,
      });
    }
  }
  res.json({ mensagem: `Campanha ${decisao === 'aprovado' ? 'aprovada e liberada' : 'devolvida para reanálise'}.` });
});

// POST /metas/:id/aceitar — responsável aceita participar (registra IP + selfie p/ prova legal)
router.post('/:id/aceitar', (req, res) => {
  const meta = db.prepare('SELECT * FROM metas WHERE id = ? AND empresa_id = ?').get(req.params.id, req.usuario.empresa_id);
  if (!meta) return res.status(404).json({ erro: 'Campanha não encontrada.' });
  if (!(meta.status_aprovacao === 'aprovado' || meta.status_aprovacao === 'auto')) return res.status(400).json({ erro: 'A campanha ainda não foi aprovada.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || '';
  const { selfie, user_agent } = req.body;
  const aceiteId = uuidv4();
  db.prepare(`INSERT INTO aceites_campanha (id,empresa_id,meta_id,colaborador_id,colaborador_nome,campanha_nome,ip,user_agent,selfie,aceito_em)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(aceiteId, req.usuario.empresa_id, meta.id, req.usuario.id, req.usuario.nome || '', meta.nome_campanha || '', ip, user_agent || req.headers['user-agent'] || '', selfie || null);
  db.prepare(`UPDATE metas SET status_aceite = 'aceito' WHERE id = ?`).run(req.params.id);
  // conclui a tarefa de aceite ligada (o Kanban é o hub: o card some de "aberto")
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now') WHERE empresa_id=? AND origem='premiacao_aceite' AND referencia_id=? AND status!='concluido'`)
    .run(req.usuario.empresa_id, meta.id);

  res.json({ mensagem: 'Participação aceita. Acompanhamento liberado.', aceite_id: aceiteId, ip, colaborador: req.usuario.nome, campanha: meta.nome_campanha, aceito_em: new Date().toISOString() });
});

// GET /metas/aceites?colaborador_id= — termos de aceite de campanha de um colaborador (para o cadastro)
router.get('/aceites', exigePerfil('RH', 'Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const colaboradorId = req.query.colaborador_id;
  if (!colaboradorId) return res.status(400).json({ erro: 'Informe o colaborador.' });
  const rows = db.prepare(`SELECT ac.id, ac.campanha_nome, ac.colaborador_nome, ac.ip, ac.selfie, ac.aceito_em, m.mes, m.ano, l.nome as loja_nome
    FROM aceites_campanha ac LEFT JOIN metas m ON m.id=ac.meta_id LEFT JOIN lojas l ON l.id=m.loja_id
    WHERE ac.empresa_id=? AND ac.colaborador_id=? ORDER BY m.ano DESC, m.mes DESC, ac.aceito_em DESC`).all(req.usuario.empresa_id, colaboradorId);
  res.json({ aceites: rows });
});

// GET /metas/:id/aceite — dados do termo de aceite (para gerar o PDF/termo)
router.get('/:id/aceite', (req, res) => {
  const ac = db.prepare(`SELECT * FROM aceites_campanha WHERE meta_id = ? AND empresa_id = ? ORDER BY aceito_em DESC LIMIT 1`).get(req.params.id, req.usuario.empresa_id);
  if (!ac) return res.status(404).json({ erro: 'Aceite não encontrado.' });
  res.json({ aceite: ac });
});

// POST /metas/:id/replicar — replica a campanha para outro mês/ano (entra como nova, pendente)
router.post('/:id/replicar', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const base = db.prepare('SELECT * FROM metas WHERE id = ? AND empresa_id = ?').get(req.params.id, req.usuario.empresa_id);
  if (!base) return res.status(404).json({ erro: 'Campanha base não encontrada.' });
  const mes = parseInt(req.body.mes), ano = parseInt(req.body.ano);
  if (!mes || !ano) return res.status(400).json({ erro: 'Informe mês e ano de destino.' });

  const autoAprova = req.usuario.funcao_nome === 'Diretor Geral';
  const id = uuidv4();
  db.prepare(`INSERT INTO metas (id,empresa_id,loja_id,colaborador_id,mes,ano,valor_meta,valor_super_meta,peso,status_aprovacao,nome_campanha,responsavel_id,status_aceite,reanalisado,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pendente',0,datetime('now'))`)
    .run(id, req.usuario.empresa_id, base.loja_id, base.colaborador_id, mes, ano, base.valor_meta, base.valor_super_meta, base.peso,
      autoAprova ? 'aprovado' : 'pendente', `${base.nome_campanha || 'Campanha'} (réplica)`, base.responsavel_id);
  if (autoAprova) liberar(req.usuario.empresa_id, db.prepare('SELECT * FROM metas WHERE id=?').get(id), req.usuario.id);
  res.status(201).json({ mensagem: 'Campanha replicada.', id });
});

// POST /metas/pesos — define o peso de cada vendedor na divisão da meta da loja
// body: { loja_id, mes, ano, pesos: [{ colaborador_id, peso }] }
router.post('/pesos', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { empresa_id } = req.usuario;
  const { loja_id, pesos = [] } = req.body;
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  if (!loja_id || !pesos.length) return res.status(400).json({ erro: 'Loja e pesos obrigatórios.' });

  const upsert = db.prepare(`
    INSERT INTO metas (id,empresa_id,loja_id,colaborador_id,mes,ano,valor_meta,valor_super_meta,peso,status_aprovacao,criado_em)
    VALUES (?,?,?,?,?,?,0,0,?,'auto',datetime('now'))
    ON CONFLICT DO NOTHING
  `);
  // SQLite sem unique nesse par — atualiza manualmente
  const upd = db.prepare(`UPDATE metas SET peso = ? WHERE empresa_id = ? AND loja_id = ? AND colaborador_id = ? AND mes = ? AND ano = ?`);
  for (const p of pesos) {
    const r = upd.run(p.peso, empresa_id, loja_id, p.colaborador_id, mes, ano);
    if (r.changes === 0) {
      upsert.run(uuidv4(), empresa_id, loja_id, p.colaborador_id, mes, ano, p.peso);
    }
  }
  res.json({ mensagem: 'Pesos atualizados.' });
});

// POST /metas/colaborador — define a meta individual (valor + super), vinculada à campanha da loja
router.post('/colaborador', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { empresa_id } = req.usuario;
  const { colaborador_id, campanha_id, grupos } = req.body;
  const modo = req.body.modo === 'grupo' ? 'grupo' : 'geral';
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  // No modo grupo, a meta total vem da soma dos grupos
  let valor_meta = req.body.valor_meta, valor_super_meta = req.body.valor_super_meta;
  if (modo === 'grupo') {
    const tot = (grupos || []).reduce((a, g) => ({ m: a.m + (Number(g.valor_meta) || 0), s: a.s + (Number(g.valor_super) || 0) }), { m: 0, s: 0 });
    valor_meta = tot.m; valor_super_meta = tot.s;
    if (!valor_meta) return res.status(400).json({ erro: 'Informe a meta de pelo menos um grupo.' });
  }
  if (!colaborador_id || !valor_meta) return res.status(400).json({ erro: 'Colaborador e valor da meta obrigatórios.' });
  const colab = db.prepare('SELECT loja_id, nome, situacao FROM colaboradores WHERE id = ? AND empresa_id = ?').get(colaborador_id, empresa_id);
  if (!colab) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  if (colab.situacao === 'afastado' || colab.situacao === 'ferias') {
    return res.status(400).json({ erro: `${colab.nome} está ${colab.situacao === 'ferias' ? 'de férias' : 'afastado(a)'} e não pode receber meta.` });
  }

  // vincula à campanha da loja (a informada ou a campanha aprovada do mesmo período)
  let campId = campanha_id || null;
  if (!campId) {
    const camp = db.prepare(`SELECT id, nome_campanha FROM metas WHERE empresa_id=? AND loja_id=? AND colaborador_id IS NULL AND mes=? AND ano=? AND status_aprovacao IN ('aprovado','auto') ORDER BY criado_em DESC LIMIT 1`).get(empresa_id, colab.loja_id, mes, ano);
    campId = camp?.id || null;
  }
  const campNome = campId ? (db.prepare('SELECT nome_campanha FROM metas WHERE id=?').get(campId)?.nome_campanha || 'Campanha') : 'Meta individual';
  const superMeta = valor_super_meta || Math.round(valor_meta * 1.05);
  const existente = db.prepare('SELECT id, status_aceite FROM metas WHERE empresa_id = ? AND colaborador_id = ? AND mes = ? AND ano = ?').get(empresa_id, colaborador_id, mes, ano);

  if (existente) {
    db.prepare('UPDATE metas SET valor_meta = ?, valor_super_meta = ?, campanha_id = ?, modo = ? WHERE id = ?').run(valor_meta, superMeta, campId, modo, existente.id);
    if (modo === 'grupo') salvarGruposMeta(empresa_id, existente.id, grupos); else db.prepare('DELETE FROM meta_grupos WHERE meta_id = ?').run(existente.id);
    // garante o aceite (qualquer função): se ainda não aceitou e não há tarefa aberta, recria
    if (existente.status_aceite !== 'aceito') {
      const temTarefa = db.prepare(`SELECT id FROM tarefas WHERE empresa_id=? AND origem='premiacao_aceite' AND referencia_id=? AND status!='concluido'`).get(empresa_id, existente.id);
      if (!temTarefa) {
        gerarTarefa({
          empresa_id, loja_id: colab.loja_id, tipo: 'tarefa', origem: 'premiacao_aceite', referencia_id: existente.id,
          titulo: `Aceitar sua meta — ${campNome}`,
          descricao: `Sua meta de ${mes}/${ano} foi lançada. Abra esta tarefa para aceitar (registra IP + selfie + termo).`,
          responsavel_id: colaborador_id, urgente: 0, sla_horas: 120, criado_por: req.usuario.id,
        });
      }
    }
    return res.json({ mensagem: `Meta de ${colab.nome} atualizada.`, aceite_pendente: existente.status_aceite !== 'aceito' });
  }

  const metaId = uuidv4();
  db.prepare(`INSERT INTO metas (id,empresa_id,loja_id,colaborador_id,mes,ano,valor_meta,valor_super_meta,peso,status_aprovacao,status_aceite,campanha_id,modo,criado_em)
    VALUES (?,?,?,?,?,?,?,?,1.0,'aprovado','pendente',?,?,datetime('now'))`)
    .run(metaId, empresa_id, colab.loja_id, colaborador_id, mes, ano, valor_meta, superMeta, campId, modo);
  if (modo === 'grupo') salvarGruposMeta(empresa_id, metaId, grupos);
  // tarefa de aceite para o PRÓPRIO colaborador (mesma comprovação: IP + selfie + termo)
  gerarTarefa({
    empresa_id, loja_id: colab.loja_id, tipo: 'tarefa', origem: 'premiacao_aceite', referencia_id: metaId,
    titulo: `Aceitar sua meta — ${campNome}`,
    descricao: `Sua meta de ${mes}/${ano} foi lançada. Abra esta tarefa para aceitar (registra IP + selfie + termo).`,
    responsavel_id: colaborador_id, urgente: 0, sla_horas: 120, criado_por: req.usuario.id,
  });
  res.status(201).json({ mensagem: `Meta de ${colab.nome} definida. Aguardando aceite do colaborador.` });
});

// GET /metas/minhas — metas do próprio colaborador logado (para aceite e acompanhamento)
// PRIVACIDADE: para o colaborador só devolvemos % (meta/super) e o quanto ele precisa
// vender HOJE — NUNCA o valor acumulado que ele já vendeu (ele poderia expor a terceiros).
router.get('/minhas', async (req, res) => {
  const eid = req.usuario.empresa_id, uid = req.usuario.id;
  const linhas = db.prepare(`SELECT m.*, l.nome as loja_nome, camp.nome_campanha as campanha_nome
    FROM metas m LEFT JOIN lojas l ON l.id=m.loja_id
    LEFT JOIN metas camp ON camp.id=m.campanha_id
    WHERE m.empresa_id=? AND m.colaborador_id=? ORDER BY m.ano DESC, m.mes DESC`).all(eid, uid);

  const metas = [];
  for (const m of linhas) {
    // Só expõe dados sensíveis (valor da meta) e progresso depois do ACEITE.
    const base = {
      id: m.id, mes: m.mes, ano: m.ano, loja_nome: m.loja_nome,
      campanha_nome: m.campanha_nome, campanha_id: m.campanha_id,
      status_aceite: m.status_aceite, modo: m.modo,
    };
    // O valor da meta só vai no payload ANTES do aceite (para o modal). Depois de aceita,
    // NÃO enviamos valor_meta — assim o colaborador não consegue deduzir o vendido a partir do %.
    if (m.status_aceite !== 'aceito') {
      base.valor_meta = m.valor_meta;
      base.valor_super_meta = m.valor_super_meta;
    }
    if (m.status_aceite === 'aceito' && m.valor_meta > 0) {
      await vendasErp.prewarmLoja(m.loja_id, m.mes, m.ano);
      const vendido = vendasErp.totalVendedorMesSync(m.colaborador_id, m.mes, m.ano);
      const superMeta = m.valor_super_meta || Math.round(m.valor_meta * 1.05);
      const feriados = db.prepare(`SELECT data FROM dias_nao_uteis WHERE empresa_id=? AND loja_id=?
        AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?`)
        .all(eid, m.loja_id, m.mes, m.ano).map(r => r.data);
      // NÃO devolvemos `vendido`. Só % e o ritmo (quanto vender hoje).
      base.progresso = {
        pct_meta: calc.pct(vendido, m.valor_meta),
        pct_super: calc.pct(vendido, superMeta),
        bateu_meta: vendido >= m.valor_meta,
        bateu_super: vendido >= superMeta,
        precisa_hoje_meta: calc.ritmoPonderado(m.valor_meta, vendido, m.mes, m.ano, feriados),
        precisa_hoje_super: calc.ritmoPonderado(superMeta, vendido, m.mes, m.ano, feriados),
        dia_atual: calc.diaCorrente(m.mes, m.ano),
        dias_mes: calc.diasNoMes(m.mes, m.ano),
      };
    }
    metas.push(base);
  }
  res.json({ metas });
});

// PATCH /metas/:id/atingida — marca se o colaborador bateu a meta (regra dos 90%)
router.patch('/:id/atingida', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const r = db.prepare('UPDATE metas SET atingida = ? WHERE id = ? AND empresa_id = ?').run(req.body.atingida ? 1 : 0, req.params.id, req.usuario.empresa_id);
  if (!r.changes) return res.status(404).json({ erro: 'Meta não encontrada.' });
  res.json({ mensagem: 'Atualizado.' });
});

// GET /metas/analise-vendas?loja_id=&mes=&ano=[&de=&ate=]
// Histórico mensal de vendas (ao vivo do ERP) + sugestões de meta para o período alvo.
router.get('/analise-vendas', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id;
  if (!lojaId) return res.status(400).json({ erro: 'Informe a loja.' });

  const serie = await vendasErp.serieMensalLoja(lojaId, mes, ano, 13); // meses fechados anteriores
  const arred = v => Math.max(0, Math.round(v / 1000) * 1000); // arredonda p/ milhar
  const media = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const totais = serie.map(s => s.total);
  const ult3 = totais.slice(-3), ult6 = totais.slice(-6);
  const media3 = media(ult3), media6 = media(ult6);
  const mesPassado = totais.length ? totais[totais.length - 1] : 0;
  const mesmoMesAnoPassado = (serie.find(s => s.mes === mes && s.ano === ano - 1) || {}).total || 0;

  // Crescimento médio mês-a-mês (últimas ~3 transições), limitado a ±25%.
  const trans = [];
  for (let i = Math.max(1, totais.length - 3); i < totais.length; i++) {
    if (totais[i - 1] > 0) trans.push(totais[i] / totais[i - 1] - 1);
  }
  let g = trans.length ? media(trans) : 0;
  g = Math.max(-0.25, Math.min(0.25, g));

  // Crescimento anual (mesmos 3 meses vs. um ano antes), se houver base.
  let gAnual = g;
  const somaUlt3 = ult3.reduce((a, b) => a + b, 0);
  const anoAntes3 = serie.filter(s => {
    const alvo = new Set(serie.slice(-3).map(x => `${x.mes}`));
    return alvo.has(`${s.mes}`) && s.ano === serie.slice(-3)[0]?.ano - 1;
  }).map(s => s.total);
  if (anoAntes3.length && anoAntes3.reduce((a, b) => a + b, 0) > 0) {
    gAnual = Math.max(-0.25, Math.min(0.5, somaUlt3 / anoAntes3.reduce((a, b) => a + b, 0) - 1));
  }

  // Super meta = ESFORÇO REAL acima da meta (10% acima, arredondado p/ cima ao milhar);
  // nunca menor que o melhor mês do histórico (para ser um alvo ambicioso, porém real).
  const melhorMes = totais.length ? Math.max(...totais) : 0;
  const superDe = v => Math.max(Math.ceil((v * 1.10) / 1000) * 1000, Math.ceil(melhorMes / 1000) * 1000);

  const sugestoes = [];
  const addSug = (chave, label, valor) => { if (valor) sugestoes.push({ chave, label, valor: arred(valor), super: superDe(arred(valor)) }); };
  addSug('media3', 'Média dos últimos 3 meses', media3);
  addSug('tendencia', `Mês anterior + tendência (${(g * 100).toFixed(1)}%)`, mesPassado && mesPassado * (1 + g));
  addSug('anopassado', mesmoMesAnoPassado && `Mesmo mês do ano passado + ${(gAnual * 100).toFixed(1)}%`, mesmoMesAnoPassado && mesmoMesAnoPassado * (1 + gAnual));
  addSug('media6', 'Média dos últimos 6 meses', media6);

  // Recomendada: mescla média3 com a projeção do mês anterior (robusto contra mês atípico).
  let recomendadaVal = 0;
  if (media3 && mesPassado) recomendadaVal = arred(media3 * 0.5 + mesPassado * (1 + g) * 0.5);
  else recomendadaVal = arred(media3 || mesPassado || mesmoMesAnoPassado);
  const recomendada = recomendadaVal ? { valor: recomendadaVal, super: superDe(recomendadaVal) } : null;

  // Sugestão POR GRUPO (média dos últimos 3 meses por grupo de produto).
  const mg = await vendasErp.mediaGruposLoja(lojaId, mes, ano, 3);
  const arredG = v => Math.max(0, Math.round(v / 100) * 100);
  const superG = v => Math.max(0, Math.ceil((v * 1.10) / 100) * 100);
  const porGrupo = GRUPOS_VENDA.map(g => ({ grupo: g.key, label: g.label, media: arredG(mg[g.key] || 0), sugestao: arredG(mg[g.key] || 0), super: superG(mg[g.key] || 0) }))
    .filter(x => x.media > 0);

  // Andamento do mês alvo (parcial, se for o mês corrente).
  let mesAlvoParcial = null;
  try { mesAlvoParcial = await vendasErp.totalLojaMes(lojaId, mes, ano); } catch { /* ignora */ }

  // Período customizado, se pedido.
  let periodo = null;
  if (req.query.de && req.query.ate) {
    periodo = await vendasErp.totalLojaIntervalo(lojaId, req.query.de, req.query.ate);
    periodo.de = req.query.de; periodo.ate = req.query.ate;
  }

  res.json({
    loja_id: lojaId, mes, ano,
    serie, media3: arred(media3), media6: arred(media6),
    mes_passado: mesPassado, mesmo_mes_ano_passado: mesmoMesAnoPassado,
    crescimento_mensal: Math.round(g * 1000) / 10, crescimento_anual: Math.round(gAnual * 1000) / 10,
    sugestoes, recomendada, por_grupo: porGrupo, mes_alvo_parcial: mesAlvoParcial, periodo,
  });
});

// GET /metas/analise-vendedores?loja_id=&mes=&ano=
// Para CADA vendedor da loja: histórico e meta individual sugerida (base no próprio histórico).
router.get('/analise-vendedores', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id;
  if (!lojaId) return res.status(400).json({ erro: 'Informe a loja.' });

  const series = await vendasErp.serieMensalVendedoresLoja(lojaId, mes, ano, 6);
  const arred = v => Math.max(0, Math.round(v / 100) * 100); // arredonda p/ centena (meta individual menor)
  const media = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const nomes = new Map(db.prepare('SELECT id, nome FROM colaboradores WHERE loja_id=?').all(lojaId).map(c => [c.id, c.nome]));
  const vendedores = Object.entries(series).map(([colabId, serie]) => {
    const totais = serie.map(s => s.total);
    const ult3 = totais.slice(-3);
    const media3 = media(ult3);
    const mesPassado = totais.length ? totais[totais.length - 1] : 0;
    const trans = [];
    for (let i = Math.max(1, totais.length - 3); i < totais.length; i++) if (totais[i - 1] > 0) trans.push(totais[i] / totais[i - 1] - 1);
    let g = trans.length ? media(trans) : 0; g = Math.max(-0.25, Math.min(0.25, g));
    const base = media3 || mesPassado;
    const sugestao = base ? arred(base * (1 + Math.max(0, g))) : 0;
    return { colaborador_id: colabId, nome: nomes.get(colabId) || colabId, serie, media3: arred(media3), mes_passado: mesPassado, crescimento: Math.round(g * 1000) / 10, sugestao };
  }).filter(v => v.serie.length > 0)
    .sort((a, b) => b.media3 - a.media3);

  res.json({ loja_id: lojaId, mes, ano, vendedores });
});

// GET /metas/equipe?loja_id=&mes=&ano= — metas dos vendedores + status dos 90%
router.get('/equipe', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const eid = req.usuario.empresa_id;
  await vendasErp.prewarmLoja(lojaId, mes, ano); // vendido por vendedor, ao vivo do ERP
  // equipe = SÓ os colaboradores COM meta no período (os que foram INCLUÍDOS). O restante da loja fica no
  // "roster" (dropdown "+ incluir colaborador") — assim a tela não vem poluída com todos os cadastrados.
  const comMetaRows = db.prepare(`SELECT m.colaborador_id, c.nome, f.nome as funcao FROM metas m JOIN colaboradores c ON c.id=m.colaborador_id JOIN funcoes f ON f.id=c.funcao_id
    WHERE m.empresa_id=? AND m.loja_id=? AND m.colaborador_id IS NOT NULL AND m.mes=? AND m.ano=?`).all(eid, lojaId, mes, ano);
  const mapaPessoas = new Map();
  comMetaRows.forEach(p => { if (!mapaPessoas.has(p.colaborador_id)) mapaPessoas.set(p.colaborador_id, { id: p.colaborador_id, nome: p.nome, funcao: p.funcao }); });
  const equipe = [...mapaPessoas.values()].map(p => {
    const m = db.prepare('SELECT * FROM metas WHERE empresa_id = ? AND colaborador_id = ? AND mes = ? AND ano = ?').get(eid, p.id, mes, ano);
    const vendido = vendasErp.totalVendedorMesSync(p.id, mes, ano);
    const atingida = m && m.valor_meta > 0 && vendido >= m.valor_meta ? 1 : 0;
    return { colaborador_id: p.id, nome: p.nome, funcao: p.funcao, meta_id: m?.id || null, valor_meta: m?.valor_meta ?? null, valor_super_meta: m?.valor_super_meta ?? null, modo: m?.modo || 'geral', grupos: m ? gruposDaMeta(m.id) : [], vendido, atingida, status_aceite: m?.status_aceite || null, tem_meta: !!m };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
  // meta/super da loja (nível loja, colaborador_id IS NULL)
  const lojaMetaRow = db.prepare(`SELECT id, valor_meta, valor_super_meta, modo FROM metas WHERE empresa_id=? AND loja_id=? AND colaborador_id IS NULL AND mes=? AND ano=? AND status_aprovacao IN ('aprovado','auto') ORDER BY criado_em DESC LIMIT 1`).get(eid, lojaId, mes, ano);
  // roster completo (para incluir/reincluir) — o front filtra quem já está na lista
  const roster = db.prepare(`SELECT c.id, c.nome, f.nome as funcao, l.nome as loja_nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.id!='func-gerente' ORDER BY c.nome`).all(eid);
  const comMeta = equipe.filter(e => e.tem_meta);
  const atingiram = comMeta.filter(e => e.atingida).length;
  const pct = comMeta.length ? Math.round((atingiram / comMeta.length) * 100) : 0;
  res.json({ mes, ano, loja_id: lojaId, equipe, roster, grupos_disponiveis: GRUPOS_VENDA,
    loja_meta: lojaMetaRow?.valor_meta ?? null, loja_super: lojaMetaRow?.valor_super_meta ?? null,
    loja_modo: lojaMetaRow?.modo || 'geral', loja_grupos: lojaMetaRow ? gruposDaMeta(lojaMetaRow.id) : [],
    total_com_meta: comMeta.length, atingiram, pct, positiva_gerente: pct >= 90 });
});

// DELETE /metas/colaborador/:colaborador_id?mes=&ano= — remove a meta de uma pessoa
router.delete('/colaborador/:colaborador_id', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const m = db.prepare('SELECT id FROM metas WHERE empresa_id=? AND colaborador_id=? AND mes=? AND ano=?').get(req.usuario.empresa_id, req.params.colaborador_id, mes, ano);
  if (m) {
    db.prepare(`DELETE FROM tarefas WHERE empresa_id=? AND origem='premiacao_aceite' AND referencia_id=?`).run(req.usuario.empresa_id, m.id);
    db.prepare('DELETE FROM metas WHERE id=?').run(m.id);
  }
  res.json({ mensagem: 'Removido.' });
});

// POST /metas/replicar-equipe — copia as metas de colaborador de um período para outro
router.post('/replicar-equipe', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const deMes = parseInt(req.body.de_mes), deAno = parseInt(req.body.de_ano);
  const mes = parseInt(req.body.mes), ano = parseInt(req.body.ano);
  if (!deMes || !deAno || !mes || !ano) return res.status(400).json({ erro: 'Informe os períodos de origem e destino.' });
  const origem = db.prepare(`SELECT colaborador_id, valor_meta, valor_super_meta FROM metas WHERE empresa_id=? AND loja_id=? AND colaborador_id IS NOT NULL AND mes=? AND ano=?`).all(req.usuario.empresa_id, lojaId, deMes, deAno);
  let n = 0;
  for (const m of origem) {
    const existe = db.prepare('SELECT id FROM metas WHERE empresa_id=? AND colaborador_id=? AND mes=? AND ano=?').get(req.usuario.empresa_id, m.colaborador_id, mes, ano);
    if (existe) db.prepare('UPDATE metas SET valor_meta=?, valor_super_meta=? WHERE id=?').run(m.valor_meta, m.valor_super_meta, existe.id);
    else db.prepare(`INSERT INTO metas (id,empresa_id,loja_id,colaborador_id,mes,ano,valor_meta,valor_super_meta,peso,status_aprovacao,status_aceite,criado_em) VALUES (?,?,?,?,?,?,?,?,1.0,'aprovado','pendente',datetime('now'))`)
      .run(uuidv4(), req.usuario.empresa_id, lojaId, m.colaborador_id, mes, ano, m.valor_meta, m.valor_super_meta);
    n++;
  }
  res.json({ mensagem: `${n} meta(s) replicada(s).`, replicadas: n });
});

// GET /metas/:id — uma meta (para abrir o aceite a partir do card do Kanban)
router.get('/:id', (req, res) => {
  const m = db.prepare(`SELECT m.*, l.nome as loja_nome, camp.nome_campanha as campanha_nome
    FROM metas m LEFT JOIN lojas l ON l.id=m.loja_id LEFT JOIN metas camp ON camp.id=m.campanha_id
    WHERE m.id=? AND m.empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!m) return res.status(404).json({ erro: 'Meta não encontrada.' });
  res.json({ meta: m });
});

module.exports = router;
