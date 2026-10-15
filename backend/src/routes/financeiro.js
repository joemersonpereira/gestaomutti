// financeiro.js — Módulo Financeiro (DFC/DRE base). Fatia 1: despesas por plano + drill + reajuste.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { lojasEmpresa } = require('../lib/escopoCompras');
const { dfcDespesas, lancamentosPlano, reajusteDespesas, fluxoCaixa, lancamentosGrupo, lancamentosLinha, lancamentosManuais, dre, confrontoDreDfc, representatividade, setBenchmark, vendaPorColaborador } = require('../lib/financeiroErp');
const { getOrcamento, salvar: salvarOrc, gerar: gerarOrc, distribuirGrupo, getRateio, setRateio, ratear } = require('../lib/orcamentoFinanceiro');
const dfcImport = require('../lib/dfcImport');

const GESTAO_FIN = ['Diretor Geral', 'Gestor Geral', 'Controladoria'];
router.use(auth);
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

module.exports = router;
