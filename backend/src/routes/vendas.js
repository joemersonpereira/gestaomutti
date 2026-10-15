const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const calc = require('../lib/calculosVendas');
const { GRUPOS_VENDA } = require('../lib/gruposVenda');
const vendasErp = require('../lib/vendasErp');
const indicadoresErp = require('../lib/indicadoresErp');
const trivioPdv = require('../lib/trivioPdv');

router.use(auth);

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Gerente'];

// Helpers de vendedor (pesos, metas, realizado, fotografia) — compartilhados com painel.js
const {
  pesosVendedor, metaColaboradorInd, realizadoInd, ratiosIndicadores,
  faixasVitaminas, fotoVendedor, ocultarValores, vendedoresDaLoja, metaLojaDoPeriodo,
} = require('../lib/fotoVendedor');

// ─── INDICADORES DA LOJA (AO VIVO DO ERP) ─────────────────────────────────────
// GET /vendas/indicadores-loja?loja_id=&mes=&ano=
// Vitaminas, kits, nº clientes, ticket médio, CMV, representatividade gen/sim e ético.
router.get('/indicadores-loja', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const ind = await indicadoresErp.indicadoresLojaMes(lojaId, mes, ano);
  res.json({ loja_id: lojaId, mes, ano, indicadores: ind, disponivel: !!ind });
});

// ─── RANKING DA LOJA ──────────────────────────────────────────────────────────
// GET /vendas/ranking?loja_id=&mes=&ano=
router.get('/ranking', async (req, res) => {
  const { empresa_id, funcao_nome } = req.usuario;
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  await vendasErp.prewarmLoja(lojaId, mes, ano); // vendas ao vivo do ERP
  await indicadoresErp.prewarmIndicadoresVendedores(lojaId, mes, ano); // indicadores por vendedor (ERP)
  await trivioPdv.prewarmPdv(mes, ano); // PDV+ (Taxa de Conversão) da Trivio

  const metaRow = metaLojaDoPeriodo(empresa_id, lojaId, mes, ano);
  const metaLoja = metaRow ? metaRow.valor_meta : 0;

  const vendedores = vendedoresDaLoja(empresa_id, lojaId, mes, ano);
  const somaPesos = vendedores.reduce((a, v) => a + v.peso, 0) || 1;
  const pesos = pesosVendedor(empresa_id);

  let lista = vendedores.map(v => fotoVendedor(empresa_id, lojaId, mes, ano, v, somaPesos, metaLoja, pesos));
  lista.sort((a, b) => b.pct_meta - a.pct_meta);

  const totalVendido = lista.reduce((a, v) => a + v.vendido, 0);
  const loja = {
    meta: metaLoja,
    super_meta: metaRow ? metaRow.valor_super_meta : Math.round(metaLoja * 1.1),
    vendido: totalVendido,
    pct_meta: calc.pct(totalVendido, metaLoja),
    dia_atual: calc.diaCorrente(mes, ano),
    dias_mes: calc.diasNoMes(mes, ano),
    meta_aprovada: metaRow ? metaRow.status_aprovacao === 'aprovado' : false,
    na_meta: lista.filter(v => v.pct_meta >= 90).length,
    abaixo: lista.filter(v => v.pct_meta < 80).length,
    total_vendedores: lista.length,
  };

  // Vendedor não vê valores absolutos
  if (funcao_nome === 'Vendedor') {
    lista = lista.map(ocultarValores);
    delete loja.meta; delete loja.super_meta; delete loja.vendido;
  }

  res.json({ mes, ano, loja, ranking: lista, pesos });
});

