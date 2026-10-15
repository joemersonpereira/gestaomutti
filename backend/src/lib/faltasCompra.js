// faltasCompra.js — correlaciona a Lista de Faltas (lançada pela loja) com o comprador responsável,
// para cobrar quem deixa faltar. Cada falta é atribuída ao comprador dono do produto (classificação/grupo).
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { filtroProdutosComprador, clausulaProdutos } = require('./comprasErp');
const { metaVals } = require('./metasCompra');

const nomeLoja = id => (db.prepare('SELECT nome FROM lojas WHERE id=?').get(id) || {}).nome || '—';

// Conjunto de produtoids de um comprador (via vínculo de classificação/grupo).
async function prodSetComprador(empresaId, compradorId) {
  const filtro = await filtroProdutosComprador(empresaId, compradorId);
  if (!filtro) return new Set();
  const { expr, params } = clausulaProdutos(filtro, 'p');
  const rows = await erpQuery(`SELECT p.id FROM produto p WHERE p.status='A' AND ${expr}`, params);
  return new Set(rows.map(r => Number(r.id)));
}

// Lista de compradores (colaboradores função Comprador%) com seus conjuntos de produto.
async function mapaCompradores(empresaId) {
  const rows = db.prepare(`SELECT c.id, c.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.nome LIKE 'Comprador%' ORDER BY c.nome`).all(empresaId);
  const out = [];
  for (const c of rows) out.push({ id: c.id, nome: c.nome, prods: habilitado() ? await prodSetComprador(empresaId, c.id) : new Set() });
  return out;
}

async function faltasComprador(empresaId, { lojaId, compradorId } = {}) {
  const m = metaVals(empresaId);
  const slaDias = m.falta_dias_atender || 3;
  // Faltas pendentes + as tratadas nos últimos 60 dias (p/ tempo médio de atendimento).
  const where = ['empresa_id=?']; const args = [empresaId];
  if (lojaId) { where.push('loja_id=?'); args.push(lojaId); }
  const faltas = db.prepare(`SELECT * FROM lista_faltas WHERE ${where.join(' AND ')}
    AND (status IN ('aberta','em_pedido') OR (status='entregue' AND atualizado_em >= datetime('now','-60 days')))
    ORDER BY criado_em ASC`).all(...args);

  const compradores = await mapaCompradores(empresaId);
  const donoDe = pid => { for (const c of compradores) if (pid && c.prods.has(Number(pid))) return c; return null; };

  // Classificação (principal) por produto — em lote do ERP, p/ filtrar/ordenar no painel.
  let classMap = new Map();
  const pids = [...new Set(faltas.map(f => Number(f.produto_id)).filter(Boolean))];
  if (pids.length && habilitado()) {
    try {
      const rows = await erpQuery(`SELECT DISTINCT ON (cp.produtoid) cp.produtoid, cl.nome
        FROM classificacaoproduto cp JOIN classificacao cl ON cl.id=cp.classificacaoid
        WHERE cp.produtoid = ANY($1::bigint[]) AND cl.principal=true ORDER BY cp.produtoid, cl.profundidade DESC`, [pids]);
      classMap = new Map(rows.map(r => [Number(r.produtoid), r.nome]));
    } catch { /* ERP indisponível — segue sem classificação */ }
  }

  const agora = Date.now();
  const idade = c => Math.floor((agora - new Date((c + 'Z').replace(' ', 'T')).getTime()) / 86400000);
  let itens = faltas.map(f => {
    const dono = donoDe(f.produto_id);
    const dias = idade(f.criado_em);
    const pendente = f.status === 'aberta' || f.status === 'em_pedido';
    return {
      id: f.id, descricao: f.descricao, ean: f.ean, marca: f.marca, quantidade: f.quantidade,
      classificacao: classMap.get(Number(f.produto_id)) || null,
      loja: nomeLoja(f.loja_id), lojaId: f.loja_id, lancadaPor: f.colaborador_nome,
      status: f.status, criadoEm: f.criado_em, dias,
      compradorId: dono ? dono.id : null, comprador: dono ? dono.nome : null,
      pendente, atrasada: pendente && dias > slaDias,
    };
  });
  if (compradorId) itens = itens.filter(i => i.compradorId === compradorId);

  const pend = itens.filter(i => i.pendente);
  const entregues = itens.filter(i => i.status === 'entregue');
  const tempos = entregues.map(i => i.dias).filter(d => d >= 0);
  const resumo = {
    abertas: pend.length,
    atrasadas: pend.filter(i => i.atrasada).length,
    semDono: pend.filter(i => !i.compradorId).length,
    slaDias,
    tempoMedio: tempos.length ? Math.round(tempos.reduce((a, v) => a + v, 0) / tempos.length) : null,
    atendidasPct: (pend.length + entregues.length) ? Math.round(entregues.length / (pend.length + entregues.length) * 100) : null,
    meta: m.falta_atendimento_meta,
  };
  resumo.semaforo = !pend.length ? 'verde' : resumo.atrasadas === 0 ? 'verde' : resumo.atrasadas <= pend.length * 0.2 ? 'amarelo' : 'vermelho';

  // Ranking por comprador (só pendentes).
  const porComprador = {};
  for (const i of pend) {
    const k = i.comprador || '— sem comprador vinculado';
    if (!porComprador[k]) porComprador[k] = { comprador: k, abertas: 0, atrasadas: 0 };
    porComprador[k].abertas++; if (i.atrasada) porComprador[k].atrasadas++;
  }
  return {
    resumo,
    porComprador: Object.values(porComprador).sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas),
    itens: itens.filter(i => i.pendente).slice(0, 300),
  };
}

module.exports = { faltasComprador };
