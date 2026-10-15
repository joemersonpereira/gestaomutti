// pontos.js — Loja de pontos. O colaborador acumula pontos pela gamificação do Mural
// (mesmos pesos do engajamento) e troca por brindes marcados como "resgatáveis" no
// Meu Mercado. Cada resgate baixa o estoque do brinde e desconta os pontos do saldo.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

const ADMIN = ['Suporte', 'Gestor Geral', 'Diretor Geral', 'Controladoria', 'RH'];
const ehAdmin = u => ADMIN.includes(u.funcao_nome);
const compAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// Rótulos e presets de lançamento manual, do Regulamento #EuSouGrupoMutti.
const TIPOS = {
  niver_pessoal: 'Aniversário pessoal', niver_empresa: 'Tempo de casa', treinamento: 'Treinamento/curso',
  post_interno: 'Post no mural', post_social: 'Post social #EuSouGrupoMutti', repost: 'Repost oficial',
  super_meta: 'Super meta (+10%)', produtividade: 'Produtividade (indicador)', caixa: 'Operador de caixa',
  cmv: 'CMV abaixo do limite', satisfacao: 'Avaliação coletada', performance: 'Performance Mutti', manual: 'Ajuste manual',
};
const PRESETS = [
  { tipo: 'post_social', label: 'Post social autoral (#EuSouGrupoMutti)', pontos: 15 },
  { tipo: 'repost', label: 'Repost de perfil oficial', pontos: 5 },
  { tipo: 'treinamento', label: 'Treinamento obrigatório', pontos: 10 },
  { tipo: 'treinamento', label: 'Treinamento facultativo / workshop / palestra', pontos: 20 },
  { tipo: 'super_meta', label: 'Vendeu +10% acima da super meta', pontos: 200 },
  { tipo: 'produtividade', label: 'Indicador alcançado (gerência)', pontos: 10 },
  { tipo: 'caixa', label: 'Operador zerou o caixa', pontos: 100 },
  { tipo: 'caixa', label: 'Diferença de caixa < R$10 no mês', pontos: 50 },
  { tipo: 'performance', label: 'Performance Mutti (avaliação/chamado/pontualidade)', pontos: 50 },
  { tipo: 'manual', label: 'Ajuste manual', pontos: 0 },
];

// Valores padrão dos pontos automáticos (Regulamento). A G&G ajusta em pontos_config.
const CONFIG_DEFAULT = {
  super_meta_pontos: 200,       // vendeu +10% acima da super meta (esforço grande)
  produtividade_pontos: 10,     // por indicador atingido no mês (gerência)
  caixa_zerado_pontos: 100,     // operador zerou o caixa
  caixa_diferenca_pontos: 50,   // diferença de caixa < R$10 no mês
  cmv_pontos: 100,              // CMV do mês abaixo do limite (vendedor e gerente/loja)
  cmv_max: 65,                  // limite de CMV (%) — abaixo disso pontua
  satisfacao_pontos: 5,         // por avaliação de cliente coletada (validada) — incentiva cobrar
  kudos_pontos: 3,              // pontos ao colega reconhecido com um kudos
  post_social_pontos: 15,       // post autoral #EuSouGrupoMutti (via tarefa aprovada)
  repost_pontos: 5,             // repost de perfil oficial
};
function getConfig(empresaId) {
  const cfg = { ...CONFIG_DEFAULT };
  try { db.prepare('SELECT chave, valor FROM pontos_config WHERE empresa_id=?').all(empresaId).forEach(r => { cfg[r.chave] = r.valor; }); } catch { /* tabela nova */ }
  return cfg;
}

// Registra pontos no extrato (idempotente por ref). Defensivo — nunca lança.
function lancarPontos(empresaId, l) {
  try {
    if (l.ref && db.prepare('SELECT 1 FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').get(empresaId, l.ref)) return false;
    db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(uuidv4(), empresaId, l.colaborador_id, l.colaborador_nome || null, l.loja_id || null, l.tipo || 'manual',
        l.descricao || null, Math.round(Number(l.pontos) || 0), l.competencia || compAtual(), l.origem || 'automatico',
        l.ref || null, l.criado_por || null);
    return true;
  } catch (e) { console.error('[pontos] lançamento falhou:', e.message); return false; }
}