// ─── MEU PAINEL (vendedor) ────────────────────────────────────────────────────
// GET /vendas/meu-painel?mes=&ano=
router.get('/meu-painel', async (req, res) => {
  const { empresa_id, id: userId, loja_id } = req.usuario;
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  await vendasErp.prewarmLoja(loja_id, mes, ano); // vendas ao vivo do ERP
  await indicadoresErp.prewarmIndicadoresVendedores(loja_id, mes, ano); // indicadores por vendedor (ERP)
  await trivioPdv.prewarmPdv(mes, ano); // PDV+ (Taxa de Conversão) da Trivio

  const metaRow = metaLojaDoPeriodo(empresa_id, loja_id, mes, ano);
  const metaLoja = metaRow ? metaRow.valor_meta : 0;
  const vendedores = vendedoresDaLoja(empresa_id, loja_id, mes, ano);
  const somaPesos = vendedores.reduce((a, v) => a + v.peso, 0) || 1;
  const eu = vendedores.find(v => v.colaborador_id === userId);
  if (!eu) return res.status(404).json({ erro: 'Você não é um vendedor com meta neste período.' });

  const foto = fotoVendedor(empresa_id, loja_id, mes, ano, eu, somaPesos, metaLoja, pesosVendedor(empresa_id));

  // Regra: vendedor vê % da meta e super meta, não o valor total
  const painel = {
    nome: foto.nome,
    pct_meta: foto.pct_meta,
    pct_super: foto.pct_super,
    nota_indicadores: foto.nota_indicadores,
    avaliacoes: foto.avaliacoes,
    premiacao_pct: foto.premiacao_pct,
    vitaminas_unidades: foto.vitaminas_unidades,
    premiacao_vitamina_un: foto.premiacao_vitamina_un,
    conquistas: foto.conquistas,
    dia_atual: calc.diaCorrente(mes, ano),
    dias_mes: calc.diasNoMes(mes, ano),
  };
  res.json({ mes, ano, painel });
});

// ─── MINHA PREMIAÇÃO PREVISTA (vendedor) ──────────────────────────────────────
// GET /vendas/meu-premio?mes=&ano= — prévia da premiação do próprio colaborador.
// Premiação de vendas = % (3/4/5) sobre o LÍQUIDO do plano "Premiação" + bônus de
// vitaminas (R$/un) + Unidades Vendidas (R$/un). Mostra também os indicadores.
router.get('/meu-premio', async (req, res) => {
  const { empresa_id, id: userId, loja_id } = req.usuario;
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  await vendasErp.prewarmLoja(loja_id, mes, ano);
  await indicadoresErp.prewarmIndicadoresVendedores(loja_id, mes, ano);
  await trivioPdv.prewarmPdv(mes, ano); // PDV+ (Taxa de Conversão) da Trivio

  const metaRow = metaLojaDoPeriodo(empresa_id, loja_id, mes, ano);
  const metaLoja = metaRow ? metaRow.valor_meta : 0;
  const vendedores = vendedoresDaLoja(empresa_id, loja_id, mes, ano);
  const somaPesos = vendedores.reduce((a, v) => a + v.peso, 0) || 1;
  const eu = vendedores.find(v => v.colaborador_id === userId);
  if (!eu) return res.json({ tem: false });

  const foto = fotoVendedor(empresa_id, loja_id, mes, ano, eu, somaPesos, metaLoja, pesosVendedor(empresa_id));
  const base = await indicadoresErp.premiacaoBaseVendedor(userId, mes, ano);
  const r2 = v => Math.round((v || 0) * 100) / 100;
  const premiacaoValor = r2((foto.premiacao_pct / 100) * base.premiacao_liquido);
  const vitaminasValor = r2(foto.premiacao_vitamina_total);
  const uvValor = r2(base.uv_remuneracao);
  const total = r2(premiacaoValor + vitaminasValor + uvValor);

  // Indicadores detalhados (realizado ÷ meta → nota) — os que impactam a premiação.
  const indicadores = pesosVendedor(empresa_id).map(c => {
    const metaC = metaColaboradorInd(empresa_id, loja_id, c.indicador, mes, ano);
    const real = realizadoInd(empresa_id, userId, c.indicador, mes, ano);
    const nota = calc.notaIndicador(c.indicador, real, metaC);
    return { indicador: c.indicador, label: c.label, peso: c.peso, realizado: real, meta: metaC ?? null, nota };
  });

  res.json({
    tem: true, mes, ano,
    pct_meta: foto.pct_meta, pct_super: foto.pct_super, nota_indicadores: foto.nota_indicadores,
    premiacao_pct: foto.premiacao_pct, premiacao_valor: premiacaoValor,
    vitaminas_un: foto.vitaminas_unidades, vitaminas_valor: vitaminasValor,
    uv_valor: uvValor, total_previsto: total, indicadores,
  });
});

