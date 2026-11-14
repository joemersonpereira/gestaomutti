// comprasSimplesErp.js — Compra de fornecedor do SIMPLES NACIONAL / MEI por comprador.
// Mutti é Lucro Real: comprar do Simples dá menos crédito tributário (custo efetivo maior). Isto vira
// indicador do comprador — e pode ser PERDOADO por mês/fornecedor se ele comprovar desconto compensatório.
// Cruza compra do ERP (por CNPJ) com o regime cadastrado (fornecedor_regime, SQLite) — o ERP é só leitura.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const { filtroProdutosComprador, clausulaProdutos } = require('./comprasErp');

async function prodIdsComprador(empresaId, compradorId) {
  if (!compradorId) return null;
  const filtro = await filtroProdutosComprador(empresaId, compradorId);
  if (!filtro) return [];
  const { expr, params } = clausulaProdutos(filtro, 'p');
  const rows = await erpQuery(`SELECT p.id FROM produto p WHERE p.status='A' AND ${expr}`, params);
  return rows.map(r => Number(r.id));
}

function periodoMes(ano, mes) {
  const a = Number(ano), m = Number(mes);
  const iso = d => d.toISOString().slice(0, 10);
  return { desde: iso(new Date(a, m - 1, 1)), ate: iso(new Date(a, m, 0)) };
}

// Compra por CNPJ (dos produtos do comprador) no mês. Retorna [{cnpj, razao, total}] + total geral.
async function comprasPorCnpj(unis, prodIds, per) {
  if (!prodIds || !prodIds.length) return [];
  const rows = await erpQuery(`
    WITH nf AS (
      SELECT n.id, n.fornecedorid,
        COALESCE(SUM(ii.valortotal) FILTER (WHERE em.produtoid = ANY($2::bigint[])),0)::float8 valor
      FROM notafiscal n
      JOIN itemnotafiscal ii ON ii.notafiscalid = n.id
      JOIN embalagem em ON em.id = ii.embalagemid
      WHERE n.unidadenegocioid = ANY($1::bigint[]) AND n.status NOT IN ('X','E')
        AND n.fornecedorid IS NOT NULL AND n.tipooperacao='1'
        AND n.datahoraentrada >= $3::date AND n.datahoraentrada < ($4::date + interval '1 day')
      GROUP BY n.id, n.fornecedorid)
    SELECT regexp_replace(p.cnpj,'\\D','','g') cnpj, p.nome razao, round(SUM(nf.valor)::numeric,2) total
    FROM nf JOIN fornecedor f ON f.id=nf.fornecedorid JOIN pessoa p ON p.id=f.pessoaid
    WHERE p.cnpj IS NOT NULL AND length(regexp_replace(p.cnpj,'\\D','','g'))=14
    GROUP BY p.cnpj, p.nome HAVING SUM(nf.valor) > 0
    ORDER BY total DESC`, [unis, prodIds, per.desde, per.ate]);
  return rows.map(r => ({ cnpj: r.cnpj, razao: (r.razao || '').trim(), total: Number(r.total) || 0 }));
}

function mapaRegime(emp) {
  const m = new Map();
  for (const r of db.prepare('SELECT cnpj, regime, opcao_simples, opcao_mei FROM fornecedor_regime WHERE empresa_id=?').all(emp)) m.set(r.cnpj, r);
  return m;
}
const ehSimples = r => r && (r.regime === 'Simples Nacional' || r.regime === 'MEI' || r.opcao_simples === 1);

// Alíquota de "crédito perdido" (%) que o contador calibra — base da estimativa do imposto pago a mais.
function getAliquota(emp) {
  const r = db.prepare('SELECT aliquota FROM compra_simples_config WHERE empresa_id=?').get(emp);
  return r ? Number(r.aliquota) || 0 : 0;
}
function setAliquota(emp, aliquota, usuario) {
  const a = Math.max(0, Math.min(100, Number(aliquota) || 0));
  db.prepare(`INSERT INTO compra_simples_config (empresa_id, aliquota, atualizado_em, atualizado_por)
    VALUES (?,?, datetime('now'), ?)
    ON CONFLICT(empresa_id) DO UPDATE SET aliquota=excluded.aliquota, atualizado_em=excluded.atualizado_em, atualizado_por=excluded.atualizado_por`)
    .run(emp, a, (usuario && usuario.nome) || null);
  return { ok: true, aliquota: a };
}