function pontosGastos(empresaId, colabId) {
  return db.prepare(`SELECT COALESCE(SUM(pontos),0) c FROM pontos_resgates
    WHERE empresa_id=? AND colaborador_id=? AND status<>'cancelado'`).get(empresaId, colabId).c;
}
function saldoDe(empresaId, colabId) {
  const ganhos = db.prepare(`SELECT COALESCE(SUM(pontos),0) c FROM pontos_lancamentos WHERE empresa_id=? AND colaborador_id=?`).get(empresaId, colabId).c;
  const gastos = pontosGastos(empresaId, colabId);
  return { ganhos, gastos, saldo: ganhos - gastos };
}

router.use(auth);

// Saldo do próprio colaborador.
router.get('/saldo', (req, res) => res.json(saldoDe(req.usuario.empresa_id, req.usuario.id)));

// Extrato do próprio colaborador (ganhos + resgates).
router.get('/extrato', (req, res) => {
  const emp = req.usuario.empresa_id, id = req.usuario.id;
  const ganhos = db.prepare(`SELECT tipo, descricao, pontos, competencia, criado_em FROM pontos_lancamentos
    WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em DESC LIMIT 100`).all(emp, id);
  const resgates = db.prepare(`SELECT produto_nome, pontos, status, criado_em FROM pontos_resgates
    WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em DESC LIMIT 50`).all(emp, id);
  res.json({ ...saldoDe(emp, id), ganhos, resgates, tipos: TIPOS });
});

// Catálogo da loja de pontos (brindes resgatáveis com estoque — inclui variações).
router.get('/loja', (req, res) => {
  const emp = req.usuario.empresa_id;
  const s = saldoDe(emp, req.usuario.id);
  const varStmt = db.prepare(`SELECT id, nome, estoque FROM mercado_variacoes WHERE empresa_id=? AND produto_id=? AND ativo=1 AND estoque>0 ORDER BY criado_em`);
  const itens = db.prepare(`SELECT id, nome, imagem, pontos, estoque, tem_variacoes, categoria FROM mercado_produtos
    WHERE empresa_id=? AND categoria IN ('brinde','fardamento') AND resgatavel=1 AND ativo=1 AND pontos>0
    ORDER BY pontos ASC`).all(emp)
    .map(p => {
      const variacoes = p.tem_variacoes ? varStmt.all(emp, p.id) : [];
      const estoque = p.tem_variacoes ? variacoes.reduce((a, v) => a + (v.estoque || 0), 0) : p.estoque;
      return { ...p, estoque, variacoes, resgatavel: s.saldo >= p.pontos && estoque > 0 };
    })
    .filter(p => p.estoque > 0);
  res.json({ saldo: s.saldo, itens });
});