// ─── PREMIAÇÃO DA EQUIPE (gestão/supervisão) ─────────────────────────────────
// GET /vendas/premiacao-equipe?loja_id=&funcao=&mes=&ano=
// Supervisor/Diretor: todas as lojas (ou uma). Gerente: só a dele. Traz a premiação
// prevista de cada vendedor + o total acumulado.
router.get('/premiacao-equipe', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), async (req, res) => {
  const { empresa_id, funcao_nome, loja_id: userLoja } = req.usuario;
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const funcaoFiltro = req.query.funcao || '';
  const r2 = v => Math.round((v || 0) * 100) / 100;

  let lojasAlvo;
  if (funcao_nome === 'Gerente') lojasAlvo = [userLoja];
  else if (req.query.loja_id) lojasAlvo = [req.query.loja_id];
  else lojasAlvo = db.prepare('SELECT id FROM lojas WHERE empresa_id=? AND ativa=1 ORDER BY nome').all(empresa_id).map(l => l.id);

  const linhas = [];
  for (const lojaId of lojasAlvo) {
    await vendasErp.prewarmLoja(lojaId, mes, ano);
    await indicadoresErp.prewarmIndicadoresVendedores(lojaId, mes, ano);
    await trivioPdv.prewarmPdv(mes, ano); // PDV+ (Taxa de Conversão) da Trivio
    const base = await indicadoresErp.premiacaoBaseVendedoresLoja(lojaId, mes, ano);
    const metaRow = metaLojaDoPeriodo(empresa_id, lojaId, mes, ano);
    const metaLoja = metaRow ? metaRow.valor_meta : 0;
    const vendedores = vendedoresDaLoja(empresa_id, lojaId, mes, ano);
    const somaPesos = vendedores.reduce((a, v) => a + v.peso, 0) || 1;
    const pesos = pesosVendedor(empresa_id);
    const lojaNome = db.prepare('SELECT nome FROM lojas WHERE id=?').get(lojaId)?.nome;
    for (const v of vendedores) {
      const foto = fotoVendedor(empresa_id, lojaId, mes, ano, v, somaPesos, metaLoja, pesos);
      const b = base[v.colaborador_id] || { premiacao_liquido: 0, uv_remuneracao: 0 };
      const premiacaoValor = r2((foto.premiacao_pct / 100) * b.premiacao_liquido);
      const vitaminasValor = r2(foto.premiacao_vitamina_total);
      const uvValor = r2(b.uv_remuneracao);
      const total = r2(premiacaoValor + vitaminasValor + uvValor);
      linhas.push({
        loja_id: lojaId, loja: lojaNome, colaborador_id: v.colaborador_id, nome: v.nome, funcao: 'Vendedor',
        pct_meta: foto.pct_meta, pct_super: foto.pct_super, nota_indicadores: foto.nota_indicadores,
        premiacao_pct: foto.premiacao_pct, premiacao_valor: premiacaoValor,
        vitaminas_valor: vitaminasValor, uv_valor: uvValor, total,
      });
    }
  }
  const filtradas = funcaoFiltro ? linhas.filter(l => l.funcao === funcaoFiltro) : linhas;
  filtradas.sort((a, b) => b.total - a.total);
  res.json({
    mes, ano, escopo: funcao_nome === 'Gerente' ? 'loja' : (req.query.loja_id ? 'loja' : 'rede'),
    linhas: filtradas,
    total_acumulado: r2(filtradas.reduce((a, l) => a + l.total, 0)),
    premiacao_total: r2(filtradas.reduce((a, l) => a + l.premiacao_valor, 0)),
    vitaminas_total: r2(filtradas.reduce((a, l) => a + l.vitaminas_valor, 0)),
    uv_total: r2(filtradas.reduce((a, l) => a + l.uv_valor, 0)),
    funcoes: [...new Set(linhas.map(l => l.funcao))],
  });
});

