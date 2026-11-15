// financeiro.js — Módulo Financeiro (DFC/DRE base). Fatia 1: despesas por plano + drill + reajuste.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { lojasEmpresa } = require('../lib/escopoCompras');
const { dfcDespesas, lancamentosPlano, reajusteDespesas, fluxoCaixa, lancamentosGrupo, lancamentosLinha, lancamentosManuais, dre, confrontoDreDfc, representatividade, setBenchmark, vendaPorColaborador, contasPagarAberto, lancamentosSemPlano, creditosDevolucao } = require('../lib/financeiroErp');
const { getOrcamento, salvar: salvarOrc, gerar: gerarOrc, distribuirGrupo, getRateio, setRateio, ratear } = require('../lib/orcamentoFinanceiro');
const dfcImport = require('../lib/dfcImport');

const GESTAO_FIN = ['Diretor Geral', 'Gestor Geral', 'Controladoria'];
router.use(auth);
// Cache serve-stale do ERP (Joe 2026-11-14): abre na hora e só reconsulta o Alpha ~1x/h ou após escrita. ?forcar=1 recalcula.
const { cacheMiddleware: _erpCache, invalidarMiddleware: _erpInval } = require('../lib/erpCache');
router.use(_erpCache('financeiro', { skip: req => req.path.startsWith('/orcamento/justificativa') }));
router.use(_erpInval('financeiro'));
router.use(exigePerfil(...GESTAO_FIN));

router.get('/lojas', (req, res) => res.json({ lojas: lojasEmpresa(req.usuario.empresa_id) }));

// DFC (regime caixa) importado da planilha do Joe, por loja/mês. Hierarquia de plano de contas.
router.get('/dfc-plano', (req, res) => {
  const emp = req.usuario.empresa_id;
  const periodos = dfcImport.periodosImportados(emp);
  const ano = Number(req.query.ano) || (periodos[periodos.length - 1]?.ano);
  const mes = Number(req.query.mes) || (periodos[periodos.length - 1]?.mes);
  if (!ano || !mes) return res.json({ periodos, linhas: [], ano: null, mes: null });
  res.json({ periodos, ano, mes, loja: req.query.loja || null, linhas: dfcImport.ler(emp, { ano, mes, lojaId: req.query.loja || null }) });
});

