// Helpers compartilhados de vendedor: pesos, metas, realizado por indicador e a
// "fotografia" do vendedor no período (vendido, meta, nota, premiações).
// Usado por routes/vendas.js e routes/painel.js — mantém a MESMA lógica de premiação
// no ranking, na premiação da equipe (supervisor) e no painel do gerente.
const db = require('../db/connection');
const calc = require('./calculosVendas');
const vendasErp = require('./vendasErp');
const indicadoresErp = require('./indicadoresErp');
const trivioPdv = require('./trivioPdv');

// Carrega pesos dos indicadores do vendedor (config por empresa)
function pesosVendedor(empresaId) {
  return db.prepare(`
    SELECT indicador, label, peso, ordem FROM config_indicadores
    WHERE empresa_id = ? AND funcao_id = 'func-vendedor' AND ativo = 1
    ORDER BY ordem
  `).all(empresaId);
}

// Meta do indicador no escopo 'colaborador' (igual para todos) — usada na avaliação automática
function metaColaboradorInd(empresaId, lojaId, indicador, mes, ano) {
  return db.prepare(`SELECT meta_valor FROM indicador_metas WHERE empresa_id=? AND loja_id=? AND indicador=? AND mes=? AND ano=? AND escopo='colaborador'`)
    .get(empresaId, lojaId, indicador, mes, ano)?.meta_valor;
}

// Realizado do mês de um colaborador num indicador.
// Vitaminas, Identificação, PBM e Campanhas vêm AUTOMÁTICOS do ERP (cache pré-aquecido pela rota);
// os demais indicadores (Pdv+) continuam manuais (indicador_lancamentos).
function realizadoInd(empresaId, colaboradorId, indicador, mes, ano) {
  if (indicadoresErp.INDICADORES_ERP.has(indicador)) {
    const col = db.prepare('SELECT loja_id FROM colaboradores WHERE id=?').get(colaboradorId);
    const v = col && indicadoresErp.indicadorVendedorSync(col.loja_id, mes, ano, colaboradorId, indicador);
    if (v !== undefined && v !== null && v !== false) return v;
  }
  // PDV+ (Taxa de Conversão de sugestões) vem AUTOMÁTICO da Trivio (cache pré-aquecido pela rota)
  if (indicador === 'cadastro') {
    const v = trivioPdv.pdvConversaoSync(colaboradorId, mes, ano);
    if (v !== null && v !== undefined) return v;
  }
  return db.prepare(`SELECT COALESCE(SUM(valor),0) v FROM indicador_lancamentos WHERE empresa_id=? AND colaborador_id=? AND indicador=? AND mes=? AND ano=?`)
    .get(empresaId, colaboradorId, indicador, mes, ano).v;
}

// Ratios (0–1) por indicador a partir de realizado÷meta (avaliação proporcional automática)
function ratiosIndicadores(empresaId, lojaId, colaboradorId, mes, ano) {
  const overrides = {};
  for (const c of pesosVendedor(empresaId)) {
    const meta = metaColaboradorInd(empresaId, lojaId, c.indicador, mes, ano);
    // indicador normal sem meta não pontua; invertido (encomendas) usa teto padrão
    if (!meta && !calc.INDICADORES_INVERTIDOS.has(c.indicador)) continue;
    const real = realizadoInd(empresaId, colaboradorId, c.indicador, mes, ano);
    const r = calc.ratioIndicador(c.indicador, real, meta);
    if (r != null) overrides[c.indicador] = r;
  }
  return overrides;
}

// Faixas de premiação de vitaminas cadastradas (R$/un por quantidade). Vazio → usa padrão.
function faixasVitaminas(empresaId) {
  return db.prepare('SELECT min_un AS min, valor FROM premiacao_vitaminas WHERE empresa_id=? ORDER BY min_un').all(empresaId);
}