// ─── LANÇAR VENDA ─────────────────────────────────────────────────────────────
// POST /vendas  { colaborador_id, valor, data_venda }
router.post('/', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { colaborador_id, valor, data_venda, loja_id, grupo } = req.body;
  if (!colaborador_id || !valor || !data_venda) {
    return res.status(400).json({ erro: 'Colaborador, valor e data obrigatórios.' });
  }
  const vend = db.prepare('SELECT loja_id FROM colaboradores WHERE id = ? AND empresa_id = ?')
    .get(colaborador_id, req.usuario.empresa_id);
  if (!vend) return res.status(404).json({ erro: 'Colaborador não encontrado.' });

  db.prepare(`INSERT INTO vendas (id,empresa_id,loja_id,colaborador_id,valor,data_venda,grupo,lancado_por_id,criado_em) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(uuidv4(), req.usuario.empresa_id, loja_id || vend.loja_id, colaborador_id, valor, data_venda, grupo || null, req.usuario.id);

  res.status(201).json({ mensagem: 'Venda lançada.' });
});

// GET /vendas?colaborador_id=&mes=&ano=  (lista lançamentos)
router.get('/', (req, res) => {
  const { empresa_id, funcao_nome, id: userId } = req.usuario;
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  let q = `
    SELECT v.*, c.nome as vendedor_nome FROM vendas v
    JOIN colaboradores c ON c.id = v.colaborador_id
    WHERE v.empresa_id = ?
      AND CAST(strftime('%m', v.data_venda) AS INTEGER) = ?
      AND CAST(strftime('%Y', v.data_venda) AS INTEGER) = ?
  `;
  const params = [empresa_id, mes, ano];
  if (funcao_nome === 'Vendedor') { q += ' AND v.colaborador_id = ?'; params.push(userId); }
  else if (req.query.colaborador_id) { q += ' AND v.colaborador_id = ?'; params.push(req.query.colaborador_id); }
  q += ' ORDER BY v.data_venda DESC';
  res.json({ vendas: db.prepare(q).all(...params) });
});

// ─── INDICADORES COMERCIAIS DO VENDEDOR ───────────────────────────────────────
// GET /vendas/indicadores/:colaboradorId?mes=&ano=
router.get('/indicadores/:colaboradorId', (req, res) => {
  const { empresa_id, funcao_nome, id: userId } = req.usuario;
  if (funcao_nome === 'Vendedor' && req.params.colaboradorId !== userId) {
    return res.status(403).json({ erro: 'Sem permissão.' });
  }
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();

  const pesos = pesosVendedor(empresa_id);
  const rows = db.prepare(`
    SELECT indicador, avaliacao, valor_num FROM indicadores_vendedor
    WHERE colaborador_id = ? AND mes = ? AND ano = ?
  `).all(req.params.colaboradorId, mes, ano);

  const mapa = {};
  rows.forEach(r => { mapa[r.indicador] = { avaliacao: r.avaliacao, valor_num: r.valor_num }; });
  const avaliacoes = {};
  Object.entries(mapa).forEach(([k, v]) => avaliacoes[k] = v.avaliacao);

  res.json({
    mes, ano,
    pesos,
    indicadores: pesos.map(p => ({
      indicador: p.indicador, label: p.label, peso: p.peso,
      avaliacao: mapa[p.indicador]?.avaliacao || null,
      valor_num: mapa[p.indicador]?.valor_num || 0,
    })),
    nota: calc.calcNotaIndicadores(avaliacoes, pesos),
  });
});

// POST /vendas/indicadores/:colaboradorId — gerente/supervisor avalia
// body: { mes, ano, avaliacoes: { identificacao:'bom', ... }, vitaminas_unidades }
router.post('/indicadores/:colaboradorId', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { empresa_id } = req.usuario;
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  const { avaliacoes = {}, vitaminas_unidades = 0 } = req.body;

  const vend = db.prepare(`SELECT id, nome, loja_id FROM colaboradores WHERE id = ? AND empresa_id = ? AND funcao_id = 'func-vendedor'`)
    .get(req.params.colaboradorId, empresa_id);
  if (!vend) return res.status(404).json({ erro: 'Vendedor não encontrado.' });

  const pesos = pesosVendedor(empresa_id);
  const validas = new Set(pesos.map(p => p.indicador));
  const upsert = db.prepare(`
    INSERT INTO indicadores_vendedor (id,empresa_id,loja_id,colaborador_id,mes,ano,indicador,avaliacao,valor_num,lancado_por_id,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(colaborador_id, mes, ano, indicador)
    DO UPDATE SET avaliacao = excluded.avaliacao, valor_num = excluded.valor_num, lancado_por_id = excluded.lancado_por_id, atualizado_em = datetime('now')
  `);

  const ruins = [];
  for (const [ind, av] of Object.entries(avaliacoes)) {
    if (!validas.has(ind)) continue;
    if (!['bom', 'regular', 'ruim'].includes(av)) continue;
    const valorNum = ind === 'vitaminas' ? (vitaminas_unidades || 0) : 0;
    upsert.run(uuidv4(), empresa_id, vend.loja_id, vend.id, mes, ano, ind, av, valorNum, req.usuario.id);
    if (av === 'ruim') ruins.push(ind);
  }

  // Regra universal: evento que exige ação gera tarefa no Kanban.
  // Indicador 'ruim' → tarefa corretiva para o gerente da loja.
  let tarefa_gerada = false;
  if (ruins.length) {
    const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND loja_id = ? AND funcao_id = 'func-gerente' AND ativo = 1 LIMIT 1`)
      .get(empresa_id, vend.loja_id);
    if (gerente) {
      const labels = ruins.map(r => pesos.find(p => p.indicador === r)?.label || r).join(', ');
      gerarTarefa({
        empresa_id, loja_id: vend.loja_id, tipo: 'tarefa', origem: 'indicador',
        titulo: `Plano de melhoria — ${vend.nome}`,
        descricao: `Indicadores avaliados como RUIM: ${labels}. Defina ação corretiva com o vendedor.`,
        responsavel_id: gerente.id, urgente: 1, sla_horas: 48, criado_por: req.usuario.id,
      });
      tarefa_gerada = true;
    }
  }

  // Recalcula nota
  const rows = db.prepare(`SELECT indicador, avaliacao FROM indicadores_vendedor WHERE colaborador_id = ? AND mes = ? AND ano = ?`)
    .all(vend.id, mes, ano);
  const av = {}; rows.forEach(r => av[r.indicador] = r.avaliacao);
  res.json({ mensagem: 'Indicadores salvos.', nota: calc.calcNotaIndicadores(av, pesos), tarefa_gerada });
});