// Resumo do comprador no mês: total comprado, total do Simples (líquido do perdão) e % + lista de fornecedores.
async function comprasSimplesComprador(empresaId, { compradorId, ano, mes } = {}) {
  const now = new Date();
  ano = Number(ano) || now.getFullYear(); mes = Number(mes) || (now.getMonth() + 1);
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, null);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada ao ERP.' };
  const prodIds = await prodIdsComprador(empresaId, compradorId);
  if (!prodIds || !prodIds.length) return { erp: true, semComprador: true };
  const per = periodoMes(ano, mes);
  const porCnpj = await comprasPorCnpj(unis, prodIds, per);
  const reg = mapaRegime(empresaId);
  const perd = new Set(db.prepare('SELECT cnpj FROM compra_simples_perdao WHERE empresa_id=? AND (comprador_id=? OR comprador_id IS NULL) AND ano=? AND mes=?')
    .all(empresaId, compradorId || null, ano, mes).map(r => r.cnpj));
  const totalComprado = porCnpj.reduce((a, f) => a + f.total, 0);
  let simplesBruto = 0, simplesPerdoado = 0, naoClassif = 0;
  const fornecedores = [];
  for (const f of porCnpj) {
    const r = reg.get(f.cnpj);
    if (!r) { naoClassif += f.total; continue; }
    if (!ehSimples(r)) continue;
    const perdoado = perd.has(f.cnpj);
    simplesBruto += f.total; if (perdoado) simplesPerdoado += f.total;
    fornecedores.push({ cnpj: f.cnpj, razao: f.razao, total: f.total, regime: r.regime, perdoado });
  }
  const simplesLiquido = simplesBruto - simplesPerdoado;
  const aliquota = getAliquota(empresaId);
  return {
    erp: true, ano, mes,
    totalComprado: Math.round(totalComprado),
    simplesBruto: Math.round(simplesBruto), simplesPerdoado: Math.round(simplesPerdoado), simplesLiquido: Math.round(simplesLiquido),
    simplesPct: totalComprado > 0 ? Math.round(simplesLiquido / totalComprado * 1000) / 10 : 0,
    naoClassificado: Math.round(naoClassif),
    aliquota, // % de crédito perdido (calibrado pelo contador)
    impostoAMais: Math.round(simplesLiquido * aliquota / 100), // estimativa do imposto pago a mais
    fornecedores: fornecedores.sort((a, b) => b.total - a.total).map(f => ({ ...f, impostoAMais: f.perdoado ? 0 : Math.round(f.total * aliquota / 100) })),
  };
}

// Perdão (gestão): marca/retira o perdão de um fornecedor/competência pro comprador.
function definirPerdao(empresaId, { compradorId, cnpj, ano, mes, justificativa, perdoar, usuario } = {}) {
  const c = String(cnpj || '').replace(/\D/g, '');
  if (c.length !== 14) throw new Error('CNPJ inválido.');
  if (!ano || !mes) throw new Error('Informe ano e mês.');
  if (perdoar === false) {
    db.prepare('DELETE FROM compra_simples_perdao WHERE empresa_id=? AND IFNULL(comprador_id,\'\')=IFNULL(?,\'\') AND cnpj=? AND ano=? AND mes=?')
      .run(empresaId, compradorId || null, c, Number(ano), Number(mes));
    return { ok: true, perdoado: false };
  }
  db.prepare(`INSERT INTO compra_simples_perdao (empresa_id, comprador_id, cnpj, ano, mes, justificativa, perdoado_por)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(empresa_id, comprador_id, cnpj, ano, mes) DO UPDATE SET justificativa=excluded.justificativa, perdoado_por=excluded.perdoado_por, criado_em=datetime('now')`)
    .run(empresaId, compradorId || null, c, Number(ano), Number(mes), String(justificativa || '').slice(0, 500) || null, (usuario && usuario.nome) || null);
  return { ok: true, perdoado: true };
}

module.exports = { comprasSimplesComprador, definirPerdao, getAliquota, setAliquota };
