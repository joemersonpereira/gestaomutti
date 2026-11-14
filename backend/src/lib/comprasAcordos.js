// Acordos comerciais do comprador — fornecedor + valor + evidência; validação da diretoria.
// Só os VALIDADOS contam no indicador "Acordos comerciais" do Meu Setor de Compras.
const db = require('../db/connection');
const { randomUUID } = require('crypto');

function add(emp, { comprador_id, fornecedor, valor, descricao, evidencia, evidencia_nome, ano, mes } = {}, usuario) {
  if (!comprador_id) throw new Error('Comprador não informado.');
  if (!fornecedor || !String(fornecedor).trim()) throw new Error('Informe o fornecedor.');
  const now = new Date();
  const a = Number(ano) || now.getFullYear(), m = Number(mes) || (now.getMonth() + 1);
  // evidência é um data URI (data:mime;base64,...). Limita tamanho pra não estourar.
  const b64 = (evidencia && /^data:[^;]+;base64,/.test(evidencia)) ? String(evidencia).slice(0, 8000000) : null;
  const id = randomUUID();
  db.prepare(`INSERT INTO compras_acordo (id, empresa_id, comprador_id, ano, mes, fornecedor, valor, descricao, evidencia_nome, evidencia_b64, status, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'pendente', ?)`)
    .run(id, emp, comprador_id, a, m, String(fornecedor).trim().slice(0, 200), valor != null && valor !== '' ? Number(valor) : null,
      (descricao || '').toString().slice(0, 1000) || null, (evidencia_nome || '').toString().slice(0, 200) || null, b64, usuario?.nome || null);
  return { ok: true, id };
}

function list(emp, { comprador_id, ano, mes, status } = {}) {
  const w = ['a.empresa_id=?']; const p = [emp];
  if (comprador_id) { w.push('a.comprador_id=?'); p.push(comprador_id); }
  if (ano) { w.push('a.ano=?'); p.push(Number(ano)); }
  if (mes) { w.push('a.mes=?'); p.push(Number(mes)); }
  if (status) { w.push('a.status=?'); p.push(status); }
  const itens = db.prepare(`SELECT a.id, a.comprador_id, c.nome comprador_nome, a.ano, a.mes, a.fornecedor, a.valor, a.descricao,
      a.evidencia_nome, (a.evidencia_b64 IS NOT NULL) tem_evidencia, a.status, a.criado_por, a.criado_em, a.validado_por, a.validado_em, a.obs_validacao
    FROM compras_acordo a LEFT JOIN colaboradores c ON c.id=a.comprador_id
    WHERE ${w.join(' AND ')} ORDER BY a.criado_em DESC`).all(...p)
    .map(x => ({ ...x, tem_evidencia: !!x.tem_evidencia }));
  return { itens };
}

function evidencia(emp, id) {
  const r = db.prepare('SELECT evidencia_b64, evidencia_nome FROM compras_acordo WHERE id=? AND empresa_id=?').get(id, emp);
  return r || null;
}

function validar(emp, id, { status, obs } = {}, usuario) {
  const st = status === 'validado' ? 'validado' : status === 'recusado' ? 'recusado' : null;
  if (!st) throw new Error('Status inválido (validado/recusado).');
  const r = db.prepare('SELECT 1 FROM compras_acordo WHERE id=? AND empresa_id=?').get(id, emp);
  if (!r) throw new Error('Acordo não encontrado.');
  db.prepare(`UPDATE compras_acordo SET status=?, validado_por=?, validado_em=datetime('now'), obs_validacao=? WHERE id=? AND empresa_id=?`)
    .run(st, usuario?.nome || null, (obs || '').toString().slice(0, 500) || null, id, emp);
  return { ok: true };
}

function remover(emp, id, usuario) {
  // comprador remove o próprio enquanto pendente; gestão remove qualquer.
  const r = db.prepare('SELECT criado_por, status, comprador_id FROM compras_acordo WHERE id=? AND empresa_id=?').get(id, emp);
  if (!r) return { ok: true };
  db.prepare('DELETE FROM compras_acordo WHERE id=? AND empresa_id=?').run(id, emp);
  return { ok: true };
}

// quantos acordos VALIDADOS o comprador tem no mês (alimenta o indicador do Meu Setor)
function countValidados(emp, comprador_id, ano, mes) {
  try {
    const r = db.prepare("SELECT COUNT(*) n FROM compras_acordo WHERE empresa_id=? AND comprador_id=? AND ano=? AND mes=? AND status='validado'").get(emp, comprador_id, Number(ano), Number(mes));
    return Number(r && r.n) || 0;
  } catch (e) { return 0; }
}

module.exports = { add, list, evidencia, validar, remover, countValidados };