// ── Calendário de vendas (dias não úteis) — definido pela SUPERVISÃO ──
// GET /vendas/calendario?loja_id=&mes=&ano=
router.get('/calendario', (req, res) => {
  const { loja_id } = req.query;
  const mes = parseInt(req.query.mes), ano = parseInt(req.query.ano);
  const dias = db.prepare(`SELECT id, data, tipo FROM dias_nao_uteis WHERE empresa_id=? AND loja_id=?
    AND CAST(strftime('%m', data) AS INTEGER)=? AND CAST(strftime('%Y', data) AS INTEGER)=? ORDER BY data`)
    .all(req.usuario.empresa_id, loja_id, mes, ano);
  res.json({ dias });
});

// POST /vendas/calendario — supervisão marca um feriado/dia fechado
router.post('/calendario', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { loja_id, data, tipo } = req.body;
  if (!loja_id || !data) return res.status(400).json({ erro: 'Loja e data obrigatórios.' });
  try {
    db.prepare(`INSERT INTO dias_nao_uteis (id,empresa_id,loja_id,data,tipo) VALUES (?,?,?,?,?)`)
      .run(require('uuid').v4(), req.usuario.empresa_id, loja_id, data, tipo || 'feriado');
  } catch (e) { /* já existe */ }
  res.status(201).json({ mensagem: 'Dia marcado.' });
});

// DELETE /vendas/calendario/:id — supervisão remove
router.delete('/calendario/:id', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  db.prepare('DELETE FROM dias_nao_uteis WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ mensagem: 'Removido.' });
});

// ─────────── Indicadores comerciais por META + lançamento de realizado ───────────
// Lista vendedores ativos da loja (para mostrar todos de uma vez)
// (renomeada de vendedoresDaLoja: havia COLISÃO com a função de 4 args acima, que
//  retorna colaborador_id/peso — a redeclaração sobrescrevia a outra em todo o arquivo.)
function vendedoresSimples(empresaId, lojaId) {
  return db.prepare(`SELECT id, nome FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id='func-vendedor' AND ativo=1 ORDER BY nome`).all(empresaId, lojaId);
}