// Resgatar um brinde (colaborador gasta pontos).
router.post('/resgatar', (req, res) => {
  const emp = req.usuario.empresa_id;
  const prod = db.prepare(`SELECT * FROM mercado_produtos WHERE id=? AND empresa_id=? AND categoria IN ('brinde','fardamento')`).get(req.body.produto_id, emp);
  if (!prod || !prod.resgatavel || prod.ativo !== 1) return res.status(404).json({ erro: 'Item indisponível para resgate.' });
  // Variação (tamanho/cor) quando o brinde tem
  let varRow = null, nomeCompleto = prod.nome;
  if (prod.tem_variacoes) {
    varRow = req.body.variacao_id ? db.prepare(`SELECT id, nome, estoque FROM mercado_variacoes WHERE id=? AND produto_id=? AND empresa_id=?`).get(req.body.variacao_id, prod.id, emp) : null;
    if (!varRow) return res.status(400).json({ erro: 'Escolha a variação (ex.: tamanho).' });
    if ((varRow.estoque || 0) <= 0) return res.status(400).json({ erro: 'Variação sem estoque.' });
    nomeCompleto = `${prod.nome} (${varRow.nome})`;
  } else if ((prod.estoque || 0) <= 0) {
    return res.status(400).json({ erro: 'Brinde sem estoque.' });
  }
  const s = saldoDe(emp, req.usuario.id);
  if (s.saldo < prod.pontos) return res.status(400).json({ erro: `Saldo insuficiente. Faltam ${prod.pontos - s.saldo} pontos.` });
  const id = uuidv4();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO pontos_resgates (id,empresa_id,colaborador_id,colaborador_nome,loja_id,produto_id,variacao_id,produto_nome,pontos,status,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?, 'solicitado', datetime('now'))`)
      .run(id, emp, req.usuario.id, req.usuario.nome, req.usuario.loja_id || null, prod.id, varRow ? varRow.id : null, nomeCompleto, prod.pontos);
    if (varRow) db.prepare(`UPDATE mercado_variacoes SET estoque=estoque-1 WHERE id=?`).run(varRow.id);
    else db.prepare(`UPDATE mercado_produtos SET estoque=estoque-1, atualizado_em=datetime('now') WHERE id=?`).run(prod.id);
    db.prepare(`INSERT INTO mercado_movimentos (id,empresa_id,produto_id,variacao_id,tipo,quantidade,custo_unit,origem,referencia,loja_id,destino,colaborador_id,obs,criado_em)
      VALUES (?,?,?,?, 'saida', 1, ?, 'resgate_pontos', ?, ?, ?, ?, ?, datetime('now'))`)
      .run(uuidv4(), emp, prod.id, varRow ? varRow.id : null, prod.custo || 0, id, req.usuario.loja_id || null, req.usuario.nome, req.usuario.id, `${prod.pontos} pts`);
  });
  tx();
  res.status(201).json({ ok: true, id, saldo: s.saldo - prod.pontos });
});

// Histórico do próprio colaborador.
router.get('/meus-resgates', (req, res) => {
  const rows = db.prepare(`SELECT id, produto_nome, pontos, status, criado_em FROM pontos_resgates
    WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em DESC LIMIT 50`).all(req.usuario.empresa_id, req.usuario.id);
  res.json({ resgates: rows });
});

// ── Config de pontos (G&G) ──────────────────────────────────────────────────────────
router.get('/config', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  res.json({ config: getConfig(req.usuario.empresa_id), padrao: CONFIG_DEFAULT });
});
router.put('/config', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const up = db.prepare(`INSERT INTO pontos_config (empresa_id,chave,valor,atualizado_em,atualizado_por) VALUES (?,?,?,datetime('now'),?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em, atualizado_por=excluded.atualizado_por`);
  const tx = db.transaction(() => {
    Object.entries(req.body || {}).forEach(([k, v]) => { if (k in CONFIG_DEFAULT) up.run(req.usuario.empresa_id, k, Math.round(Number(v) || 0), req.usuario.nome); });
  });
  tx();
  res.json({ ok: true, config: getConfig(req.usuario.empresa_id) });
});

// ── Post social #EuSouGrupoMutti (comprovante → tarefa → aprovação → pontos) ─────────
const POST_APROVA = ['Marketing', 'Gestor Geral', 'Diretor Geral', 'RH', 'Controladoria'];
const ehAprovaPost = u => POST_APROVA.includes(u.funcao_nome);
const REDES = ['instagram', 'tiktok', 'linkedin', 'facebook', 'x'];

// Colaborador envia o print da publicação → abre tarefa de aprovação (máx 2/mês).
router.post('/post-social', (req, res) => {
  const emp = req.usuario.empresa_id;
  const tipo = req.body.tipo === 'repost' ? 'repost' : 'autoral';
  const rede = REDES.includes(req.body.rede) ? req.body.rede : null;
  if (!req.body.imagem) return res.status(400).json({ erro: 'Anexe o print da publicação.' });
  const comp = compAtual();
  const noMes = db.prepare(`SELECT COUNT(*) c FROM post_social WHERE empresa_id=? AND colaborador_id=? AND competencia=? AND status<>'rejeitado'`).get(emp, req.usuario.id, comp).c;
  if (noMes >= 2) return res.status(400).json({ erro: 'Limite de 2 posts por mês já atingido.' });
  const id = uuidv4();
  db.prepare(`INSERT INTO post_social (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,rede,link,imagem,status,competencia,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?, 'pendente', ?, datetime('now'))`)
    .run(id, emp, req.usuario.id, req.usuario.nome, req.usuario.loja_id || null, tipo, rede, (req.body.link || '').toString().slice(0, 300) || null, String(req.body.imagem).slice(0, 900000), comp);
  // Abre tarefa de aprovação para Marketing/G&G (aparece no Kanban).
  try {
    const { gerarTarefa } = require('./tarefas');
    const aprov = db.prepare(`SELECT c.id, c.loja_id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
      WHERE c.empresa_id=? AND c.ativo=1 AND f.nome IN ('Marketing','Gestor Geral','Diretor Geral')
      ORDER BY CASE f.nome WHEN 'Marketing' THEN 1 WHEN 'Gestor Geral' THEN 2 ELSE 3 END LIMIT 1`).get(emp);
    if (aprov) {
      const tid = gerarTarefa({ empresa_id: emp, loja_id: req.usuario.loja_id || aprov.loja_id, tipo: 'tarefa', origem: 'post_social', referencia_id: id,
        titulo: `Aprovar post social — ${req.usuario.nome}`, descricao: `Publicação ${tipo}${rede ? ' no ' + rede : ''}. Aprove em Loja de pontos → Posts sociais.`,
        responsavel_id: aprov.id, sla_horas: 72, criado_por: req.usuario.id });
      db.prepare(`UPDATE post_social SET tarefa_id=? WHERE id=?`).run(tid, id);
    }
  } catch (e) { console.error('[post-social] tarefa:', e.message); }
  res.status(201).json({ ok: true, id });
});

router.get('/post-social/meus', (req, res) => {
  const rows = db.prepare(`SELECT id, tipo, rede, status, competencia, motivo_rejeicao, criado_em FROM post_social
    WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em DESC LIMIT 30`).all(req.usuario.empresa_id, req.usuario.id);
  res.json({ posts: rows });
});

router.get('/post-social/pendentes', (req, res) => {
  if (!ehAprovaPost(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const rows = db.prepare(`SELECT p.*, (SELECT nome FROM lojas WHERE id=p.loja_id) loja FROM post_social p
    WHERE p.empresa_id=? AND p.status='pendente' ORDER BY p.criado_em`).all(req.usuario.empresa_id);
  res.json({ posts: rows });
});

// Aprova (credita pontos, autoral 15 / repost 5) ou rejeita; encerra a tarefa vinculada.
router.post('/post-social/:id/decidir', (req, res) => {
  if (!ehAprovaPost(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const p = db.prepare(`SELECT * FROM post_social WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Post não encontrado.' });
  if (p.status !== 'pendente') return res.status(400).json({ erro: 'Já avaliado.' });
  const aprovado = !!req.body.aprovado;
  const cfg = getConfig(req.usuario.empresa_id);
  const tx = db.transaction(() => {
    if (aprovado) {
      const pts = p.tipo === 'repost' ? cfg.repost_pontos : cfg.post_social_pontos;
      lancarPontos(req.usuario.empresa_id, { colaborador_id: p.colaborador_id, colaborador_nome: p.colaborador_nome, loja_id: p.loja_id,
        tipo: p.tipo === 'repost' ? 'repost' : 'post_social', descricao: `Post social ${p.tipo}${p.rede ? ' · ' + p.rede : ''}`, pontos: pts,
        competencia: p.competencia, origem: 'automatico', ref: `pts:postsocial:${p.id}`, criado_por: req.usuario.nome });
    }
    db.prepare(`UPDATE post_social SET status=?, avaliado_por=?, avaliado_em=datetime('now'), motivo_rejeicao=? WHERE id=?`)
      .run(aprovado ? 'aprovado' : 'rejeitado', req.usuario.nome, aprovado ? null : (req.body.motivo || '').slice(0, 200) || null, p.id);
    if (p.tarefa_id) db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?`).run(p.tarefa_id);
  });
  tx();
  res.json({ ok: true });
});

// ── Motor de pontos automáticos (super meta, produtividade, caixa) ───────────────────
// Idempotente (dedup por ref). Caixa é 100% SQLite; super meta/indicadores dependem do
// ERP (best-effort: se o ERP estiver fora, apenas pula sem quebrar).
async function sincronizarPontosAutomaticos(empresaId, ano, mes) {
  const cfg = getConfig(empresaId);
  const comp = `${ano}-${String(mes).padStart(2, '0')}`;
  let lancados = 0;

  // 1) CAIXA — zerou o mês (100) ou diferença total < R$10 (50). Fonte: lancamentos_caixa.
  try {
    const rows = db.prepare(`SELECT c.id colaborador_id, c.nome, c.loja_id,
        COUNT(lc.id) fechamentos, ROUND(SUM(ABS(lc.diferenca)),2) dif_mod
      FROM colaboradores c
      LEFT JOIN lancamentos_caixa lc ON lc.colaborador_id=c.id AND lc.empresa_id=c.empresa_id
        AND CAST(strftime('%m',lc.data) AS INTEGER)=? AND CAST(strftime('%Y',lc.data) AS INTEGER)=?
      WHERE c.empresa_id=? AND c.funcao_id='func-caixa' AND c.ativo=1
      GROUP BY c.id, c.nome, c.loja_id`).all(mes, ano, empresaId);
    for (const r of rows) {
      if (!r.fechamentos) continue;
      const zerado = (r.dif_mod || 0) === 0;
      const pts = zerado ? cfg.caixa_zerado_pontos : ((r.dif_mod || 0) < 10 ? cfg.caixa_diferenca_pontos : 0);
      if (pts > 0 && lancarPontos(empresaId, { colaborador_id: r.colaborador_id, colaborador_nome: r.nome, loja_id: r.loja_id, tipo: 'caixa', descricao: zerado ? 'Caixa zerado no mês' : 'Diferença de caixa < R$10 no mês', pontos: pts, competencia: comp, ref: `pts:caixa:${r.colaborador_id}:${comp}` })) lancados++;
    }
  } catch (e) { console.error('[pontos-auto] caixa:', e.message); }

  // 2) SUPER META (+10% acima da super) por vendedor — fonte ERP via fotoVendedor.
  try {
    const fv = require('../lib/fotoVendedor');
    const vendasErp = require('../lib/vendasErp');
    const indicadoresErp = require('../lib/indicadoresErp');
    const lojas = db.prepare('SELECT id FROM lojas WHERE empresa_id=? AND ativa=1').all(empresaId);
    const pesos = fv.pesosVendedor(empresaId);
    for (const { id: lojaId } of lojas) {
      try { await vendasErp.prewarmLoja(lojaId, mes, ano); await indicadoresErp.prewarmIndicadoresVendedores(lojaId, mes, ano); } catch { continue; }
      const metaRow = fv.metaLojaDoPeriodo(empresaId, lojaId, mes, ano);
      const metaLoja = metaRow ? metaRow.valor_meta : 0;
      const vends = fv.vendedoresDaLoja(empresaId, lojaId, mes, ano);
      const somaPesos = vends.reduce((a, v) => a + (v.peso || 0), 0) || 1;
      for (const v of vends) {
        let f; try { f = fv.fotoVendedor(empresaId, lojaId, mes, ano, v, somaPesos, metaLoja, pesos); } catch { continue; }
        if (f.pct_super >= 110 && cfg.super_meta_pontos > 0 &&
          lancarPontos(empresaId, { colaborador_id: v.colaborador_id, colaborador_nome: f.nome, loja_id: lojaId, tipo: 'super_meta', descricao: `+10% acima da super meta (${f.pct_super}%)`, pontos: cfg.super_meta_pontos, competencia: comp, ref: `pts:supermeta:${v.colaborador_id}:${comp}` })) lancados++;
      }
    }
  } catch (e) { console.error('[pontos-auto] super meta:', e.message); }

  // 3) PRODUTIVIDADE — cada indicador do mês que o gerente/subgerente bateu (Painel do Gerente).
  try {
    const { calcularGerente } = require('./painel');
    const vendasErp = require('../lib/vendasErp');
    const indicadoresErp = require('../lib/indicadoresErp');
    if (cfg.produtividade_pontos > 0 && typeof calcularGerente === 'function') {
      const gerentes = db.prepare(`SELECT id, nome, loja_id FROM colaboradores WHERE empresa_id=? AND ativo=1 AND funcao_id IN ('func-gerente','func-subgerente') AND loja_id IS NOT NULL`).all(empresaId);
      const lojasG = [...new Set(gerentes.map(g => g.loja_id))];
      for (const lojaId of lojasG) {
        try { await vendasErp.prewarmLoja(lojaId, mes, ano); await indicadoresErp.prewarmIndicadoresVendedores(lojaId, mes, ano); } catch { /* segue */ }
        let painel; try { painel = calcularGerente(empresaId, lojaId, mes, ano); } catch { continue; }
        const inds = (painel.pilares || []).flatMap(p => p.indicadores || []).filter(i => i.ok === true);
        for (const g of gerentes.filter(x => x.loja_id === lojaId)) {
          for (const ind of inds) {
            if (lancarPontos(empresaId, { colaborador_id: g.id, colaborador_nome: g.nome, loja_id: lojaId, tipo: 'produtividade', descricao: `Indicador atingido: ${ind.nome || ind.id}`, pontos: cfg.produtividade_pontos, competencia: comp, ref: `pts:prod:${g.id}:${ind.id}:${comp}` })) lancados++;
          }
        }
      }
    }
  } catch (e) { console.error('[pontos-auto] produtividade:', e.message); }

  // 4) CMV abaixo do limite (padrão 65%). Loja → gerente/subgerente; por vendedor → o próprio.
  try {
    const indicadoresErp = require('../lib/indicadoresErp');
    const vendasErp = require('../lib/vendasErp');
    const max = cfg.cmv_max || 65;
    if (cfg.cmv_pontos > 0) {
      const lojas = db.prepare('SELECT id FROM lojas WHERE empresa_id=? AND ativa=1').all(empresaId);
      for (const { id: lojaId } of lojas) {
        try { await vendasErp.prewarmLoja(lojaId, mes, ano); } catch { /* segue */ }
        // Loja → gerente/subgerente
        let cmvLoja = null;
        try { cmvLoja = (await indicadoresErp.indicadoresLojaMes(lojaId, mes, ano) || {}).cmv; } catch { /* segue */ }
        if (cmvLoja != null && cmvLoja < max) {
          const gerentes = db.prepare(`SELECT id, nome FROM colaboradores WHERE empresa_id=? AND ativo=1 AND loja_id=? AND funcao_id IN ('func-gerente','func-subgerente')`).all(empresaId, lojaId);
          for (const g of gerentes) if (lancarPontos(empresaId, { colaborador_id: g.id, colaborador_nome: g.nome, loja_id: lojaId, tipo: 'cmv', descricao: `CMV da loja ${cmvLoja}% (< ${max}%)`, pontos: cfg.cmv_pontos, competencia: comp, ref: `pts:cmvloja:${g.id}:${comp}` })) lancados++;
        }
        // Por vendedor → o próprio CMV
        let porVend = {};
        try { porVend = await indicadoresErp.cmvVendedoresLojaMes(lojaId, mes, ano); } catch { /* segue */ }
        for (const [colabId, cmv] of Object.entries(porVend)) {
          if (cmv != null && cmv < max) {
            const nome = (db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(colabId) || {}).nome;
            if (lancarPontos(empresaId, { colaborador_id: colabId, colaborador_nome: nome, loja_id: lojaId, tipo: 'cmv', descricao: `CMV ${cmv}% (< ${max}%)`, pontos: cfg.cmv_pontos, competencia: comp, ref: `pts:cmv:${colabId}:${comp}` })) lancados++;
          }
        }
      }
    }
  } catch (e) { console.error('[pontos-auto] cmv:', e.message); }

  // 5) SATISFAÇÃO — cada avaliação de cliente coletada (validada) pelo vendedor no mês.
  try {
    if (cfg.satisfacao_pontos > 0) {
      const mm = String(mes).padStart(2, '0'), yy = String(ano);
      const rows = db.prepare(`SELECT s.id, s.vendedor_id, s.loja_id, c.nome
        FROM satisfacao_vendedor s JOIN colaboradores c ON c.id=s.vendedor_id
        WHERE s.empresa_id=? AND s.validado=1 AND s.vendedor_id IS NOT NULL
          AND strftime('%m', s.criado_em)=? AND strftime('%Y', s.criado_em)=?`).all(empresaId, mm, yy);
      for (const r of rows) if (lancarPontos(empresaId, { colaborador_id: r.vendedor_id, colaborador_nome: r.nome, loja_id: r.loja_id, tipo: 'satisfacao', descricao: 'Avaliação do cliente coletada', pontos: cfg.satisfacao_pontos, competencia: comp, ref: `pts:satisf:${r.id}` })) lancados++;
    }
  } catch (e) { console.error('[pontos-auto] satisfacao:', e.message); }

  return lancados;
}

router.post('/recalcular', async (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  try {
    const lancados = await sincronizarPontosAutomaticos(req.usuario.empresa_id, ano, mes);
    res.json({ ok: true, lancados, mes, ano });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── G&G: lançar pontos manualmente (post social, super meta, caixa, performance…) ────
router.get('/presets', (req, res) => res.json({ presets: PRESETS, tipos: TIPOS }));

router.post('/lancar', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Apenas Gente & Gestão lança pontos.' });
  const { colaborador_id, tipo } = req.body;
  const pontos = Math.round(Number(req.body.pontos) || 0);
  if (!colaborador_id || !TIPOS[tipo]) return res.status(400).json({ erro: 'Colaborador e tipo são obrigatórios.' });
  if (!pontos) return res.status(400).json({ erro: 'Informe os pontos.' });
  const c = db.prepare('SELECT id,nome,loja_id FROM colaboradores WHERE id=? AND empresa_id=?').get(colaborador_id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const id = uuidv4();
  lancarPontos(req.usuario.empresa_id, {
    colaborador_id: c.id, colaborador_nome: c.nome, loja_id: c.loja_id, tipo, descricao: (req.body.descricao || TIPOS[tipo]).slice(0, 200),
    pontos, origem: 'manual', ref: `manual:${id}`, criado_por: req.usuario.nome,
  });
  res.status(201).json({ ok: true });
});

// Lista de lançamentos (G&G) — auditoria/extrato geral.
router.get('/lancamentos', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const { tipo, q } = req.query;
  const where = ['empresa_id=?']; const p = [req.usuario.empresa_id];
  if (tipo && TIPOS[tipo]) { where.push('tipo=?'); p.push(tipo); }
  if (q) { where.push('colaborador_nome LIKE ?'); p.push(`%${q}%`); }
  const rows = db.prepare(`SELECT * FROM pontos_lancamentos WHERE ${where.join(' AND ')} ORDER BY criado_em DESC LIMIT 300`).all(...p);
  res.json({ lancamentos: rows, tipos: TIPOS });
});

router.delete('/lancamentos/:id', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare('DELETE FROM pontos_lancamentos WHERE id=? AND empresa_id=? AND origem=?').run(req.params.id, req.usuario.empresa_id, 'manual');
  res.json({ ok: true });
});

// ── Admin: fila de resgates a entregar ──────────────────────────────────────────────
router.get('/resgates', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const status = req.query.status;
  const rows = db.prepare(`SELECT r.*, l.nome loja_nome FROM pontos_resgates r LEFT JOIN lojas l ON l.id=r.loja_id
    WHERE r.empresa_id=? ${status ? 'AND r.status=?' : ''} ORDER BY (r.status='solicitado') DESC, r.criado_em DESC LIMIT 200`)
    .all(...(status ? [req.usuario.empresa_id, status] : [req.usuario.empresa_id]));
  res.json({ resgates: rows });
});

const RSTATUS = ['solicitado', 'separado', 'entregue', 'cancelado'];
router.patch('/resgates/:id', (req, res) => {
  if (!ehAdmin(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  const r = db.prepare(`SELECT * FROM pontos_resgates WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!r) return res.status(404).json({ erro: 'Resgate não encontrado.' });
  const novo = req.body.status;
  if (!RSTATUS.includes(novo)) return res.status(400).json({ erro: 'Status inválido.' });
  const tx = db.transaction(() => {
    // cancelar devolve o brinde ao estoque (variação certa se houver) — os pontos voltam pois o resgate deixa de contar
    const delta = (novo === 'cancelado' && r.status !== 'cancelado') ? +1 : (r.status === 'cancelado' && novo !== 'cancelado') ? -1 : 0;
    if (delta) {
      if (r.variacao_id) db.prepare(`UPDATE mercado_variacoes SET estoque=estoque+? WHERE id=?`).run(delta, r.variacao_id);
      else db.prepare(`UPDATE mercado_produtos SET estoque=estoque+? WHERE id=?`).run(delta, r.produto_id);
    }
    db.prepare(`UPDATE pontos_resgates SET status=?, atendido_por=?, atualizado_em=datetime('now') WHERE id=?`)
      .run(novo, req.usuario.nome, r.id);
  });
  tx();
  res.json({ ok: true });
});

// ── Agendamento: roda o motor sozinho (diário + ~45s após o boot) ────────────────────
async function rodarPontosAutomaticosTodas() {
  try {
    const hoje = new Date();
    const mes = hoje.getMonth() + 1, ano = hoje.getFullYear();
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    for (const e of empresas) { try { const n = await sincronizarPontosAutomaticos(e, ano, mes); if (n) console.log(`[pontos-auto] ${e}: ${n} lançamento(s)`); } catch { /* segue */ } }
  } catch (e) { console.error('[pontos-auto] agendamento:', e.message); }
}
setTimeout(rodarPontosAutomaticosTodas, 45000).unref();          // logo após subir
setInterval(rodarPontosAutomaticosTodas, 24 * 60 * 60 * 1000).unref(); // 1x/dia

module.exports = router;
module.exports.lancarPontos = lancarPontos;
module.exports.getConfig = getConfig;