router.get('/fluxo', async (req, res) => {
  try {
    res.json(await fluxoCaixa(req.usuario.empresa_id, {
      lojaId: req.query.loja || undefined, granularidade: req.query.g || 'mes',
      nHist: Number(req.query.hist) || 6, nProj: Number(req.query.proj) || 3,
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Exporta o Fluxo de caixa (Previsão × Realizado) p/ Excel — 2 colunas por período (Realizado | Previsão).
router.get('/fluxo/export', async (req, res) => {
  try {
    const d = await fluxoCaixa(req.usuario.empresa_id, {
      lojaId: req.query.loja || undefined, granularidade: req.query.g || 'mes',
      nHist: Number(req.query.hist) || 6, nProj: Number(req.query.proj) || 3,
    });
    if (!d || d.erro) return res.status(502).json({ erro: d?.erro || 'Sem dados.' });
    const XLSX = require('xlsx');
    const aoa = [];
    // Cabeçalho 1: nome do período agrupando 2 colunas; Cabeçalho 2: Realizado | Previsão.
    const h1 = ['']; const h2 = ['Categoria'];
    d.periodos.forEach(p => { h1.push(p.label + (p.projetado ? ' *' : ''), ''); h2.push('Realizado', 'Previsão'); });
    aoa.push(h1, h2);
    const linha = (cat, valores, previsto) => {
      const r = [cat];
      d.periodos.forEach((p, j) => { r.push(p.projetado ? '' : (valores[j] || 0), (previsto && previsto[j]) || 0); });
      return r;
    };
    aoa.push(['RECEITAS']);
    d.receitas.forEach(l => aoa.push(linha(l.categoria, l.valores, l.previsto)));
    aoa.push(linha('Total de receitas', d.totalReceita, d.totalReceitaPrev));
    aoa.push([], ['DESPESAS']);
    d.despesas.forEach(l => {
      aoa.push(linha(l.categoria, l.valores, l.previsto));
      (l.filhos || []).forEach(f => { if ((l.filhos || []).length > 1) aoa.push(linha('   ↳ ' + f.plano, f.valores, f.previsto || [])); });
    });
    aoa.push(linha('Total de despesas', d.totalDespesa, d.totalDespesaPrev));
    aoa.push([], linha('SALDO (receita − despesa)', d.saldo, d.saldoPrev || []));

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Merge dos cabeçalhos de período (2 colunas cada) + largura das colunas.
    ws['!merges'] = d.periodos.map((_, i) => ({ s: { r: 0, c: 1 + i * 2 }, e: { r: 0, c: 2 + i * 2 } }));
    ws['!cols'] = [{ wch: 34 }, ...d.periodos.flatMap(() => [{ wch: 13 }, { wch: 13 }])];
    // Formato R$ nas células numéricas (a partir da linha 3, coluna 2 em diante).
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 2; R <= range.e.r; R++) for (let C = 1; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fluxo de caixa');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const nome = `fluxo-caixa-${req.query.g || 'mes'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { res.status(502).json({ erro: 'Falha ao exportar: ' + e.message }); }
});

// Patrocínio recebido (Marketing) — entrada informativa p/ o Financeiro (não mexe no DRE/DFC do ERP)
router.get('/patrocinio-mkt', (req, res) => {
  const emp = req.usuario.empresa_id;
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  const rows = db.prepare(`SELECT CAST(strftime('%m', data_ini) AS INTEGER) mes, SUM(COALESCE(patrocinio_valor,0)) v
    FROM mkt_agenda WHERE empresa_id=? AND COALESCE(patrocinio_valor,0)>0 AND status!='cancelado' AND strftime('%Y', data_ini)=? GROUP BY 1`).all(emp, String(ano));
  const meses = Array.from({ length: 12 }, (_, i) => 0);
  let total = 0; rows.forEach(r => { meses[r.mes - 1] = Number(r.v) || 0; total += Number(r.v) || 0; });
  const itens = db.prepare(`SELECT titulo, data_ini, patrocinador, patrocinio_valor FROM mkt_agenda
    WHERE empresa_id=? AND COALESCE(patrocinio_valor,0)>0 AND status!='cancelado' AND strftime('%Y', data_ini)=? ORDER BY data_ini DESC LIMIT 50`).all(emp, String(ano));
  res.json({ ano, total, meses, itens });
});

// Representatividade (análise vertical) × benchmark do mercado farma.
router.get('/representatividade', async (req, res) => {
  try {
    res.json(await representatividade(req.usuario.empresa_id, {
      ano: req.query.ano, mes: req.query.mes || undefined, lojaId: req.query.loja || undefined, nivel: req.query.nivel || undefined,
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});
router.put('/representatividade/benchmark', (req, res) => {
  setBenchmark(req.usuario.empresa_id, req.body.chave, req.body.valor);
  res.json({ ok: true });
});
// Eficiência: faturamento da loja ÷ vendedor (média) e quem está abaixo.
router.get('/venda-colaborador', async (req, res) => {
  try {
    res.json(await vendaPorColaborador(req.usuario.empresa_id, {
      ano: req.query.ano, mes: req.query.mes || undefined, lojaId: req.query.loja || undefined,
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/lancamentos-grupo', async (req, res) => {
  try {
    res.json(await lancamentosGrupo(req.usuario.empresa_id, {
      grupo: req.query.grupo, ini: req.query.ini, fim: req.query.fim, lojaId: req.query.loja || undefined, base: req.query.base || undefined,
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});
// Lista de lançamentos manuais (tela "Lançamento Financeiro" do A7) — auditoria.
router.get('/lancamentos-manuais', async (req, res) => {
  try {
    res.json(await lancamentosManuais(req.usuario.empresa_id, {
      ini: req.query.ini, fim: req.query.fim, lojaId: req.query.loja || undefined,
      tipo: req.query.tipo || undefined, busca: req.query.busca || undefined,
      extrato: String(req.query.extrato || '') === '1',
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});
// Drill de uma linha do DRE×DFC (por classe), lado 'dre' (competência) ou 'dfc' (caixa/pago).
router.get('/dlp-lancamentos', async (req, res) => {
  try {
    res.json(await lancamentosLinha(req.usuario.empresa_id, {
      ano: req.query.ano, mes: req.query.mes, linha: req.query.linha, lado: req.query.lado, lojaId: req.query.loja || undefined,
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

const dlpDfc = require('../lib/dlpDfc');
router.get('/dlp-grupos', async (req, res) => {
  try { res.json(await dlpDfc.grupos(req.usuario.empresa_id, { ano: req.query.ano, lojaId: req.query.loja || undefined })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});
router.post('/dlp-config', (req, res) => res.json(dlpDfc.setConfig(req.usuario.empresa_id, req.body.itens || [])));
router.get('/demonstrativos', async (req, res) => {
  try { res.json(await dlpDfc.demonstrativos(req.usuario.empresa_id, { ano: req.query.ano, lojaId: req.query.loja || undefined })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/dre', async (req, res) => {
  try { res.json(await dre(req.usuario.empresa_id, { ano: req.query.ano, lojaId: req.query.loja || undefined })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/confronto', async (req, res) => {
  try { res.json(await confrontoDreDfc(req.usuario.empresa_id, { ano: req.query.ano, lojaId: req.query.loja || undefined })); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/dfc', async (req, res) => {
  try {
    res.json(await dfcDespesas(req.usuario.empresa_id, {
      ini: req.query.ini, fim: req.query.fim, lojaId: req.query.loja || undefined,
      incluirCmv: req.query.cmv !== '0',
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/lancamentos', async (req, res) => {
  try {
    res.json(await lancamentosPlano(req.usuario.empresa_id, {
      planoId: Number(req.query.plano), ini: req.query.ini, fim: req.query.fim, lojaId: req.query.loja || undefined,
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.get('/reajustes', async (req, res) => {
  try {
    res.json(await reajusteDespesas(req.usuario.empresa_id, {
      iniA: req.query.iniA, fimA: req.query.fimA, iniB: req.query.iniB, fimB: req.query.fimB,
      lojaId: req.query.loja || undefined, minVar: Number(req.query.minVar) || 5,
    }));
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// ── Orçamento projetado × realizado ─────────────────────────────────────
router.get('/orcamento', async (req, res) => {
  try { res.json(await getOrcamento(req.usuario.empresa_id, Number(req.query.ano) || new Date().getFullYear(), req.query.loja || undefined)); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.put('/orcamento', (req, res) => {
  res.json(salvarOrc(req.usuario.empresa_id, req.body.loja, Number(req.body.ano), req.body.cells || []));
});

router.post('/orcamento/gerar', async (req, res) => {
  try { res.json(await gerarOrc(req.usuario.empresa_id, req.body.loja, Number(req.body.ano), req.body)); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

router.post('/orcamento/distribuir-grupo', async (req, res) => {
  try { res.json(await distribuirGrupo(req.usuario.empresa_id, req.body.loja, Number(req.body.ano), req.body)); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Rateio de planos entre lojas
router.get('/orcamento/rateio', (req, res) => res.json({ rateio: getRateio(req.usuario.empresa_id), lojas: require('../lib/escopoCompras').lojasEmpresa(req.usuario.empresa_id) }));
router.put('/orcamento/rateio', (req, res) => res.json(setRateio(req.usuario.empresa_id, req.body.chave, req.body)));
router.post('/orcamento/ratear', async (req, res) => {
  try { res.json(await ratear(req.usuario.empresa_id, Number(req.body.ano), req.body)); }
  catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});
// Justificativas de desvio do orçamento (Acompanhamento): por loja/ano/mês/grupo. mes 0 = ano acumulado.
router.get('/orcamento/justificativas', (req, res) => {
  const emp = req.usuario.empresa_id;
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const loja = req.query.loja || '';
  const rows = db.prepare('SELECT grupo, mes, texto, autor, atualizado_em FROM orcamento_justificativa WHERE empresa_id=? AND loja_id=? AND ano=?').all(emp, loja, ano);
  const map = {};
  rows.forEach(r => { map[r.grupo + '|' + r.mes] = { texto: r.texto, autor: r.autor, atualizado_em: r.atualizado_em }; });
  res.json({ justificativas: map });
});
router.post('/orcamento/justificativa', (req, res) => {
  const emp = req.usuario.empresa_id;
  const { loja, ano, mes, grupo, texto } = req.body || {};
  if (!grupo || ano == null || mes == null) return res.status(400).json({ erro: 'ano, mes e grupo obrigatórios.' });
  const lojaId = loja || '';
  const autor = req.usuario.nome || req.usuario.funcao_nome || '—';
  if (!String(texto || '').trim()) {
    db.prepare('DELETE FROM orcamento_justificativa WHERE empresa_id=? AND loja_id=? AND ano=? AND mes=? AND grupo=?').run(emp, lojaId, Number(ano), Number(mes), grupo);
    return res.json({ ok: true, removido: true });
  }
  db.prepare(`INSERT INTO orcamento_justificativa (empresa_id, loja_id, ano, mes, grupo, texto, autor, atualizado_em)
    VALUES (?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, loja_id, ano, mes, grupo) DO UPDATE SET texto=excluded.texto, autor=excluded.autor, atualizado_em=excluded.atualizado_em`)
    .run(emp, lojaId, Number(ano), Number(mes), grupo, String(texto).trim(), autor);
  res.json({ ok: true });
});

// ── Aba "Contas a pagar" do Gerencial ──────────────────────────────────────
const _mesIniFim = q => {
  const h = new Date();
  const ini = q.ini || `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = q.fim || (h.getMonth() === 11 ? `${h.getFullYear() + 1}-01-01` : `${h.getFullYear()}-${String(h.getMonth() + 2).padStart(2, '0')}-01`);
  return { ini, fim };
};
router.get('/contas-pagar-aberto', async (req, res) => {
  try { res.json(await contasPagarAberto(req.usuario.empresa_id, { lojaId: req.query.loja })); } catch (e) { res.status(502).json({ erro: 'ERP: ' + e.message }); }
});
router.get('/lancamentos-sem-plano', async (req, res) => {
  const { ini, fim } = _mesIniFim(req.query);
  try { res.json(await lancamentosSemPlano(req.usuario.empresa_id, { lojaId: req.query.loja, ini, fim })); } catch (e) { res.status(502).json({ erro: 'ERP: ' + e.message }); }
});
router.get('/creditos-devolucao', async (req, res) => {
  try { res.json(await creditosDevolucao(req.usuario.empresa_id, { lojaId: req.query.loja })); } catch (e) { res.status(502).json({ erro: 'ERP: ' + e.message }); }
});

// Comparativo de LOJAS (Eficiência de loja): faturamento × colaboradores, CMV%, margem, resultado líquido.
router.get('/comparativo-lojas', async (req, res) => {
  const emp = req.usuario.empresa_id;
  const ano = Number(req.query.ano) || new Date().getFullYear();
  // Divisor p/ transformar valor ANUAL (YTD) em média MENSAL. No ano corrente usa os meses decorridos
  // (senão /12 subestima ~mês incompleto); em ano fechado, 12.
  const mesesAno = ano === new Date().getFullYear() ? (new Date().getMonth() + 1) : 12;
  const lojas = lojasEmpresa(emp);
  const colMap = {};
  try { db.prepare("SELECT loja_id, COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1 GROUP BY loja_id").all(emp).forEach(r => { if (r.loja_id) colMap[r.loja_id] = r.n; }); } catch (e) { /* */ }
  const estagMap = {};
  try { db.prepare("SELECT loja, COUNT(*) n FROM estagio_ficha WHERE empresa_id=? AND status='ativo' GROUP BY loja").all(emp).forEach(r => { if (r.loja) estagMap[r.loja] = r.n; }); } catch (e) { /* */ }
  const lojaM2Map = {}; // m² da área de vendas por loja (cadastro) — p/ vendas por m² (Bulla)
  try { db.prepare("SELECT id, area_m2 FROM lojas WHERE empresa_id=? AND area_m2 IS NOT NULL").all(emp).forEach(r => { lojaM2Map[r.id] = Number(r.area_m2) || 0; }); } catch (e) { /* */ }
  const s = a => (a || []).reduce((x, y) => x + y, 0);
  const { erpQuery, habilitado } = require('../db/erp');

  // 2ª fatia (Joe 2026-11-14): ticket médio, cupons, clientes (1 query em venda) + imposto (deduções do
  // DRE) + erros de caixa (quebras da Tesouraria agregadas por loja). Entrega e melhores vendedores ficam
  // numa 3ª fatia (mais pesados).
  const iniAno = `${ano}-01-01`, fimAno = `${ano + 1}-01-01`;
  const uni2loja = {}; const unisAll = [];
  lojas.forEach(l => { const u = Number(l.erp_unidadenegocio_id); if (u) { uni2loja[u] = l.id; unisAll.push(u); } });
  // PMR/PMP (Bulla): crediário em aberto, vendas a crédito ano, contas a pagar em aberto, compras ano (NF entrada).
  // (Precisa de unisAll/iniAno/uni2loja já definidos acima — por isso vem AQUI, não antes.)
  const crMap = {}, vcMap = {}, cpMap = {}, compMap = {};
  if (habilitado() && unisAll.length) {
    try {
      // só crediário RECENTE (vencido no máx. ~12 meses) — o de anos atrás (perdido/SPC) distorce o PMR (Joe).
      (await erpQuery(`SELECT unidadenegocioid uni, sum(valor)::float8 s FROM crediarioreceber WHERE unidadenegocioid=ANY($1::bigint[]) AND status<>'C' AND datavencimento >= (CURRENT_DATE - interval '12 months') GROUP BY 1`, [unisAll])).forEach(x => { const l = uni2loja[Number(x.uni)]; if (l) crMap[l] = Number(x.s) || 0; });
      (await erpQuery(`SELECT pv.unidadenegocioid uni, sum(pv.valor)::float8 v FROM pagamentovenda pv JOIN venda v ON v.id=pv.vendaid JOIN formapagamento fp ON fp.id=pv.formapagamentoid WHERE v.status='F' AND pv.unidadenegocioid=ANY($1::bigint[]) AND fp.nome ILIKE '%credi%' AND pv.datahora >= $2::date AND pv.datahora < $3::date GROUP BY 1`, [unisAll, iniAno, fimAno])).forEach(x => { const l = uni2loja[Number(x.uni)]; if (l) vcMap[l] = Number(x.v) || 0; });
      (await erpQuery(`SELECT unidadenegocioid uni, sum(COALESCE(valor,valordocumento,0))::float8 s FROM contapagar WHERE unidadenegocioid=ANY($1::bigint[]) AND status='A' GROUP BY 1`, [unisAll])).forEach(x => { const l = uni2loja[Number(x.uni)]; if (l) cpMap[l] = Number(x.s) || 0; });
      (await erpQuery(`SELECT unidadenegocioid uni, sum(valortotal)::float8 v FROM notafiscal WHERE tipooperacao='1' AND status NOT IN ('X','E') AND unidadenegocioid=ANY($1::bigint[]) AND datahoraentrada >= $2::date AND datahoraentrada < $3::date GROUP BY 1`, [unisAll, iniAno, fimAno])).forEach(x => { const l = uni2loja[Number(x.uni)]; if (l) compMap[l] = Number(x.v) || 0; });
    } catch (e) { /* segue sem PMR/PMP */ }
  }
  const vendaMap = {};
  if (habilitado() && unisAll.length) {
    try {
      const rv = await erpQuery(`SELECT unidadenegocioid uni, count(*) cupons, count(distinct pessoaid) clientes, sum(valortotal) total
        FROM venda WHERE status='F' AND unidadenegocioid = ANY($1::bigint[]) AND datahorafechamento >= $2::date AND datahorafechamento < $3::date
        GROUP BY 1`, [unisAll, iniAno, fimAno]);
      rv.forEach(x => { const lid = uni2loja[Number(x.uni)]; if (lid) vendaMap[lid] = { cupons: Number(x.cupons) || 0, clientes: Number(x.clientes) || 0, total: Number(x.total) || 0 }; });
    } catch (e) { /* ERP indisponível — segue sem ticket/cupons */ }
  }
  // DESCONTO (sobre tabela) por loja — soma de itemvenda.valordesconto. Indicador de eficiência de preço.
  const descMap = {};
  if (habilitado() && unisAll.length) {
    try {
      const rd = await erpQuery(`SELECT v.unidadenegocioid uni, sum(iv.valordesconto) desconto
        FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid
        WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND v.datahorafechamento >= $2::date AND v.datahorafechamento < $3::date
        GROUP BY 1`, [unisAll, iniAno, fimAno]);
      rd.forEach(x => { const lid = uni2loja[Number(x.uni)]; if (lid) descMap[lid] = Number(x.desconto) || 0; });
    } catch (e) { /* segue sem desconto */ }
  }
  const errosMap = {};
  try {
    const q = await require('../lib/tesourariaErp').quebras(emp, { ini: iniAno, fim: `${ano}-12-31` });
    (q.quebras || []).forEach(it => { const lid = it.lojaId; if (!lid) return; (errosMap[lid] = errosMap[lid] || { n: 0, valor: 0 }); errosMap[lid].n++; errosMap[lid].valor += Math.abs(Number(it.valor) || 0); });
  } catch (e) { /* segue sem erros de caixa */ }

  // 3ª fatia: entrega (entregas finalizadas + tempo médio, por unidade) e melhor vendedor por loja.
  const entregaMap = {};
  if (habilitado() && unisAll.length) {
    try {
      const re = await erpQuery(`SELECT r.unidadenegocioid uni,
          count(DISTINCT e.id) FILTER (WHERE e.status='F') entregas,
          round(avg(extract(epoch FROM (e.datahorafinal-e.datahorainicial))/60) FILTER (WHERE e.status='F' AND e.datahorafinal IS NOT NULL)::numeric,0) tempo
        FROM entrega e JOIN entregaremessa er ON er.entregaid=e.id JOIN remessa r ON r.id=er.remessaid
        WHERE e.datahorainicial >= $2::date AND e.datahorainicial < $3::date AND r.unidadenegocioid = ANY($1::bigint[])
        GROUP BY 1`, [unisAll, iniAno, fimAno]);
      re.forEach(x => { const lid = uni2loja[Number(x.uni)]; if (lid) entregaMap[lid] = { entregas: Number(x.entregas) || 0, tempo: Number(x.tempo) || 0 }; });
    } catch (e) { /* segue sem entrega */ }
  }
  const vendMap = {};
  try {
    const vc = await vendaPorColaborador(emp, { ano });
    (vc.lojas || []).forEach(x => { const lid = uni2loja[Number(x.lojaId)]; const top = (x.vendedores || [])[0]; if (lid && top) vendMap[lid] = { nome: top.nome, venda: top.venda }; });
  } catch (e) { /* segue sem vendedor */ }

  // DREs em SÉRIE (1 por vez). Paralelizar com Promise.all causava thrashing do failover de usuário
  // do ERP (recria o pool a cada query concorrente que falha) e TRAVAVA a tela. Série é estável.
  const out = [];
  for (const l of lojas) {
    let faturamento = 0, cmv = 0, resultado = 0, despesas = 0, imposto = 0, pessoalAno = 0, erp = true;
    try { const d = await dre(emp, { ano, lojaId: l.id }); if (d && d.ok !== false) { faturamento = s(d.receitaBruta); cmv = s(d.cmv); resultado = s(d.resultado); despesas = s(d.despOperTotal); imposto = s(d.deducoes);
      const gp = (d.despOperGrupos || []).find(g => /pessoal/i.test(g.grupo || g.nome || '')); pessoalAno = gp ? Math.abs(s(gp.valores) || Number(gp.valor) || 0) : 0; } else erp = false; } catch (e) { erp = false; }
    const col = colMap[l.id] || 0;
    const vm = vendaMap[l.id] || {}; const em = errosMap[l.id] || {}; const entm = entregaMap[l.id] || {}; const tv = vendMap[l.id] || {};
    // Escritório fica (tem despesas/resultado lançados). Mas índices por faturamento viram null quando não há venda.
    const estag = estagMap[l.id] || 0;
    out.push({ loja_id: l.id, loja: l.nome, faturamento: Math.round(faturamento), colaboradores: col, estagiarios: estag,
      fat_colab: (col && faturamento) ? Math.round(faturamento / col) : null,
      cmv_pct: faturamento ? Math.round(cmv / faturamento * 1000) / 10 : null,
      desp_pct: faturamento ? Math.round(despesas / faturamento * 1000) / 10 : null,
      margem_pct: faturamento ? Math.round(resultado / faturamento * 1000) / 10 : null,
      imposto: Math.round(imposto), imposto_pct: faturamento ? Math.round(imposto / faturamento * 1000) / 10 : null,
      desconto: Math.round(descMap[l.id] || 0), desconto_pct: (faturamento + (descMap[l.id] || 0)) ? Math.round((descMap[l.id] || 0) / (faturamento + (descMap[l.id] || 0)) * 1000) / 10 : null,
      // Bulla (indicadores de atividade):
      ponto_equilibrio: (faturamento && faturamento > cmv) ? Math.round(despesas / ((faturamento - cmv) / faturamento) / mesesAno) : null,
      custo_medio_func: col ? Math.round(pessoalAno / mesesAno / col) : null, // folha (DRE Despesas com Pessoal) mensal ÷ nº func
      // Produtividade/func (Bulla) = venda líquida mensal ÷ nº funcionários
      produtividade_func: (col && faturamento) ? Math.round(faturamento / mesesAno / col) : null,
      // Rentabilidade/func (R$/mês) = produtividade (venda mês/func) × lucro bruto% − custo médio/func
      rentabilidade_func: (col && faturamento) ? Math.round((faturamento / mesesAno / col) * ((faturamento - cmv) / faturamento) - pessoalAno / mesesAno / col) : null,
      vendas_m2: (lojaM2Map[l.id] && faturamento) ? Math.round(faturamento / mesesAno / lojaM2Map[l.id]) : null, // venda mês ÷ m²
      // Capital de giro (Bulla) = pagamento médio a fornecedores (mês) + despesas médias (mês) ÷ 2
      capital_giro: faturamento ? Math.round((compMap[l.id] || 0) / mesesAno + (despesas / mesesAno) / 2) : null,
      // Bulla posicionamento: PMR = crediário aberto × 360 ÷ vendas a crédito ano; PMP idem compras; relativo PMR/PMP (<1 bom).
      pmr: vcMap[l.id] ? Math.round((crMap[l.id] || 0) * 360 / vcMap[l.id]) : null,
      pmp: compMap[l.id] ? Math.round((cpMap[l.id] || 0) * 360 / compMap[l.id]) : null,
      posicionamento: (vcMap[l.id] && cpMap[l.id] && compMap[l.id]) ? Math.round(((crMap[l.id] || 0) * 360 / vcMap[l.id]) / ((cpMap[l.id] || 0) * 360 / compMap[l.id]) * 100) / 100 : null,
      cupons: vm.cupons || null, clientes: vm.clientes || null,
      ticket: vm.cupons ? Math.round(vm.total / vm.cupons * 100) / 100 : null,
      erros_caixa: em.n || 0, erros_valor: Math.round(em.valor || 0),
      entregas: entm.entregas || 0, entrega_tempo: entm.tempo || null,
      top_vendedor: tv.nome || null, top_vendedor_venda: tv.venda || null,
      resultado: Math.round(resultado), erp });
  }
  out.sort((a, b) => b.resultado - a.resultado);
  res.json({ ano, lojas: out, mercado: lerMercado(emp) });
});

// Eficiência de ESTOQUE por loja (valor, cobertura, ruptura, curva ABC, excesso, produtos parados).
router.get('/eficiencia-estoque', async (req, res) => {
  const emp = req.usuario.empresa_id;
  const { indicadoresEstoque } = require('../lib/indicadoresCompraErp');
  const lojas = lojasEmpresa(emp);
  // Tempo médio de ENTRADA de mercadoria (dias da emissão da NF até dar entrada no sistema), por loja.
  const { erpQuery: eq, habilitado: hab } = require('../db/erp');
  const { unisEmpresa: ue } = require('../lib/escopoCompras');
  const tempoMap = {};
  if (hab()) {
    try {
      const uni2 = {}; const unisT = [];
      lojas.forEach(l => { const u = Number(l.erp_unidadenegocio_id); if (u) { uni2[u] = l.id; unisT.push(u); } });
      const anoT = Number(req.query.ano) || new Date().getFullYear();
      const rt = await eq(`SELECT nf.unidadenegocioid uni, round(avg(EXTRACT(epoch FROM (nf.datahoraentrada - nf.datahoraemissao))/86400)::numeric,1) dias
        FROM notafiscal nf WHERE nf.tipooperacao='1' AND nf.status NOT IN ('X','E') AND nf.unidadenegocioid = ANY($1::bigint[])
          AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < $3::date AND nf.datahoraemissao IS NOT NULL AND nf.datahoraentrada >= nf.datahoraemissao
        GROUP BY 1`, [unisT, `${anoT}-01-01`, `${anoT + 1}-01-01`]);
      rt.forEach(x => { const lid = uni2[Number(x.uni)]; if (lid) tempoMap[lid] = Number(x.dias); });
    } catch (e) { /* segue sem tempo de entrada */ }
  }
  const out = [];
  for (const l of lojas) {
    try {
      const r = await indicadoresEstoque(emp, { lojaId: l.id });
      if (!r || r.erp === false) { out.push({ loja_id: l.id, loja: l.nome, erp: false }); continue; }
      const abc = r.curvaABC || {}; const totVal = ['A', 'B', 'C', 'D'].reduce((a, k) => a + (abc[k]?.valor || 0), 0) || 1;
      const pct = k => Math.round((abc[k]?.valor || 0) / totVal * 1000) / 10;
      out.push({
        loja_id: l.id, loja: l.nome, erp: true,
        valor_estoque: Math.round(r.estoque?.valor || 0), posicoes: r.estoque?.posicoes || 0,
        cobertura_dias: r.cobertura?.dias ?? null, cobertura_sem: r.cobertura?.semaforo || null,
        ruptura_pct: r.ruptura?.pct ?? null, ruptura_sem: r.ruptura?.semaforo || null,
        excesso: Math.round(r.orcamentoEstoque?.excesso || 0), falta: Math.round(r.orcamentoEstoque?.falta || 0),
        abc_a_pct: pct('A'), abc_b_pct: pct('B'), abc_c_pct: pct('C'), abc_d_pct: pct('D'),
        abc_a_n: abc.A?.n || 0, abc_d_n: abc.D?.n || 0, // D = sem venda (parado)
        parados_valor: Math.round(r.produtosNovos?.valorParado || 0), parados_n: r.produtosNovos?.parados || 0,
        tempo_entrada: tempoMap[l.id] ?? null,
        giro: (r.cobertura?.dias) ? Math.round(365 / r.cobertura.dias * 10) / 10 : null, // Bulla: giro = 365/cobertura (vezes/ano)
      });
    } catch (e) { out.push({ loja_id: l.id, loja: l.nome, erp: false }); }
  }
  res.json({ lojas: out });
});

// % ideal que o mercado sugere, por indicador (cadastrável) — ex.: { cmv_pct: 70, margem_pct: 5, ... }.
function lerMercado(emp) {
  try { const r = db.prepare("SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='eficiencia_mercado'").get(emp); return r ? (JSON.parse(r.valor) || {}) : {}; } catch { return {}; }
}
router.get('/eficiencia-mercado', (req, res) => res.json({ mercado: lerMercado(req.usuario.empresa_id) }));
router.put('/eficiencia-mercado', (req, res) => {
  const emp = req.usuario.empresa_id;
  const m = req.body.mercado || {};
  const limpo = {};
  for (const [k, v] of Object.entries(m)) { const n = Number(v); if (Number.isFinite(n)) limpo[k] = n; }
  db.prepare(`INSERT INTO configuracoes (empresa_id, chave, valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET valor=excluded.valor`).run(emp, 'eficiencia_mercado', JSON.stringify(limpo));
  res.json({ ok: true, mercado: limpo });
});

module.exports = router;
