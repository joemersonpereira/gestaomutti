// formulasErp.js — controle de entrega de fórmulas manipuladas. Lê o crediário a receber do ERP
// (devedor "FORMULA%"), extrai cliente+telefone da observação, e junta o status local de entrega.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');

// Extrai cliente e telefone da observação (formato livre: "nome, telefone, forma" etc).
function parseObs(obs) {
  let o = (obs || '').replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
  // Remove CPF/CNPJ p/ não confundir com telefone.
  const semDoc = o.replace(/\b(CPF|CNPJ)\b[:\s]*[\d.\-\/]+/gi, ' ');
  // Telefone: exige DDD válido (11–99) e 10–11 dígitos; celular (11) tem 9 no 3º dígito. Evita CPF.
  let tel = null;
  for (const cand of semDoc.match(/\(?\d{2}\)?[\s-]?9?[\s-]?\d{4}[-\s]?\d{4}/g) || []) {
    const dg = cand.replace(/\D/g, '');
    if (dg.length < 10 || dg.length > 11) continue;
    const ddd = Number(dg.slice(0, 2));
    if (ddd < 11 || ddd > 99) continue;
    if (dg.length === 11 && dg[2] !== '9') continue;
    tel = cand.trim(); break;
  }
  // Cliente = primeiro pedaço (antes de vírgula), sem o CPF.
  let cliente = o.split(/[,\n]/)[0].replace(/\b(CPF|CNPJ)\b[:\s]*[\d.\-\/]+/gi, '').trim();
  return { cliente: cliente || null, telefone: tel };
}

async function listarFormulas(empresaId, { lojaId, dias = 30, status } = {}) {
  if (!habilitado()) return { formulas: [], erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { formulas: [], erp: true };
  const rows = await erpQuery(`
    SELECT cr.id, cr.dataemissao, cr.datavencimento, cr.valor, cr.observacao, cr.status, cr.unidadenegocioid uni,
      pf.nome formula,
      (SELECT p2.nome FROM usuario u JOIN pessoa p2 ON p2.id=u.pessoaid WHERE u.id=cr.usuarioid) lancou,
      cx.descricao caixa,
      (SELECT p3.nome FROM usuario u3 JOIN pessoa p3 ON p3.id=u3.pessoaid WHERE u3.id=rc.usuarioid) caixa_operador,
      rc.datahora recebido_em,
      (SELECT fp.nome FROM pagamentorecebimentocrediario prc JOIN formapagamento fp ON fp.id=prc.formapagamentoid
         WHERE prc.recebimentocrediarioid=cr.recebimentocrediarioid LIMIT 1) forma
    FROM crediarioreceber cr
    JOIN pessoa pf ON pf.id = cr.pessoaid
    LEFT JOIN recebimentocrediario rc ON rc.id = cr.recebimentocrediarioid
    LEFT JOIN caixa cx ON cx.id = rc.caixaid
    WHERE pf.nome ILIKE 'FORMULA%' AND cr.unidadenegocioid = ANY($1::bigint[])
      AND cr.dataemissao >= now() - ($2 || ' days')::interval
    ORDER BY cr.dataemissao DESC LIMIT 500`, [unis, dias]);

  const ctrlStmt = db.prepare('SELECT status, responsavel_nome, obs, atualizado_em FROM formulas_controle WHERE empresa_id=? AND crediario_id=?');
  const lojaNome = uni => (db.prepare('SELECT nome FROM lojas WHERE erp_unidadenegocio_id=?').get(uni) || {}).nome || String(uni);

  const PRAZO_DIAS = 3; // após o pagamento: 3 dias p/ ficar pronto E entregue (inclui 2 dias de entrega)
  const agora = Date.now();
  const diasDe = d => d ? Math.floor((agora - new Date(d).getTime()) / 86400000) : 0;
  let formulas = rows.map(r => {
    const { cliente, telefone } = parseObs(r.observacao);
    const ctrl = ctrlStmt.get(empresaId, String(r.id));
    const statusEntrega = ctrl ? ctrl.status : 'aguardando';
    const dias = diasDe(r.dataemissao);
    const finalizada = statusEntrega === 'entregue' || statusEntrega === 'cancelado';
    const diasRestantes = PRAZO_DIAS - dias;
    return {
      id: String(r.id), formula: r.formula, cliente, telefone, observacao: r.observacao,
      valor: Number(r.valor) || 0, dataEmissao: r.dataemissao, loja: lojaNome(Number(r.uni)),
      lancou: r.lancou, forma: r.forma || null, caixa: r.caixa, caixaOperador: r.caixa_operador, recebidoEm: r.recebido_em,
      pago: r.status === 'B',
      statusEntrega, responsavel: ctrl ? ctrl.responsavel_nome : null,
      ctrlObs: ctrl ? ctrl.obs : null, atualizadoEm: ctrl ? ctrl.atualizado_em : null,
      dias, prazoDias: PRAZO_DIAS, diasRestantes, atrasada: !finalizada && diasRestantes < 0,
    };
  });
  if (status) formulas = formulas.filter(f => f.statusEntrega === status);
  const resumo = { total: formulas.length, atrasadas: formulas.filter(f => f.atrasada).length };
  for (const st of ['aguardando', 'chegou', 'avisado', 'entregue']) resumo[st] = formulas.filter(f => f.statusEntrega === st).length;
  return { erp: true, formulas, resumo, prazoDias: PRAZO_DIAS };
}

module.exports = { listarFormulas };