// GET /vendas/indicador-metas?loja_id=&mes=&ano= — meta da loja e do colaborador por indicador
router.get('/indicador-metas', (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const eid = req.usuario.empresa_id;
  const indicadores = pesosVendedor(eid).map(c => {
    const ml = db.prepare(`SELECT meta_valor, unidade FROM indicador_metas WHERE empresa_id=? AND loja_id=? AND indicador=? AND mes=? AND ano=? AND escopo='loja'`).get(eid, lojaId, c.indicador, mes, ano);
    const mc = db.prepare(`SELECT meta_valor, unidade FROM indicador_metas WHERE empresa_id=? AND loja_id=? AND indicador=? AND mes=? AND ano=? AND escopo='colaborador'`).get(eid, lojaId, c.indicador, mes, ano);
    return {
      indicador: c.indicador, label: c.label, peso: c.peso,
      meta_loja: ml?.meta_valor ?? '', meta_colaborador: mc?.meta_valor ?? '',
      unidade: mc?.unidade || ml?.unidade || 'percentual',
    };
  });
  res.json({ mes, ano, loja_id: lojaId, indicadores });
});

// POST /vendas/indicador-metas — define meta de loja e/ou colaborador de um indicador
// body: { loja_id, mes, ano, indicador, unidade, meta_loja, meta_colaborador }
router.post('/indicador-metas', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const eid = req.usuario.empresa_id;
  const { loja_id, indicador, unidade } = req.body;
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  if (!loja_id || !indicador) return res.status(400).json({ erro: 'Loja e indicador obrigatórios.' });
  const un = ['percentual', 'unidade', 'reais'].includes(unidade) ? unidade : 'percentual';
  const upsert = (escopo, valor) => {
    if (valor === '' || valor === null || valor === undefined) return;
    db.prepare(`INSERT INTO indicador_metas (id,empresa_id,loja_id,indicador,mes,ano,escopo,meta_valor,unidade,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(empresa_id,loja_id,indicador,mes,ano,escopo) DO UPDATE SET meta_valor=excluded.meta_valor, unidade=excluded.unidade`)
      .run(uuidv4(), eid, loja_id, indicador, mes, ano, escopo, Number(valor), un);
  };
  upsert('loja', req.body.meta_loja);
  upsert('colaborador', req.body.meta_colaborador);
  res.json({ mensagem: 'Meta do indicador salva.' });
});

// ── Config da loja: marcação de Farmácia Popular (afeta o indicador PBM) ─────
router.get('/loja-config', (req, res) => {
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const l = db.prepare('SELECT tem_farmacia_popular FROM lojas WHERE id=?').get(lojaId) || {};
  res.json({ loja_id: lojaId, tem_farmacia_popular: !!l.tem_farmacia_popular });
});
router.post('/loja-config', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { loja_id, tem_farmacia_popular } = req.body;
  if (!loja_id) return res.status(400).json({ erro: 'Loja obrigatória.' });
  db.prepare('UPDATE lojas SET tem_farmacia_popular=? WHERE id=?').run(tem_farmacia_popular ? 1 : 0, loja_id);
  res.json({ mensagem: 'Loja atualizada.' });
});

// ── Cadernos de oferta que alimentam o indicador "Campanhas" ─────────────────
// GET /vendas/cadernos-oferta — lista os cadernos do ERP (para escolher)
router.get('/cadernos-oferta', async (req, res) => {
  const lista = await indicadoresErp.listarCadernosOferta(req.query.desde);
  res.json({ cadernos: lista });
});
// GET /vendas/campanha-cadernos — cadernos selecionados (que contam no indicador Campanhas)
router.get('/campanha-cadernos', (req, res) => {
  const rows = db.prepare('SELECT caderno_id, nome FROM campanha_cadernos WHERE empresa_id=? ORDER BY nome').all(req.usuario.empresa_id);
  res.json({ selecionados: rows });
});
// POST /vendas/campanha-cadernos { cadernos: [{id, nome}] } — substitui a seleção
router.post('/campanha-cadernos', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const eid = req.usuario.empresa_id;
  const lista = Array.isArray(req.body.cadernos) ? req.body.cadernos : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM campanha_cadernos WHERE empresa_id=?').run(eid);
    const ins = db.prepare('INSERT OR IGNORE INTO campanha_cadernos (id,empresa_id,caderno_id,nome) VALUES (?,?,?,?)');
    for (const c of lista) { if (c && c.id != null) ins.run(uuidv4(), eid, String(c.id), c.nome || null); }
  });
  tx();
  res.json({ mensagem: 'Cadernos do indicador Campanhas atualizados.', total: lista.length });
});