// Monta a fotografia de um vendedor no período (vendido, meta, nota, premiações)
function fotoVendedor(empresaId, lojaId, mes, ano, vendedor, somaPesos, metaLoja, pesos) {
  const faixasVit = faixasVitaminas(empresaId);
  const cfgPrem = require('./premiacaoConfig').getVendedor(empresaId);
  // Vendido AO VIVO do ERP (cache pré-aquecido pela rota); fallback: tabela local.
  const vendido = vendasErp.totalVendedorMesSync(vendedor.colaborador_id, mes, ano);

  // dias não úteis (feriados/fechados) definidos pela supervisão, para a divisão diária
  const feriados = db.prepare(`SELECT data FROM dias_nao_uteis WHERE empresa_id=? AND loja_id=?
    AND CAST(strftime('%m', data) AS INTEGER)=? AND CAST(strftime('%Y', data) AS INTEGER)=?`)
    .all(empresaId, lojaId, mes, ano).map(r => r.data);

  const meta = calc.metaIndividual(metaLoja, vendedor.peso, somaPesos);
  const superMeta = Math.round(meta * 1.05);
  const pctMeta = calc.pct(vendido, meta);
  const pctSuper = calc.pct(vendido, superMeta);

  // Indicadores do mês
  const indRows = db.prepare(`
    SELECT indicador, avaliacao, valor_num FROM indicadores_vendedor
    WHERE colaborador_id = ? AND mes = ? AND ano = ?
  `).all(vendedor.colaborador_id, mes, ano);
  const avaliacoes = {};
  let vitUnid = 0;
  indRows.forEach(r => { avaliacoes[r.indicador] = r.avaliacao; if (r.indicador === 'vitaminas') vitUnid = r.valor_num; });
  // Unidades de vitaminas para a premiação: usa o ERP (cache pré-aquecido) quando disponível.
  const vitErp = indicadoresErp.indicadorVendedorSync(lojaId, mes, ano, vendedor.colaborador_id, 'vitaminas');
  if (vitErp !== undefined && vitErp !== null) vitUnid = vitErp;
  const overridesInd = ratiosIndicadores(empresaId, lojaId, vendedor.colaborador_id, mes, ano);
  const nota = calc.calcNotaIndicadores(avaliacoes, pesos, overridesInd);

  const conquistas = db.prepare(`SELECT COUNT(*) as n FROM certificados WHERE colaborador_id = ?`).get(vendedor.colaborador_id).n;

  return {
    colaborador_id: vendedor.colaborador_id,
    nome: vendedor.nome,
    peso: vendedor.peso,
    vendido,
    meta,
    super_meta: superMeta,
    falta_meta: Math.max(0, meta - vendido),
    pct_meta: pctMeta,
    pct_super: pctSuper,
    ritmo_meta_dia: calc.ritmoPonderado(meta, vendido, mes, ano, feriados),
    ritmo_super_dia: calc.ritmoPonderado(superMeta, vendido, mes, ano, feriados),
    nota_indicadores: nota,
    indicadores_ok: calc.indicadoresOk(avaliacoes),
    avaliacoes,
    vitaminas_unidades: vitUnid,
    premiacao_pct: calc.premiacaoVendas(pctMeta, pctSuper, nota, cfgPrem),
    premiacao_vitamina_un: calc.premiacaoVitaminas(vitUnid, faixasVit),
    premiacao_vitamina_total: calc.premiacaoVitaminas(vitUnid, faixasVit) * vitUnid,
    conquistas,
  };
}

// Remove só os VALORES TOTAIS da meta (vendedor vê % e "quanto vender hoje", nunca o total)
function ocultarValores(foto) {
  const { meta, super_meta, falta_meta, ...resto } = foto;
  return { ...resto, valores_ocultos: true };
}

// Carrega vendedores de uma loja com seus pesos (da tabela metas, tipo 'auto')
function vendedoresDaLoja(empresaId, lojaId, mes, ano) {
  return db.prepare(`
    SELECT c.id as colaborador_id, c.nome, COALESCE(m.peso, 1.0) as peso
    FROM colaboradores c
    LEFT JOIN metas m ON m.colaborador_id = c.id AND m.mes = ? AND m.ano = ? AND m.loja_id = ?
    WHERE c.empresa_id = ? AND c.loja_id = ? AND c.funcao_id = 'func-vendedor' AND c.ativo = 1
    ORDER BY c.nome
  `).all(mes, ano, lojaId, empresaId, lojaId);
}

function metaLojaDoPeriodo(empresaId, lojaId, mes, ano) {
  const m = db.prepare(`
    SELECT valor_meta, valor_super_meta, status_aprovacao FROM metas
    WHERE empresa_id = ? AND loja_id = ? AND colaborador_id IS NULL AND mes = ? AND ano = ?
    ORDER BY criado_em DESC LIMIT 1
  `).get(empresaId, lojaId, mes, ano);
  return m || null;
}

module.exports = {
  pesosVendedor, metaColaboradorInd, realizadoInd, ratiosIndicadores,
  faixasVitaminas, fotoVendedor, ocultarValores, vendedoresDaLoja, metaLojaDoPeriodo,
};