// GET /vendas/indicador-realizado?loja_id=&mes=&ano= — todos os vendedores × indicadores (realizado + nota proporcional)
router.get('/indicador-realizado', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const eid = req.usuario.empresa_id;
  await indicadoresErp.prewarmIndicadoresVendedores(lojaId, mes, ano); // vitaminas/identificação/campanhas do ERP
  await trivioPdv.prewarmPdv(mes, ano); // PDV+ (Taxa de Conversão) da Trivio
  const temCadernos = indicadoresErp.cadernosSelecionados().length > 0;
  const inds = pesosVendedor(eid).map(c => ({
    indicador: c.indicador, label: c.label, peso: c.peso,
    // vem automático (não editável). 'campanha' só é auto com cadernos; 'cadastro' (PDV+) vem da Trivio.
    auto_erp: c.indicador === 'campanha' ? temCadernos
      : c.indicador === 'cadastro' ? trivioPdv.habilitado()
      : indicadoresErp.INDICADORES_ERP.has(c.indicador),
    auto_fonte: c.indicador === 'cadastro' ? 'Trivio' : 'ERP',
    meta_colaborador: metaColaboradorInd(eid, lojaId, c.indicador, mes, ano) ?? null,
    unidade: db.prepare(`SELECT unidade FROM indicador_metas WHERE empresa_id=? AND loja_id=? AND indicador=? AND mes=? AND ano=? AND escopo='colaborador'`).get(eid, lojaId, c.indicador, mes, ano)?.unidade || 'percentual',
  }));
  const colaboradores = vendedoresSimples(eid, lojaId).map(v => {
    const valores = {};
    inds.forEach(i => {
      const real = realizadoInd(eid, v.id, i.indicador, mes, ano);
      const nota = calc.notaIndicador(i.indicador, real, i.meta_colaborador);
      valores[i.indicador] = { realizado: real, nota };
    });
    return { colaborador_id: v.id, nome: v.nome, valores };
  });
  res.json({ mes, ano, loja_id: lojaId, indicadores: inds, colaboradores });
});

// POST /vendas/indicador-lancamentos — lança o realizado de um período (total) para vários colaboradores
// body: { loja_id, data_inicio, data_fim, lancamentos: [{ colaborador_id, indicador, valor }] }
router.post('/indicador-lancamentos', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const eid = req.usuario.empresa_id;
  const { loja_id, data_inicio, data_fim, lancamentos = [] } = req.body;
  if (!loja_id || !data_inicio || !lancamentos.length) return res.status(400).json({ erro: 'Loja, data e lançamentos obrigatórios.' });
  const d = new Date(data_inicio + 'T00:00:00');
  const mes = d.getMonth() + 1, ano = d.getFullYear();
  const ins = db.prepare(`INSERT INTO indicador_lancamentos (id,empresa_id,loja_id,colaborador_id,indicador,mes,ano,data_inicio,data_fim,valor,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`);
  let n = 0;
  for (const l of lancamentos) {
    if (!l.colaborador_id || !l.indicador || l.valor === '' || l.valor === null || l.valor === undefined) continue;
    ins.run(uuidv4(), eid, loja_id, l.colaborador_id, l.indicador, mes, ano, data_inicio, data_fim || data_inicio, Number(l.valor), req.usuario.id);
    n++;
  }
  res.json({ mensagem: `${n} lançamento(s) registrado(s). Avaliação atualizada automaticamente.`, lancados: n });
});

// GET /vendas/metas-grupos?loja_id=&mes=&ano= — modo (geral/grupo) e grupos com meta de cada vendedor
router.get('/metas-grupos', (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const eid = req.usuario.empresa_id;
  const colaboradores = vendedoresSimples(eid, lojaId).map(v => {
    const m = db.prepare(`SELECT id, modo FROM metas WHERE empresa_id=? AND colaborador_id=? AND mes=? AND ano=?`).get(eid, v.id, mes, ano);
    const grupos = m && m.modo === 'grupo'
      ? db.prepare(`SELECT g.grupo, g.valor_meta FROM meta_grupos g WHERE g.meta_id=?`).all(m.id).map(g => g.grupo)
      : [];
    return { colaborador_id: v.id, nome: v.nome, modo: m?.modo || 'geral', grupos };
  });
  res.json({ mes, ano, loja_id: lojaId, grupos_disponiveis: GRUPOS_VENDA, colaboradores });
});

module.exports = router;
